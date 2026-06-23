import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../billing/anlas.dart';
import '../inpaint/inpaint_mask.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';
import '../ui/zoomable_image.dart';
import '../ui/before_after_compare.dart';
import 'generate_screen.dart' show PromptEditor;

enum ToolPageKind { inpaint, upscale, postprocess }

class ToolsScreen extends StatelessWidget {
  final ToolPageKind kind;
  const ToolsScreen({super.key, required this.kind});

  String get title => switch (kind) {
        ToolPageKind.inpaint => '局部重绘',
        ToolPageKind.upscale => '云端超分',
        ToolPageKind.postprocess => 'Director Tools 后期',
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
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: [
        IconButton(
            onPressed: () => _pick(context), icon: const Icon(Icons.image)),
      ]),
      body: StudioContent(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
          children: [
            if (kind != ToolPageKind.inpaint) ...[
              _WorkbenchPreview(onPick: () => _pick(context)),
              const SizedBox(height: 16),
            ],
            if (kind == ToolPageKind.inpaint)
              _InpaintPanel(key: ValueKey(state.workbenchImage?.filePath)),
            if (kind == ToolPageKind.upscale) const _UpscalePanel(),
            if (kind == ToolPageKind.postprocess) const _PostPanel(),
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
                    label: const Text('加载工作台图片')),
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
  double brush = 28;
  double scale = 1;
  Offset offset = Offset.zero;
  Size canvasSize = Size.zero;
  bool showMask = true;
  bool drawing = false;
  bool transforming = false;
  double lastGestureScale = 1;
  Offset lastFocalPoint = Offset.zero;

  Offset? _toNormalized(Offset localPoint) {
    if (canvasSize.isEmpty || scale <= 0) return null;
    final scenePoint = (localPoint - offset) / scale;
    return normalizeCanvasPoint(scenePoint, canvasSize);
  }

  void _startDrawing(Offset point) {
    final normalized = _toNormalized(point);
    if (normalized == null || canvasSize.shortestSide <= 0) return;
    setState(() {
      strokes.add(InpaintStroke(
        brushFraction: brush / canvasSize.shortestSide,
        points: [normalized],
      ));
    });
  }

  void _continueDrawing(Offset point) {
    if (!drawing || strokes.isEmpty) return;
    final normalized = _toNormalized(point);
    if (normalized == null) return;
    setState(() => strokes.last.points.add(normalized));
  }

  void _handleScaleStart(ScaleStartDetails details) {
    drawing = details.pointerCount == 1;
    transforming = false;
    lastGestureScale = 1;
    lastFocalPoint = details.localFocalPoint;
    if (drawing) _startDrawing(details.localFocalPoint);
  }

  void _handleScaleUpdate(ScaleUpdateDetails details) {
    if (details.pointerCount == 1 && drawing && !transforming) {
      _continueDrawing(details.localFocalPoint);
      return;
    }
    if (details.pointerCount < 2) return;
    drawing = false;
    if (!transforming) {
      transforming = true;
      lastGestureScale = details.scale;
      lastFocalPoint = details.localFocalPoint;
      return;
    }

    final relativeScale =
        lastGestureScale == 0 ? 1.0 : details.scale / lastGestureScale;
    final nextScale = (scale * relativeScale).clamp(1.0, 6.0).toDouble();
    final sceneAtPreviousFocal = (lastFocalPoint - offset) / scale;
    final nextOffset =
        details.localFocalPoint - sceneAtPreviousFocal * nextScale;
    setState(() {
      scale = nextScale;
      offset = _clampOffset(nextOffset, nextScale);
    });
    lastGestureScale = details.scale;
    lastFocalPoint = details.localFocalPoint;
  }

  Offset _clampOffset(Offset value, double nextScale) {
    final minX = canvasSize.width * (1 - nextScale);
    final minY = canvasSize.height * (1 - nextScale);
    return Offset(
      value.dx.clamp(minX, 0.0).toDouble(),
      value.dy.clamp(minY, 0.0).toDouble(),
    );
  }

  void _resetView() {
    setState(() {
      scale = 1;
      offset = Offset.zero;
    });
  }

  Future<void> _runInpaint(AppState state) async {
    final image = state.workbenchImage;
    if (image == null || strokes.isEmpty) return;
    final mask = await renderInpaintMask(
      strokes: strokes,
      width: image.width,
      height: image.height,
    );
    if (mounted) await context.read<AppState>().inpaint(mask);
  }

  // Renders the exact binary mask that will be sent (white = repaint area) and
  // shows it full-screen so the user can verify coverage before paying.
  Future<void> _previewMask(WorkingImage workbench) async {
    if (strokes.isEmpty) return;
    final mask = await renderInpaintMask(
      strokes: strokes,
      width: workbench.width,
      height: workbench.height,
    );
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                '将发送的遮罩 · 白色区域会被重绘',
                style: TextStyle(color: Colors.white),
              ),
            ),
            Flexible(
              child: InteractiveViewer(
                maxScale: 8,
                child: Image.memory(mask, fit: BoxFit.contain),
              ),
            ),
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('关闭'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCanvas(BuildContext context, WorkingImage workbench) {
    return LayoutBuilder(
      builder: (context, box) {
        final maxHeight =
            math.min(MediaQuery.sizeOf(context).height * 0.74, 900.0);
        final fitted = applyBoxFit(
          BoxFit.contain,
          Size(
            math.max(1, workbench.width).toDouble(),
            math.max(1, workbench.height).toDouble(),
          ),
          Size(box.maxWidth, maxHeight),
        ).destination;
        canvasSize = fitted;
        return Center(
          child: SizedBox(
            width: fitted.width,
            height: fitted.height,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onScaleStart: _handleScaleStart,
                onScaleUpdate: _handleScaleUpdate,
                onScaleEnd: (_) {
                  drawing = false;
                  transforming = false;
                },
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.black,
                    border: Border.all(
                      color: Theme.of(context).colorScheme.outlineVariant,
                    ),
                  ),
                  child: Transform(
                    alignment: Alignment.topLeft,
                    transform: Matrix4.identity()
                      ..translate(offset.dx, offset.dy)
                      ..scale(scale),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.file(File(workbench.filePath), fit: BoxFit.fill),
                        CustomPaint(
                          painter: _MaskPainter(strokes, showMask),
                          size: fitted,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildToolbar(AppState state, WorkingImage? workbench) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        IconButton.outlined(
          tooltip: '撤回上一笔',
          onPressed:
              strokes.isEmpty ? null : () => setState(strokes.removeLast),
          icon: const Icon(Icons.undo),
        ),
        IconButton.outlined(
          tooltip: '清空蒙版',
          onPressed: strokes.isEmpty ? null : () => setState(strokes.clear),
          icon: const Icon(Icons.delete_outline),
        ),
        IconButton.outlined(
          tooltip: showMask ? '隐藏蒙版' : '显示蒙版',
          onPressed: () => setState(() => showMask = !showMask),
          icon: Icon(showMask ? Icons.visibility : Icons.visibility_off),
        ),
        IconButton.outlined(
          tooltip: '预览将发送的遮罩',
          onPressed: workbench == null || strokes.isEmpty
              ? null
              : () => _previewMask(workbench),
          icon: const Icon(Icons.preview_outlined),
        ),
        IconButton.outlined(
          tooltip: '复位缩放',
          onPressed: scale == 1 && offset == Offset.zero ? null : _resetView,
          icon: const Icon(Icons.fit_screen),
        ),
        FilledButton.icon(
          onPressed: state.busy || workbench == null || strokes.isEmpty
              ? null
              : () => _runInpaint(state),
          icon: const Icon(Icons.brush),
          label: const Text('执行重绘'),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final workbench = state.workbenchImage;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PromptEditor(
              label: '风格提示词',
              value: state.params.stylePrompt,
              lockKind: 'style',
              onChanged: (v) => state.setParam((p) => p.stylePrompt = v),
            ),
            const SizedBox(height: 12),
            PromptEditor(
              label: '正面提示词',
              value: state.params.positivePrompt,
              maxLines: 4,
              hintText: '描述要把涂抹区域重绘成什么',
              showRelatedTags: true,
              showTextTools: true,
              onChanged: (v) => state.setParam((p) => p.positivePrompt = v),
            ),
            const SizedBox(height: 12),
            PromptEditor(
              label: '负面提示词',
              value: state.params.negativePrompt,
              maxLines: 3,
              lockKind: 'negative',
              onChanged: (v) => state.setParam((p) => p.negativePrompt = v),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              value: state.inpaintModel,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: '重绘模型',
                border: OutlineInputBorder(),
              ),
              items: naiInpaintModels
                  .map((model) => DropdownMenuItem(
                        value: model.value,
                        child: Text(
                          model.label,
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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('重绘强度'),
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
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('重绘噪声'),
                Text(state.inpaintNoise.toStringAsFixed(2)),
              ],
            ),
            Slider(
              value: state.inpaintNoise,
              min: 0,
              max: 0.99,
              divisions: 99,
              onChanged: (value) {
                state.inpaintNoise = value;
                state.markChanged();
              },
            ),
            _ToolQuoteBar(quote: state.inpaintAnlasQuote),
            const SizedBox(height: 12),
            const _RedrawParams(),
            const SizedBox(height: 12),
            if (state.comparisonBefore case final before?)
              if (state.comparisonAfter case final after?) ...[
                Row(
                  children: [
                    const Expanded(
                      child: Text('重绘前后对比',
                          style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    IconButton(
                      tooltip: '关闭对比',
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
            Text(
              '单指涂抹，双指缩放或移动。白色区域将被重绘。笔刷 ${brush.round()}',
            ),
            Slider(
              value: brush,
              min: 8,
              max: 96,
              divisions: 22,
              onChanged: (value) => setState(() => brush = value),
            ),
            if (workbench == null)
              const SizedBox(
                height: 240,
                child: Center(child: Text('请先从右上角加载需要重绘的图片')),
              )
            else
              _buildCanvas(context, workbench),
            const SizedBox(height: 12),
            _buildToolbar(state, workbench),
          ],
        ),
      ),
    );
  }
}

// Generation parameters for redraw, mirroring the generate screen (model is the
// dedicated inpaint model above; size comes from the source image).
class _RedrawParams extends StatelessWidget {
  const _RedrawParams();

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final p = context.watch<AppState>().params;
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        title: const Text('高级参数'),
        shape: const Border(),
        collapsedShape: const Border(),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            value: p.sampler,
            isExpanded: true,
            decoration: const InputDecoration(
                labelText: '采样器', border: OutlineInputBorder()),
            items: naiSamplers
                .map((s) =>
                    DropdownMenuItem(value: s.value, child: Text(s.label)))
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
            onChanged: (v) => state
                .setParam((x) => x.cfgScale = double.parse(v.toStringAsFixed(1))),
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
            decoration: const InputDecoration(
                labelText: 'UC Preset（负面预设）', border: OutlineInputBorder()),
            items: ucPresets
                .map((o) => DropdownMenuItem(
                    value: int.parse(o.value), child: Text(o.label)))
                .toList(),
            onChanged: (v) =>
                v == null ? null : state.setParam((x) => x.ucPreset = v),
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(
                  value: 'random',
                  icon: Icon(Icons.casino_outlined),
                  label: Text('随机种子')),
              ButtonSegment(
                  value: 'fixed',
                  icon: Icon(Icons.lock_outline),
                  label: Text('固定种子')),
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
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('质量增强（Quality Toggle）'),
            value: p.qualityToggle,
            onChanged: (v) => state.setParam((x) => x.qualityToggle = v),
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

class _MaskPainter extends CustomPainter {
  final List<InpaintStroke> strokes;
  final bool visible;

  _MaskPainter(this.strokes, this.visible);

  @override
  void paint(Canvas canvas, Size size) {
    if (!visible) return;
    canvas.drawRect(
      Offset.zero & size,
      Paint()..color = Colors.black.withOpacity(0.22),
    );
    for (final stroke in strokes) {
      if (stroke.points.isEmpty) continue;
      final width = stroke.brushFraction * size.shortestSide;
      final paint = Paint()
        ..color = Colors.white.withOpacity(0.72)
        ..strokeWidth = width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;
      final points = stroke.points
          .map((point) => Offset(point.dx * size.width, point.dy * size.height))
          .toList(growable: false);
      if (points.length == 1) {
        canvas.drawCircle(
          points.first,
          width / 2,
          Paint()..color = Colors.white.withOpacity(0.72),
        );
        continue;
      }
      final path = Path()..moveTo(points.first.dx, points.first.dy);
      for (final point in points.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _MaskPainter oldDelegate) => true;
}

class _UpscalePanel extends StatelessWidget {
  const _UpscalePanel();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
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
                  label: const Text('开始超分'))),
        ]),
      ),
    );
  }
}

class _PostPanel extends StatelessWidget {
  const _PostPanel();
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(children: [
          DropdownButtonFormField<String>(
            value: s.directorTool,
            decoration: const InputDecoration(
                labelText: '后期工具', border: OutlineInputBorder()),
            items: directorTools
                .map((t) =>
                    DropdownMenuItem(value: t.value, child: Text(t.label)))
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
                decoration: const InputDecoration(
                    labelText: '上色提示词', border: OutlineInputBorder()),
                onChanged: (v) => s.augmentOptions.colorizePrompt = v),
          ],
          if (s.directorTool == 'emotion') ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: s.augmentOptions.emotion,
              decoration: const InputDecoration(
                  labelText: '表情', border: OutlineInputBorder()),
              items: emotionOptions
                  .map((e) =>
                      DropdownMenuItem(value: e.value, child: Text(e.label)))
                  .toList(),
              onChanged: (v) {
                if (v != null) {
                  s.augmentOptions.emotion = v;
                  s.markChanged();
                }
              },
            ),
            _DirectorSlider(
              label: '表情强度',
              value: s.augmentOptions.emotionLevel,
              onChanged: (value) {
                s.augmentOptions.emotionLevel = value;
                s.markChanged();
              },
            ),
          ],
          _DirectorSlider(
            label: 'Defry（去噪强度）',
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
                  '尺寸保护：${image.width}x${image.height} 将先缩至约 100 万像素处理，结果再恢复原尺寸。透明区域会铺白底。',
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
                  label: const Text('执行后期处理'))),
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
                    : '生成前扣费：${quote.amount} Anlas · 公式报价',
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
