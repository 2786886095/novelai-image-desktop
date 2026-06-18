import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../services/nai_api.dart';
import '../state/app_state.dart';

class GenerateScreen extends StatelessWidget {
  const GenerateScreen({super.key});

  Future<void> _pickImage(BuildContext context) async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) await context.read<AppState>().setWorkbenchPath(picked.path);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final p = state.params;
    return Scaffold(
      appBar: AppBar(
        title: Text(state.workbenchImage == null ? '文生图 / 图生图' : '图生图 · 已加载基图'),
        actions: [
          TextButton.icon(
            onPressed: state.refreshAnlas,
            icon: const Icon(Icons.refresh),
            label: Text(state.account.hasToken ? '${state.account.tierName ?? "API"} · ${state.account.anlasBalance ?? "—"}' : '未配置'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
        children: [
          _PreviewCard(onPick: () => _pickImage(context)),
          const SizedBox(height: 12),
          _TagSearchBox(onInsert: (tag) => state.setParam((x) => x.positivePrompt = _appendTag(x.positivePrompt, tag))),
          const SizedBox(height: 12),
          TextFormField(
            key: ValueKey('style-${p.stylePrompt.hashCode}'),
            initialValue: p.stylePrompt,
            decoration: const InputDecoration(labelText: '风格提示词', border: OutlineInputBorder()),
            onChanged: (v) => state.setParam((x) => x.stylePrompt = v),
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: ValueKey('pos-${p.positivePrompt.hashCode}'),
            initialValue: p.positivePrompt,
            maxLines: 5,
            decoration: const InputDecoration(labelText: '正面提示词', border: OutlineInputBorder(), hintText: '1girl, masterpiece, ...'),
            onChanged: (v) => state.setParam((x) => x.positivePrompt = v),
          ),
          const SizedBox(height: 12),
          TextFormField(
            key: ValueKey('neg-${p.negativePrompt.hashCode}'),
            initialValue: p.negativePrompt,
            maxLines: 3,
            decoration: const InputDecoration(labelText: '负面提示词', border: OutlineInputBorder()),
            onChanged: (v) => state.setParam((x) => x.negativePrompt = v),
          ),
          const SizedBox(height: 16),
          _ParamControls(),
          const SizedBox(height: 16),
          _CharacterPrompts(),
          if (state.workbenchImage != null) ...[
            const SizedBox(height: 16),
            _I2IControls(),
          ],
        ],
      ),
      bottomNavigationBar: const _RunBar(),
    );
  }

  static String _appendTag(String prompt, String tag) {
    final t = tag.trim();
    if (t.isEmpty) return prompt;
    final base = prompt.trim();
    return base.isEmpty ? '$t, ' : '$base, $t, ';
  }
}

class _PreviewCard extends StatelessWidget {
  final VoidCallback onPick;
  const _PreviewCard({required this.onPick});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final current = state.current;
    final work = state.workbenchImage;
    final path = work?.filePath ?? current?.filePath;
    return AspectRatio(
      aspectRatio: 1,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (path != null && File(path).existsSync())
              Image.file(File(path), fit: BoxFit.contain)
            else
              const Center(child: Text('生成结果 / 工作台图片会显示在这里')),
            if (state.busy) Container(color: Colors.black38, child: const Center(child: CircularProgressIndicator())),
            Positioned(
              right: 8,
              bottom: 8,
              child: Wrap(
                spacing: 8,
                children: [
                  FilledButton.tonalIcon(onPressed: onPick, icon: const Icon(Icons.image), label: const Text('加载图片')),
                  if (work != null) FilledButton.tonalIcon(onPressed: state.clearWorkbench, icon: const Icon(Icons.close), label: const Text('文生图')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagSearchBox extends StatefulWidget {
  final ValueChanged<String> onInsert;
  const _TagSearchBox({required this.onInsert});

  @override
  State<_TagSearchBox> createState() => _TagSearchBoxState();
}

class _TagSearchBoxState extends State<_TagSearchBox> {
  final ctrl = TextEditingController();
  List<TagSuggestion> tags = [];

  @override
  void dispose() {
    ctrl.dispose();
    super.dispose();
  }

  Future<void> _search(String value) async {
    if (value.trim().isEmpty) {
      setState(() => tags = []);
      return;
    }
    final result = await context.read<AppState>().suggestTags(value);
    if (mounted) setState(() => tags = result);
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: ctrl,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), labelText: 'Tag / 灵感胶囊搜索', hintText: '输入 g、蓝眼、教室...', border: OutlineInputBorder()),
              onChanged: _search,
            ),
            if (tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: tags.map((t) => ActionChip(label: Text(t.description == null ? t.tag : '${t.tag} · ${t.description}'), onPressed: () => widget.onInsert(t.tag))).toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ParamControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final p = context.watch<AppState>().params;
    return Column(
      children: [
        DropdownButtonFormField<String>(
          value: p.model,
          decoration: const InputDecoration(labelText: '模型', border: OutlineInputBorder()),
          isExpanded: true,
          items: naiModels.map((m) => DropdownMenuItem(value: m.value, child: Text(m.label, overflow: TextOverflow.ellipsis))).toList(),
          onChanged: (v) => v == null ? null : state.setParam((x) => x.model = v),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: sizePresets.map((s) {
            final selected = p.width == s.width && p.height == s.height;
            return ChoiceChip(label: Text(s.label), selected: selected, onSelected: (_) => state.setParam((x) => (x..width = s.width..height = s.height)));
          }).toList(),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: p.sampler,
          decoration: const InputDecoration(labelText: '采样器', border: OutlineInputBorder()),
          isExpanded: true,
          items: naiSamplers.map((s) => DropdownMenuItem(value: s.value, child: Text(s.label))).toList(),
          onChanged: (v) => v == null ? null : state.setParam((x) => x.sampler = v),
        ),
        _Slider(label: 'Steps', value: p.steps.toDouble(), min: 1, max: 50, divisions: 49, onChanged: (v) => state.setParam((x) => x.steps = v.round()), display: '${p.steps}'),
        _Slider(label: 'CFG Scale', value: p.cfgScale, min: 0, max: 12, divisions: 48, onChanged: (v) => state.setParam((x) => x.cfgScale = double.parse(v.toStringAsFixed(1))), display: p.cfgScale.toStringAsFixed(1)),
        Row(
          children: [
            Expanded(
              child: TextFormField(
                key: ValueKey('seed-${p.seed}'),
                initialValue: p.seed == 0 ? '' : '${p.seed}',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Seed（空 = 随机）', border: OutlineInputBorder()),
                onChanged: (v) => state.setParam((x) => x.seed = int.tryParse(v) ?? 0),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                key: ValueKey('batch-${context.watch<AppState>().batchCount}'),
                initialValue: '${context.watch<AppState>().batchCount}',
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '批量', border: OutlineInputBorder()),
                onChanged: (v) => state.setBatchCount(int.tryParse(v) ?? 1),
              ),
            ),
          ],
        ),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Quality Toggle（质量词）'), value: p.qualityToggle, onChanged: (v) => state.setParam((x) => x.qualityToggle = v)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Variety+'), value: p.variety, onChanged: (v) => state.setParam((x) => x.variety = v)),
      ],
    );
  }
}

class _I2IControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            const Align(alignment: Alignment.centerLeft, child: Text('图生图参数', style: TextStyle(fontWeight: FontWeight.bold))),
            _Slider(label: 'Strength（重绘幅度）', value: s.i2i.strength, min: 0, max: 1, divisions: 20, display: s.i2i.strength.toStringAsFixed(2), onChanged: (v) { s.i2i.strength = v; s.markChanged(); }),
            _Slider(label: 'Noise（噪声）', value: s.i2i.noise, min: 0, max: 0.99, divisions: 20, display: s.i2i.noise.toStringAsFixed(2), onChanged: (v) { s.i2i.noise = v; s.markChanged(); }),
          ],
        ),
      ),
    );
  }
}

