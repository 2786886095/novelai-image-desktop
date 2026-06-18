import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';

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
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) await context.read<AppState>().setWorkbenchPath(picked.path);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: [
        IconButton(onPressed: () => _pick(context), icon: const Icon(Icons.image)),
      ]),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
        children: [
          _WorkbenchPreview(onPick: () => _pick(context)),
          const SizedBox(height: 16),
          if (kind == ToolPageKind.inpaint) const _InpaintPanel(),
          if (kind == ToolPageKind.upscale) const _UpscalePanel(),
          if (kind == ToolPageKind.postprocess) const _PostPanel(),
          const SizedBox(height: 12),
          Text(state.status),
        ],
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
              Image.file(File(work.filePath), fit: BoxFit.contain)
            else
              Center(
                child: FilledButton.icon(onPressed: onPick, icon: const Icon(Icons.image), label: const Text('加载工作台图片')),
              ),
          ],
        ),
      ),
    );
  }
}

class _InpaintPanel extends StatefulWidget {
  const _InpaintPanel();

  @override
  State<_InpaintPanel> createState() => _InpaintPanelState();
}

class _InpaintPanelState extends State<_InpaintPanel> {
  final strokes = <List<Offset>>[];
  double brush = 28;

  void _addPoint(Offset p) {
    setState(() {
      if (strokes.isEmpty) strokes.add([]);
      strokes.last.add(p);
    });
  }

  Future<Uint8List> _exportMask(Size size) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.black);
    final paint = Paint()
      ..color = Colors.white
      ..strokeWidth = brush
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final stroke in strokes) {
      for (var i = 1; i < stroke.length; i++) {
        canvas.drawLine(stroke[i - 1], stroke[i], paint);
      }
      if (stroke.length == 1) canvas.drawCircle(stroke.first, brush / 2, Paint()..color = Colors.white);
    }
    final picture = recorder.endRecording();
    final image = await picture.toImage(size.width.round().clamp(1, 2048), size.height.round().clamp(1, 2048));
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data!.buffer.asUint8List();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            DropdownButtonFormField<String>(
              value: state.inpaintModel,
              decoration: const InputDecoration(labelText: '重绘模型', border: OutlineInputBorder()),
              items: naiInpaintModels.map((m) => DropdownMenuItem(value: m.value, child: Text(m.label))).toList(),
              onChanged: (v) {
                if (v != null) {
                  state.inpaintModel = v;
                  state.markChanged();
                }
              },
            ),
            const SizedBox(height: 12),
            Text('画白色区域 = 需要重绘；黑色区域 = 保留。笔刷 ${brush.round()}'),
            Slider(value: brush, min: 8, max: 96, divisions: 22, onChanged: (v) => setState(() => brush = v)),
            AspectRatio(
              aspectRatio: 1,
              child: LayoutBuilder(builder: (context, box) {
                final size = Size(box.maxWidth, box.maxHeight);
                return GestureDetector(
                  onPanStart: (d) => setState(() => strokes.add([d.localPosition])),
                  onPanUpdate: (d) => _addPoint(d.localPosition),
                  child: DecoratedBox(
                    decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.outlineVariant), borderRadius: BorderRadius.circular(12)),
                    child: CustomPaint(painter: _MaskPainter(strokes, brush), size: size),
                  ),
                );
              }),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => setState(strokes.clear), icon: const Icon(Icons.clear), label: const Text('清空蒙版'))),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: state.busy || state.workbenchImage == null
                      ? null
                      : () async {
                          final box = context.findRenderObject() as RenderBox?;
                          final width = box?.size.width ?? 1024;
                          final mask = await _exportMask(Size(width, width));
                          if (context.mounted) await context.read<AppState>().inpaint(mask);
                        },
                  icon: const Icon(Icons.brush),
                  label: const Text('执行重绘'),
                ),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}

class _MaskPainter extends CustomPainter {
  final List<List<Offset>> strokes;
  final double brush;
  _MaskPainter(this.strokes, this.brush);
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = Colors.black.withOpacity(0.22));
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.72)
      ..strokeWidth = brush
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    for (final stroke in strokes) {
      for (var i = 1; i < stroke.length; i++) {
        canvas.drawLine(stroke[i - 1], stroke[i], paint);
      }
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
            segments: const [ButtonSegment(value: 2, label: Text('2x')), ButtonSegment(value: 4, label: Text('4x'))],
            selected: {s.upscaleScale},
            onSelectionChanged: (v) {
              s.upscaleScale = v.first;
              s.markChanged();
            },
          ),
          const SizedBox(height: 12),
          SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: s.busy || s.workbenchImage == null ? null : s.upscale, icon: const Icon(Icons.open_in_full), label: const Text('开始超分'))),
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
            decoration: const InputDecoration(labelText: '后期工具', border: OutlineInputBorder()),
            items: directorTools.map((t) => DropdownMenuItem(value: t.value, child: Text(t.label))).toList(),
            onChanged: (v) {
              if (v != null) {
                s.directorTool = v;
                s.markChanged();
              }
            },
          ),
          if (s.directorTool == 'colorize') ...[
            const SizedBox(height: 12),
            TextFormField(initialValue: s.augmentOptions.colorizePrompt, decoration: const InputDecoration(labelText: '上色提示词', border: OutlineInputBorder()), onChanged: (v) => s.augmentOptions.colorizePrompt = v),
          ],
          if (s.directorTool == 'emotion') ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: s.augmentOptions.emotion,
              decoration: const InputDecoration(labelText: '表情', border: OutlineInputBorder()),
              items: emotionOptions.map((e) => DropdownMenuItem(value: e.value, child: Text(e.label))).toList(),
              onChanged: (v) {
                if (v != null) {
                  s.augmentOptions.emotion = v;
                  s.markChanged();
                }
              },
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: s.busy || s.workbenchImage == null ? null : s.augment, icon: const Icon(Icons.tune), label: const Text('执行后期处理'))),
        ]),
      ),
    );
  }
}

