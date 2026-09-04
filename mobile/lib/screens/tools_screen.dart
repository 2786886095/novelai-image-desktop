import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../billing/anlas.dart';
import '../i18n/app_locales.dart';
import '../inpaint/inpaint_mask.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../ui/quality_preset_control.dart';
import '../ui/studio_shell.dart';
import '../ui/zoomable_image.dart';
import '../ui/before_after_compare.dart';
import 'generate_screen.dart' show PromptEditor;
import 'inpaint_mask_editor.dart';

enum ToolPageKind { inpaint, upscale, postprocess }

class ToolsScreen extends StatelessWidget {
  final ToolPageKind kind;
  const ToolsScreen({super.key, required this.kind});

  String titleFor(Object? language) => switch (kind) {
        ToolPageKind.inpaint => mobileUiTextFor(language, 'tools.inpaintTitle'),
        ToolPageKind.upscale => mobileUiTextFor(language, 'tools.upscaleTitle'),
        ToolPageKind.postprocess =>
          mobileUiTextFor(language, 'tools.postTitle'),
      };

  Future<void> _pick(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) {
      await context.read<AppState>().setWorkbenchPath(picked.path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    return Scaffold(
      appBar: AppBar(title: Text(titleFor(language)), actions: [
        IconButton(
            onPressed: () => _pick(context), icon: const Icon(Icons.image)),
      ]),
      body: StudioContent(
        child: ListView(
          key: const ValueKey('tools-page-scroll'),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
          children: [
            if (kind != ToolPageKind.inpaint) ...[
              _WorkbenchPreview(onPick: () => _pick(context)),
              const SizedBox(height: 16),
            ],
            if (kind == ToolPageKind.inpaint)
              _InpaintPanel(key: ValueKey(state.workbenchImage?.filePath)),
            if (kind == ToolPageKind.upscale) const _UpscalePanel(),
            if (kind == ToolPageKind.postprocess) const _PostprocessPanel(),
            const SizedBox(height: 12),
            Text(state.status),
          ],
        ),
      ),
    );
  }
}

class _WorkbenchPreview extends StatelessWidget {
  final VoidCallback onPick;
  const _WorkbenchPreview({required this.onPick});

  @override
  Widget build(BuildContext context) {
    final work = context.watch<AppState>().workbenchImage;
    final language = context.watch<AppState>().settings.language;
    return AspectRatio(
      aspectRatio: 1,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (work != null && File(work.filePath).existsSync())
              ZoomableImage(
                image: Image.file(File(work.filePath), fit: BoxFit.contain),
              )
            else
              Center(
                child: FilledButton.icon(
                    onPressed: onPick,
                    icon: const Icon(Icons.image),
                    label:
                        Text(mobileUiTextFor(language, 'tools.loadWorkbench'))),
              ),
          ],
        ),
      ),
    );
  }
}

class _InpaintPanel extends StatefulWidget {
  const _InpaintPanel({super.key});

  @override
  State<_InpaintPanel> createState() => _InpaintPanelState();
}

class _InpaintPanelState extends State<_InpaintPanel> {
  final strokes = <InpaintStroke>[];
  InpaintMaskRaster? _maskRaster;
  double brush = 4;
  double imageOpacity = 1;
  double maskOpacity = 0.72;
  Color maskColor = Colors.white;
  bool inverted = false;
  bool _showSummaryPreview = true;
  InpaintBrushShape brushShape = InpaintBrushShape.round;

  InpaintMaskRaster _rasterFor(WorkingImage workbench) {
    final width = math.max(1, workbench.width);
    final height = math.max(1, workbench.height);
    final current = _maskRaster;
    if (current != null &&
        current.sourceWidth == width &&
        current.sourceHeight == height) {
      return current;
    }
    return _maskRaster = InpaintMaskRaster(
      sourceWidth: width,
      sourceHeight: height,
    )..rebuild(strokes);
  }

  Future<void> _runInpaint(AppState state) async {
    final image = state.workbenchImage;
    if (image == null || (strokes.isEmpty && !inverted)) return;
    final mask = await renderInpaintMask(
      strokes: strokes,
      width: image.width,
      height: image.height,
      inverted: inverted,
    );
    if (!mounted) return;
    await context.read<AppState>().inpaint(mask);
    // A successful run replaces workbenchImage with the new result — the old
    // mask strokes no longer apply to it and must not linger on the canvas.
    if (mounted && state.workbenchImage?.filePath != image.filePath) {
      setState(() {
        strokes.clear();
        _maskRaster?.clear();
        inverted = false;
      });
    }
  }