class _CharacterPrompts extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(child: Text('角色提示词（最多 6 个）', style: TextStyle(fontWeight: FontWeight.bold))),
                TextButton.icon(onPressed: s.addCharacter, icon: const Icon(Icons.add), label: const Text('添加')),
              ],
            ),
            for (var i = 0; i < s.extras.charCaptions.length; i++) _CharCard(index: i),
          ],
        ),
      ),
    );
  }
}

class _CharCard extends StatelessWidget {
  final int index;
  const _CharCard({required this.index});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final c = s.extras.charCaptions[index];
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        children: [
          TextFormField(
            initialValue: c.prompt,
            decoration: InputDecoration(labelText: '角色 ${index + 1}', border: const OutlineInputBorder(), suffixIcon: IconButton(icon: const Icon(Icons.delete), onPressed: () => s.removeCharacter(index))),
            onChanged: (v) {
              c.prompt = v;
              s.markChanged();
            },
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('指定位置'),
            value: c.useCoords,
            onChanged: (v) {
              c.useCoords = v ?? false;
              s.markChanged();
            },
          ),
          if (c.useCoords)
            Row(children: [
              Expanded(child: _Slider(label: 'X', value: c.x, min: 0, max: 1, divisions: 20, display: c.x.toStringAsFixed(2), onChanged: (v) { c.x = v; s.markChanged(); })),
              Expanded(child: _Slider(label: 'Y', value: c.y, min: 0, max: 1, divisions: 20, display: c.y.toStringAsFixed(2), onChanged: (v) { c.y = v; s.markChanged(); })),
            ]),
        ],
      ),
    );
  }
}

class _Slider extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String display;
  final ValueChanged<double> onChanged;
  const _Slider({required this.label, required this.value, required this.min, required this.max, required this.divisions, required this.display, required this.onChanged});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(label), Text(display, style: const TextStyle(fontWeight: FontWeight.bold))]),
        Slider(value: value.clamp(min, max), min: min, max: max, divisions: divisions, label: display, onChanged: onChanged),
      ]);
}

class _RunBar extends StatelessWidget {
  const _RunBar();
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(state.status, maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: state.busy || !state.account.hasToken ? null : state.runTextOrImage,
                icon: Icon(state.workbenchImage == null ? Icons.play_arrow : Icons.image_search),
                label: Text(state.workbenchImage == null ? (state.batchCount > 1 ? '生成 ${state.batchCount} 张' : '生成图片') : '使用当前图片图生图'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
