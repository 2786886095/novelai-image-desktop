import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../prompts/prompt_mode.dart';
import '../state/app_state.dart';
import '../ui/zoomable_image.dart';

enum InspectPageKind { reverse, convert }

class InspectScreen extends StatelessWidget {
  final InspectPageKind kind;
  const InspectScreen({super.key, required this.kind});

  Future<void> _pick(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) {
      await context.read<AppState>().setWorkbenchPath(picked.path);
    }
  }

  @override
  Widget build(BuildContext context) {
    return kind == InspectPageKind.reverse
        ? _ReversePanel(onPick: () => _pick(context))
        : const _ConvertPanel();
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
  final _hintCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final state = context.read<AppState>();
    _resultCtrl.text = state.reverseResult;
    _hintCtrl.text = state.reverseHint;
  }

  @override
  void dispose() {
    _resultCtrl.dispose();
    _hintCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final path = s.workbenchImage?.filePath;
    _syncController(_resultCtrl, s.reverseResult);
    return Scaffold(
      appBar: AppBar(title: const Text('AI 反推提示词'), actions: [
        IconButton(onPressed: widget.onPick, icon: const Icon(Icons.image))
      ]),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Card(
              clipBehavior: Clip.antiAlias,
              child: path != null && File(path).existsSync()
                  ? ZoomableImage(
                      image: Image.file(File(path), fit: BoxFit.contain),
                    )
                  : Center(
                      child: FilledButton.icon(
                          onPressed: widget.onPick,
                          icon: const Icon(Icons.image),
                          label: const Text('选择反推图片'))),
            ),
          ),
          const SizedBox(height: 12),
          if (s.workbenchImportedParams != null) ...[
            FilledButton.tonalIcon(
              onPressed: s.applyWorkbenchMetadata,
              icon: const Icon(Icons.settings_backup_restore),
              label: const Text('从图片元数据还原生成参数'),
            ),
            const SizedBox(height: 12),
          ],
          _ModeSelector(
              value: s.reverseMode,
              onChanged: (m) {
                s.reverseMode = m;
                s.markChanged();
              }),
          const SizedBox(height: 12),
          DropdownButtonFormField<ReversePromptScope>(
            value: s.reverseScope,
            decoration: const InputDecoration(
              labelText: '反推范围',
              border: OutlineInputBorder(),
            ),
            items: ReversePromptScope.values
                .map((scope) => DropdownMenuItem(
                      value: scope,
                      child: Text(scope.label),
                    ))
                .toList(),
            onChanged: (scope) {
              if (scope == null) return;
              s.reverseScope = scope;
              s.markChanged();
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _hintCtrl,
            decoration: const InputDecoration(
              labelText: '主体提示（可选）',
              hintText: '例如：只分析右侧角色、这是一件特殊服装',
              border: OutlineInputBorder(),
            ),
            onChanged: (value) => s.reverseHint = value,
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('这是网络 / 游戏 / 动漫角色'),
            subtitle: const Text('开启后同时生成角色名版与特征版'),
            value: s.reverseKnownCharacter,
            onChanged: (value) {
              s.reverseKnownCharacter = value ?? false;
              s.reversePromptVariants = null;
              s.markChanged();
            },
          ),
          FilledButton.icon(
              onPressed:
                  s.busy || s.workbenchImage == null ? null : s.reversePrompt,
              icon: const Icon(Icons.visibility),
              label: const Text('开始反推')),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: const InputDecoration(
                labelText: '反推结果', border: OutlineInputBorder()),
            onChanged: (v) => s.reverseResult = v,
          ),
          _ResultTemplateChips(
            value: s.reverseResult,
            onApply: (value) {
              s.reverseResult = value;
              s.reversePromptVariants = null;
              s.markChanged();
            },
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: s.reverseResult.trim().isEmpty
                  ? null
                  : () => s.applyPrompt(s.reverseResult),
              icon: const Icon(Icons.send),
              label: const Text('复用到生成面板')),
          if (s.reversePromptVariants case final variants?) ...[
            const SizedBox(height: 12),
            _VariantResults(variants: variants),
          ],
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
            decoration: const InputDecoration(
                labelText: '输入描述',
                hintText: '一个黑发白衬衫男孩坐着画画...',
                border: OutlineInputBorder()),
            onChanged: (v) => s.convertInput = v,
          ),
          const SizedBox(height: 12),
          _ModeSelector(
              value: s.convertMode,
              onChanged: (m) {
                s.convertMode = m;
                s.markChanged();
              }),
          const SizedBox(height: 12),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('这是网络 / 游戏 / 动漫角色'),
            subtitle: const Text('开启后同时生成角色名版与特征版'),
            value: s.convertKnownCharacter,
            onChanged: (value) {
              s.convertKnownCharacter = value ?? false;
              s.convertResultVariants = null;
              s.markChanged();
            },
          ),
          FilledButton.icon(
              onPressed: s.busy || s.convertInput.trim().isEmpty
                  ? null
                  : s.convertPrompt,
              icon: const Icon(Icons.translate),
              label: const Text('开始转换')),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: const InputDecoration(
                labelText: '转换结果', border: OutlineInputBorder()),
            onChanged: (v) => s.convertResult = v,
          ),
          _ResultTemplateChips(
            value: s.convertResult,
            onApply: (value) {
              s.convertResult = value;
              s.convertResultVariants = null;
              s.markChanged();
            },
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: s.convertResult.trim().isEmpty
                  ? null
                  : () => s.applyPrompt(s.convertResult),
              icon: const Icon(Icons.send),
              label: const Text('复用到生成面板')),
          if (s.convertResultVariants case final variants?) ...[
            const SizedBox(height: 12),
            _VariantResults(variants: variants),
          ],
          const SizedBox(height: 8),
          Text(s.status),
        ],
      ),
    );
  }
}

class _ResultTemplateChips extends StatelessWidget {
  final String value;
  final ValueChanged<String> onApply;

  const _ResultTemplateChips({
    required this.value,
    required this.onApply,
  });

  @override
  Widget build(BuildContext context) {
    final templates = context.watch<AppState>().settings.promptShortcuts;
    if (value.trim().isEmpty || templates.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          const Text('应用模板'),
          ...templates.map(
            (template) => ActionChip(
              label: Text(template.name),
              onPressed: () {
                final merged = [
                  template.prefix.trim(),
                  value.trim(),
                  template.suffix.trim(),
                ].where((part) => part.isNotEmpty).join(', ');
                onApply(merged);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _VariantResults extends StatelessWidget {
  final PromptVariants variants;
  const _VariantResults({required this.variants});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _VariantCard(
          title: '角色名版',
          subtitle: '模型认识该角色时使用',
          prompt: variants.namePrompt,
        ),
        const SizedBox(height: 8),
        _VariantCard(
          title: '特征版',
          subtitle: '模型库没有该角色时使用',
          prompt: variants.featurePrompt,
        ),
      ],
    );
  }
}

class _VariantCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String prompt;
  const _VariantCard({
    required this.title,
    required this.subtitle,
    required this.prompt,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            SelectableText(prompt.isEmpty ? 'AI 未返回此版本' : prompt),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: prompt.isEmpty
                  ? null
                  : () => context.read<AppState>().applyPrompt(prompt),
              icon: const Icon(Icons.send_outlined),
              label: const Text('复用到生成面板'),
            ),
          ],
        ),
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
      segments: ReversePromptMode.values
          .map((m) => ButtonSegment(value: m, label: Text(m.label)))
          .toList(),
      selected: {value},
      onSelectionChanged: (v) => onChanged(v.first),
    );
  }
}