  // Shows the exact binary selection over the source image so coverage can be
  // verified without losing visual context before a paid request.
  Future<void> _previewMask(WorkingImage workbench) async {
    if (strokes.isEmpty && !inverted) return;
    final raster = _rasterFor(workbench);
    final language = context.read<AppState>().settings.language;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                mobileUiTextFor(language, 'tools.maskPreviewTitle'),
                style: const TextStyle(color: Colors.white),
              ),
            ),
            Flexible(
              child: InteractiveViewer(
                maxScale: 8,
                child: AspectRatio(
                  aspectRatio: raster.sourceWidth / raster.sourceHeight,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.file(
                        File(workbench.filePath),
                        fit: BoxFit.fill,
                      ),
                      CustomPaint(
                        key: const ValueKey('inpaint-mask-exact-preview'),
                        painter: _InpaintMaskRasterPainter(
                          raster: raster,
                          inverted: inverted,
                          color: maskColor.withOpacity(maskOpacity),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: Text(mobileUiTextFor(language, 'common.close')),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openEditor(WorkingImage workbench) async {
    final language = context.read<AppState>().settings.language;
    final result = await Navigator.of(context).push<InpaintMaskEditResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => InpaintMaskEditor(
          image: workbench,
          language: language,
          initialStrokes: strokes,
          initialInverted: inverted,
          initialBrush: brush,
          initialImageOpacity: imageOpacity,
          initialMaskOpacity: maskOpacity,
          initialMaskColor: maskColor,
          initialBrushShape: brushShape,
        ),
      ),
    );
    if (!mounted || result == null) return;
    final nextStrokes = copyInpaintStrokes(result.strokes);
    final nextRaster = InpaintMaskRaster(
      sourceWidth: math.max(1, workbench.width),
      sourceHeight: math.max(1, workbench.height),
    )..rebuild(nextStrokes);
    setState(() {
      strokes
        ..clear()
        ..addAll(nextStrokes);
      _maskRaster = nextRaster;
      inverted = result.inverted;
      brush = result.brush;
      imageOpacity = result.imageOpacity;
      maskOpacity = result.maskOpacity;
      maskColor = result.maskColor;
      brushShape = result.brushShape;
    });
  }

  Widget _buildMaskSummary(AppState state, WorkingImage workbench) {
    final language = state.settings.language;
    final colors = Theme.of(context).colorScheme;
    final aspect = workbench.width > 0 && workbench.height > 0
        ? workbench.width / workbench.height
        : 1.0;
    final availableWidth = math.max(1.0, MediaQuery.sizeOf(context).width - 56);
    final previewHeight = (availableWidth / aspect).clamp(160.0, 320.0);
    final raster = _rasterFor(workbench);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      color: colors.surfaceContainer,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '${strokes.isEmpty && !inverted ? mobileUiTextFor(language, 'tools.maskNotEdited') : mobileUiTextFor(language, 'tools.maskReady')} · '
                    '${mobileUiFormatFor(language, 'tools.maskStrokeCount', {
                          'count': strokes.length
                        })}',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
                IconButton(
                  key: const ValueKey('toggle-inpaint-summary-preview'),
                  visualDensity: VisualDensity.compact,
                  tooltip: mobileUiTextFor(
                    language,
                    _showSummaryPreview ? 'tools.hideMask' : 'tools.showMask',
                  ),
                  onPressed: () => setState(
                    () => _showSummaryPreview = !_showSummaryPreview,
                  ),
                  icon: Icon(
                    _showSummaryPreview
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: _buildToolbar(state, workbench),
          ),
          if (_showSummaryPreview)
            SizedBox(
              height: previewHeight,
              child: LayoutBuilder(builder: (context, constraints) {
                final fitted = applyBoxFit(
                  BoxFit.contain,
                  Size(workbench.width.toDouble(), workbench.height.toDouble()),
                  constraints.biggest,
                ).destination;
                return Center(
                  child: SizedBox(
                    width: fitted.width,
                    height: fitted.height,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        RepaintBoundary(
                          child: Image.file(
                            File(workbench.filePath),
                            fit: BoxFit.fill,
                            filterQuality: FilterQuality.medium,
                          ),
                        ),
                        IgnorePointer(
                          child: RepaintBoundary(
                            child: CustomPaint(
                              key: const ValueKey(
                                  'inpaint-mask-summary-preview'),
                              painter: _InpaintMaskRasterPainter(
                                raster: raster,
                                inverted: inverted,
                                color: maskColor.withOpacity(maskOpacity),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
        ],
      ),
    );
  }

  Widget _buildToolbar(AppState state, WorkingImage? workbench) {
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final hasMask = strokes.isNotEmpty || inverted;
    final compactStyle = OutlinedButton.styleFrom(
      visualDensity: VisualDensity.compact,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    );
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        OutlinedButton.icon(
          key: const ValueKey('edit-inpaint-mask'),
          style: compactStyle,
          onPressed: workbench == null ? null : () => _openEditor(workbench),
          icon: const Icon(Icons.draw_outlined),
          label: Text(t('tools.editMask')),
        ),
        OutlinedButton.icon(
          key: const ValueKey('preview-inpaint-mask'),
          style: compactStyle,
          onPressed: workbench == null || !hasMask
              ? null
              : () => _previewMask(workbench),
          icon: const Icon(Icons.preview_outlined),
          label: Text(t('tools.previewMask')),
        ),
        OutlinedButton.icon(
          key: const ValueKey('clear-inpaint-mask'),
          style: compactStyle,
          onPressed: !hasMask
              ? null
              : () => setState(() {
                    strokes.clear();
                    _maskRaster?.clear();
                    inverted = false;
                  }),
          icon: const Icon(Icons.delete_outline),
          label: Text(t('tools.clearMask')),
        ),
        FilledButton.icon(
          key: const ValueKey('run-inpaint'),
          style: FilledButton.styleFrom(
            visualDensity: VisualDensity.compact,
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          ),
          onPressed: state.busy || workbench == null || !hasMask
              ? null
              : () => _runInpaint(state),
          icon: const Icon(Icons.brush),
          label: Text(t('tools.runInpaint')),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final workbench = state.workbenchImage;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PromptEditor(
              label: t('tools.stylePrompt'),
              value: state.params.stylePrompt,
              lockKind: 'style',
              onChanged: (v) => state.setParam((p) => p.stylePrompt = v),
            ),
            const SizedBox(height: 12),
            PromptEditor(
              label: t('tools.positivePrompt'),
              value: state.inpaintPositivePrompt,
              maxLines: 4,
              hintText: t('tools.positiveHint'),
              showRelatedTags: true,
              showTextTools: true,
              onChanged: (v) {
                state.inpaintPositivePrompt = v;
                state.markChanged();
              },
            ),
            const SizedBox(height: 12),
            PromptEditor(
              label: t('tools.negativePrompt'),
              value: state.params.negativePrompt,
              maxLines: 3,
              lockKind: 'negative',
              onChanged: (v) => state.setParam((p) => p.negativePrompt = v),
            ),
            const SizedBox(height: 16),
            Text(
              language.startsWith('zh') ? '生成后下次重绘使用' : 'Next redraw source',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                segments: [
                  ButtonSegment(
                    value: 'original',
                    icon: const Icon(Icons.photo_outlined),
                    label: Text(language.startsWith('zh') ? '始终使用原图' : 'Original'),
                  ),
                  ButtonSegment(
                    value: 'latest',
                    icon: const Icon(Icons.auto_awesome_outlined),
                    label: Text(language.startsWith('zh') ? '使用最新结果' : 'Latest result'),
                  ),
                ],
                selected: {state.inpaintSourceMode},
                onSelectionChanged: (selection) =>
                    state.setInpaintSourceMode(selection.first),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              language.startsWith('zh')
                  ? '默认保留最初加载的图片连续重绘；切换来源会清空旧蒙版，完成后自动打开前后对比。'
                  : 'Keeps the original by default. Changing source clears the old mask and opens comparison after redraw.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: state.inpaintModel,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: t('tools.inpaintModel'),
                border: const OutlineInputBorder(),
              ),
              items: naiInpaintModels
                  .map((model) => DropdownMenuItem(
                        value: model.value,
                        child: Text(
                          localizedNaiOptionLabel(
                              language, model.value, model.label),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ))
                  .toList(),
              onChanged: (value) {
                if (value != null) {
                  state.inpaintModel = value;
                  state.markChanged();
                }
              },
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                onPressed: () {
                  setState(() {
                    brush = 4;
                    maskColor = Colors.white;
                    brushShape = InpaintBrushShape.round;
                  });
                  state
                    ..inpaintModel = 'nai-diffusion-5-full-inpainting'
                    ..inpaintStrength = 1
                    ..inpaintNoise = 0
                    ..markChanged();
                },
                icon: const Icon(Icons.restart_alt, size: 18),
                label: Text(switch (language) {
                  'zh-TW' => '恢復官網預設',
                  'en-US' => 'Restore official defaults',
                  'ja-JP' => '公式初期値に戻す',
                  'ko-KR' => '공식 기본값 복원',
                  _ => '恢复官网默认',
                }),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(t('tools.inpaintStrength')),
                Text(state.inpaintStrength.toStringAsFixed(2)),
              ],
            ),
            Slider(
              value: state.inpaintStrength,
              min: 0.1,
              max: 1,
              divisions: 90,
              onChanged: (value) {
                state.inpaintStrength = value;
                state.markChanged();
              },
            ),
            Text(
              t(state.inpaintStrength < 0.6
                  ? 'tools.inpaintStrengthLowHint'
                  : state.inpaintStrength > 0.9
                      ? 'tools.inpaintStrengthFullHint'
                      : 'tools.inpaintStrengthHighHint'),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: state.inpaintStrength < 0.6
                        ? Theme.of(context).colorScheme.error
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            _ToolQuoteBar(quote: state.inpaintAnlasQuote),
            const SizedBox(height: 12),
            const _RedrawParams(),
            const SizedBox(height: 12),
            if (state.comparisonBefore case final before?)
              if (state.comparisonAfter case final after?) ...[
                Row(
                  children: [
                    Expanded(
                      child: Text(t('tools.beforeAfter'),
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    IconButton(
                      tooltip: t('tools.closeCompare'),
                      onPressed: state.clearComparison,
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                SizedBox(
                  height: 420,
                  child: BeforeAfterCompare(
                    beforePath: before.filePath,
                    afterPath: after.filePath,
                  ),
                ),
                const SizedBox(height: 12),
              ],
            if (workbench == null)
              SizedBox(
                height: 240,
                child: Center(child: Text(t('tools.noInpaintImage'))),
              )
            else ...[
              // Actions and preview share one compact card; controls remain
              // before the image and the comparison can be collapsed.
              _buildMaskSummary(state, workbench),
            ],
          ],
        ),
      ),
    );
  }
}

class _InpaintMaskRasterPainter extends CustomPainter {
  final InpaintMaskRaster raster;
  final bool inverted;
  final Color color;

  const _InpaintMaskRasterPainter({
    required this.raster,
    required this.inverted,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) => raster.paintSelection(
        canvas,
        size,
        inverted: inverted,
        color: color,
      );

  @override
  bool shouldRepaint(covariant _InpaintMaskRasterPainter oldDelegate) => true;
}

// Generation parameters for redraw, mirroring the generate screen (model is the
// dedicated inpaint model above; size comes from the source image).
class _RedrawParams extends StatelessWidget {
  const _RedrawParams();

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final p = context.watch<AppState>().params;
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        title: Text(t('tools.advancedParams')),
        shape: const Border(),
        collapsedShape: const Border(),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            value: p.sampler,
            isExpanded: true,
            decoration: InputDecoration(
                labelText: t('tools.sampler'),
                border: const OutlineInputBorder()),
            items: naiSamplers
                .map((s) => DropdownMenuItem(
                    value: s.value,
                    child: Text(
                        localizedNaiOptionLabel(language, s.value, s.label))))
                .toList(),
            onChanged: (v) =>
                v == null ? null : state.setParam((x) => x.sampler = v),
          ),
          const SizedBox(height: 8),
          _ParamSlider(
            label: 'Steps',
            value: p.steps.toDouble(),
            min: 1,
            max: 50,
            divisions: 49,
            display: '${p.steps}',
            onChanged: (v) => state.setParam((x) => x.steps = v.round()),
          ),
          _ParamSlider(
            label: 'CFG Scale',
            value: p.cfgScale,
            min: 1,
            max: 10,
            divisions: 45,
            display: p.cfgScale.toStringAsFixed(1),
            onChanged: (v) => state.setParam(
                (x) => x.cfgScale = double.parse(v.toStringAsFixed(1))),
          ),
          _ParamSlider(
            label: 'CFG Rescale',
            value: p.cfgRescale,
            min: 0,
            max: 1,
            divisions: 100,
            display: p.cfgRescale.toStringAsFixed(2),
            onChanged: (v) => state.setParam(
                (x) => x.cfgRescale = double.parse(v.toStringAsFixed(2))),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<int>(
            value: p.ucPreset,
            isExpanded: true,
            decoration: InputDecoration(
                labelText: t('tools.ucPreset'),
                border: const OutlineInputBorder()),
            items: ucPresets
                .map((o) => DropdownMenuItem(
                    value: int.parse(o.value),
                    child: Text(
                        localizedNaiOptionLabel(language, o.value, o.label))))
                .toList(),
            onChanged: (v) =>
                v == null ? null : state.setParam((x) => x.ucPreset = v),
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: [
              ButtonSegment(
                  value: 'random',
                  icon: const Icon(Icons.casino_outlined),
                  label: Text(t('tools.randomSeed'))),
              ButtonSegment(
                  value: 'fixed',
                  icon: const Icon(Icons.lock_outline),
                  label: Text(t('tools.fixedSeed'))),
            ],
            selected: {p.seedMode},
            onSelectionChanged: (sel) =>
                state.setParam((x) => x.seedMode = sel.first),
          ),
          if (p.seedMode == 'fixed') ...[
            const SizedBox(height: 8),
            TextFormField(
              initialValue: p.seed == 0 ? '' : '${p.seed}',
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                  labelText: 'Seed', border: OutlineInputBorder()),
              onChanged: (v) =>
                  state.setParam((x) => x.seed = int.tryParse(v.trim()) ?? 0),
            ),
          ],
          const SizedBox(height: 10),
          QualityPresetControl(
            language: language,
            model: p.model,
            value: p.qualityPreset,
            transparentBackground: p.transparentBackground,
            onChanged: (value) => state.setParam((x) => x
              ..qualityPreset = value
              ..qualityToggle = value != 'none'),
            onTransparentChanged: (value) =>
                state.setParam((x) => x.transparentBackground = value),
          ),
        ],
      ),
    );
  }
}

class _ParamSlider extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String display;
  final ValueChanged<double> onChanged;
  const _ParamSlider({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.display,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label), Text(display)],
          ),
          Slider(
            value: value.clamp(min, max).toDouble(),
            min: min,
            max: max,
            divisions: divisions,
            onChanged: onChanged,
          ),
        ],
      );
}

