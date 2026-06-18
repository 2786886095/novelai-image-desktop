import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';

enum InspectPageKind { reverse, convert }

class InspectScreen extends StatelessWidget {
  final InspectPageKind kind;
  const InspectScreen({super.key, required this.kind});

  Future<void> _pick(BuildContext context) async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) await context.read<AppState>().setWorkbenchPath(picked.path);
  }

  @override
  Widget build(BuildContext context) {
    return kind == InspectPageKind.reverse ? _ReversePanel(onPick: () => _pick(context)) : const _ConvertPanel();
  }
}

// Keep a persistent controller in sync with an external state string without
// clobbering the caret while the user types (only rewrite when they differ).
void _syncController(TextEditingController controller, String value) {
  if (controller.text == value) return;
  controller.value = TextEditingValue(
    text: value,
    selection: TextSelection.collapsed(offset: value.length),
  );
}

class _ReversePanel extends StatefulWidget {
  final VoidCallback onPick;
  const _ReversePanel({required this.onPick});

  @override
  State<_ReversePanel> createState() => _ReversePanelState();
}

class _ReversePanelState extends State<_ReversePanel> {
  final _resultCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _resultCtrl.text = context.read<AppState>().reverseResult;
  }

  @override
  void dispose() {
    _resultCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final path = s.workbenchImage?.filePath;
    _syncController(_resultCtrl, s.reverseResult);
    return Scaffold(
      appBar: AppBar(title: const Text('AI 反推提示词'), actions: [IconButton(onPressed: widget.onPick, icon: const Icon(Icons.image))]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Card(
              clipBehavior: Clip.antiAlias,
              child: path != null && File(path).existsSync()
                  ? Image.file(File(path), fit: BoxFit.contain)
                  : Center(child: FilledButton.icon(onPressed: widget.onPick, icon: const Icon(Icons.image), label: const Text('选择反推图片'))),
            ),
          ),
          const SizedBox(height: 12),
          _ModeSelector(value: s.reverseMode, onChanged: (m) { s.reverseMode = m; s.markChanged(); }),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: s.busy || s.workbenchImage == null ? null : s.reversePrompt, icon: const Icon(Icons.visibility), label: const Text('开始反推')),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: const InputDecoration(labelText: '反推结果', border: OutlineInputBorder()),
            onChanged: (v) => s.reverseResult = v,
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: s.reverseResult.trim().isEmpty ? null : () => s.applyPrompt(s.reverseResult), icon: const Icon(Icons.send), label: const Text('复用到生成面板')),
          const SizedBox(height: 8),
          Text(s.status),
        ],
      ),
    );
  }
}

class _ConvertPanel extends StatefulWidget {
  const _ConvertPanel();

  @override
  State<_ConvertPanel> createState() => _ConvertPanelState();
}

class _ConvertPanelState extends State<_ConvertPanel> {
  final _inputCtrl = TextEditingController();
  final _resultCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final s = context.read<AppState>();
    _inputCtrl.text = s.convertInput;
    _resultCtrl.text = s.convertResult;
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _resultCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    _syncController(_inputCtrl, s.convertInput);
    _syncController(_resultCtrl, s.convertResult);
    return Scaffold(
      appBar: AppBar(title: const Text('中文 / 自然语言转换')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _inputCtrl,
            maxLines: 5,
            decoration: const InputDecoration(labelText: '输入描述', hintText: '一个黑发白衬衫男孩坐着画画...', border: OutlineInputBorder()),
            onChanged: (v) => s.convertInput = v,
          ),
          const SizedBox(height: 12),
          _ModeSelector(value: s.convertMode, onChanged: (m) { s.convertMode = m; s.markChanged(); }),
          const SizedBox(height: 12),
          FilledButton.icon(onPressed: s.busy || s.convertInput.trim().isEmpty ? null : s.convertPrompt, icon: const Icon(Icons.translate), label: const Text('开始转换')),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: const InputDecoration(labelText: '转换结果', border: OutlineInputBorder()),
            onChanged: (v) => s.convertResult = v,
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(onPressed: s.convertResult.trim().isEmpty ? null : () => s.applyPrompt(s.convertResult), icon: const Icon(Icons.send), label: const Text('复用到生成面板')),
          const SizedBox(height: 8),
          Text(s.status),
        ],
      ),
    );
  }
}

class _ModeSelector extends StatelessWidget {
  final ReversePromptMode value;
  final ValueChanged<ReversePromptMode> onChanged;
  const _ModeSelector({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<ReversePromptMode>(
      segments: ReversePromptMode.values.map((m) => ButtonSegment(value: m, label: Text(m.label))).toList(),
      selected: {value},
      onSelectionChanged: (v) => onChanged(v.first),
    );
  }
}