class _UpscalePanel extends StatelessWidget {
  const _UpscalePanel();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          Text('超分只扩大输出并补足清晰度，不进行第二次创意扩散；画面变化通常小于“增强”。2×/4×会改变分辨率。',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 2, label: Text('2x')),
              ButtonSegment(value: 4, label: Text('4x'))
            ],
            selected: {s.upscaleScale},
            onSelectionChanged: (v) {
              s.upscaleScale = v.first;
              s.markChanged();
            },
          ),
          const SizedBox(height: 12),
          _ToolQuoteBar(quote: s.upscaleAnlasQuote),
          const SizedBox(height: 12),
          SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                  onPressed:
                      s.busy || s.workbenchImage == null ? null : s.upscale,
                  icon: const Icon(Icons.open_in_full),
                  label:
                      Text(mobileUiTextFor(language, 'tools.startUpscale')))),
        ]),
      ),
    );
  }
}

class _PostprocessPanel extends StatefulWidget {
  const _PostprocessPanel();
  @override
  State<_PostprocessPanel> createState() => _PostprocessPanelState();
}

class _PostprocessPanelState extends State<_PostprocessPanel> {
  String mode = 'enhance';
  @override
  Widget build(BuildContext context) => Column(children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(
                value: 'enhance',
                icon: Icon(Icons.auto_awesome),
                label: Text('增强')),
            ButtonSegment(
                value: 'upscale',
                icon: Icon(Icons.open_in_full),
                label: Text('超分')),
            ButtonSegment(
                value: 'director', icon: Icon(Icons.tune), label: Text('导演工具')),
          ],
          selected: {mode},
          onSelectionChanged: (value) => setState(() => mode = value.first),
        ),
        const SizedBox(height: 12),
        if (mode == 'enhance') const _EnhancePanel(),
        if (mode == 'upscale') const _UpscalePanel(),
        if (mode == 'director') const _DirectorPanel(),
      ]);
}

class _EnhancePanel extends StatelessWidget {
  const _EnhancePanel();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final source = s.workbenchImage;
    final target = source == null
        ? null
        : adaptiveNaiImageSize(
            source.width * s.enhanceScale,
            source.height * s.enhanceScale,
            fallbackWidth: source.width,
            fallbackHeight: source.height,
          );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('增强是第二次扩散处理，会补充细节；幅度越高，越可能改变线条、质感和局部结构。',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          _ParamSlider(
            label: '增强幅度',
            value: s.enhanceMagnitude.toDouble(),
            min: 1,
            max: 10,
            divisions: 9,
            display: '${s.enhanceMagnitude}',
            onChanged: (value) {
              s.enhanceMagnitude = value.round();
              s.markChanged();
            },
          ),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 1, label: Text('1× 保持分辨率')),
              ButtonSegment(value: 2, label: Text('2× 同时放大')),
            ],
            selected: {s.enhanceScale},
            onSelectionChanged: (value) {
              s.enhanceScale = value.first;
              s.markChanged();
            },
          ),
          if (source != null && target != null) ...[
            const SizedBox(height: 8),
            Text('${source.width}×${source.height} → ${target.$1}×${target.$2}',
                style: Theme.of(context).textTheme.bodySmall),
          ],
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: s.busy || source == null ? null : s.enhance,
            icon: const Icon(Icons.auto_awesome),
            label: Text('增强图像 ${s.enhanceScale}×'),
          ),
        ]),
      ),
    );
  }
}

class _DirectorPanel extends StatelessWidget {
  const _DirectorPanel();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          DropdownButtonFormField<String>(
            value: s.directorTool,
            decoration: InputDecoration(
                labelText: t('tools.directorTool'),
                border: const OutlineInputBorder()),
            items: directorTools
                .map((t) => DropdownMenuItem(
                    value: t.value,
                    child:
                        Text(mobileUiTextFor(language, 'director.${t.value}'))))
                .toList(),
            onChanged: (v) {
              if (v != null) {
                s.directorTool = v;
                s.markChanged();
              }
            },
          ),
          if (s.directorTool == 'colorize') ...[
            const SizedBox(height: 12),
            TextFormField(
                initialValue: s.augmentOptions.colorizePrompt,
                decoration: InputDecoration(
                    labelText: t('tools.colorizePrompt'),
                    border: const OutlineInputBorder()),
                onChanged: (v) => s.augmentOptions.colorizePrompt = v),
          ],
          if (s.directorTool == 'emotion') ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: s.augmentOptions.emotion,
              decoration: InputDecoration(
                  labelText: t('tools.emotion'),
                  border: const OutlineInputBorder()),
              items: emotionOptions
                  .map((e) => DropdownMenuItem(
                      value: e.value,
                      child: Text(
                          mobileUiTextFor(language, 'emotion.${e.value}'))))
                  .toList(),
              onChanged: (v) {
                if (v != null) {
                  s.augmentOptions.emotion = v;
                  s.markChanged();
                }
              },
            ),
            _DirectorSlider(
              label: t('tools.emotionLevel'),
              value: s.augmentOptions.emotionLevel,
              onChanged: (value) {
                s.augmentOptions.emotionLevel = value;
                s.markChanged();
              },
            ),
          ],
          _DirectorSlider(
            label: t('tools.defry'),
            value: s.augmentOptions.defry,
            onChanged: (value) {
              s.augmentOptions.defry = value;
              s.markChanged();
            },
          ),
          if (s.workbenchImage case final image?)
            if (image.width * image.height > 1024 * 1024)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  mobileUiFormatFor(language, 'tools.sizeProtection',
                      {'width': image.width, 'height': image.height}),
                ),
              ),
          const SizedBox(height: 12),
          _ToolQuoteBar(quote: s.directorAnlasQuote),
          const SizedBox(height: 12),
          SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                  onPressed:
                      s.busy || s.workbenchImage == null ? null : s.augment,
                  icon: const Icon(Icons.tune),
                  label: Text(t('tools.runPost')))),
        ]),
      ),
    );
  }
}

class _DirectorSlider extends StatelessWidget {
  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  const _DirectorSlider({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [Text(label), Text(value.toStringAsFixed(0))],
          ),
          Slider(
            value: value.clamp(0, 5),
            min: 0,
            max: 5,
            divisions: 5,
            label: value.toStringAsFixed(0),
            onChanged: onChanged,
          ),
        ],
      );
}

class _ToolQuoteBar extends StatelessWidget {
  final AnlasQuote quote;

  const _ToolQuoteBar({required this.quote});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final language = context.watch<AppState>().settings.language;
    final warning = quote.insufficient || !quote.ok;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: warning ? colors.errorContainer : colors.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          children: [
            Icon(
              warning ? Icons.warning_amber_rounded : Icons.toll_outlined,
              size: 18,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                quote.amount == null
                    ? quote.message
                    : mobileUiFormatFor(language, 'tools.prechargeFormula',
                        {'amount': quote.amount}),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
