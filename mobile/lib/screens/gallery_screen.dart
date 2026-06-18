import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';

class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key});

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  String group = '';
  final groupCtrl = TextEditingController();

  @override
  void dispose() {
    groupCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final groups = state.groups;
    final history = state.history.where((h) => group.isEmpty || h.groupId == group).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('历史与素材')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Column(children: [
              Row(children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: group,
                    decoration: const InputDecoration(labelText: '分组', border: OutlineInputBorder()),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('全部')),
                      ...groups.map((g) => DropdownMenuItem(value: g.id, child: Text(g.name))),
                    ],
                    onChanged: (v) => setState(() => group = v ?? ''),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(onPressed: () => _createGroup(context), icon: const Icon(Icons.create_new_folder)),
              ]),
            ]),
          ),
          Expanded(
            child: history.isEmpty
                ? const Center(child: Text('暂无历史记录'))
                : GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8),
                    itemCount: history.length,
                    itemBuilder: (context, i) {
                      final item = history[i];
                      final file = File(item.filePath);
                      return GestureDetector(
                        onTap: () => _openDetail(context, item),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: file.existsSync()
                              ? Image.file(file, fit: BoxFit.cover)
                              : Container(color: Theme.of(context).colorScheme.surfaceContainerHighest, child: const Icon(Icons.broken_image)),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  void _createGroup(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('创建分组'),
        content: TextField(controller: groupCtrl, decoration: const InputDecoration(labelText: '分组名称')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
            onPressed: () {
              context.read<AppState>().createGroup(groupCtrl.text);
              groupCtrl.clear();
              Navigator.pop(ctx);
            },
            child: const Text('创建'),
          ),
        ],
      ),
    );
  }

  void _openDetail(BuildContext context, HistoryItem item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final file = File(item.filePath);
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.82,
          builder: (_, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.all(16),
            children: [
              if (file.existsSync()) ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.file(file)),
              const SizedBox(height: 16),
              _MetaRow('功能', item.feature),
              _MetaRow('模型', item.model),
              _MetaRow('种子', '${item.seed}'),
              _MetaRow('尺寸', '${item.width}×${item.height}'),
              _MetaRow('时间', item.createdAt.replaceFirst('T', ' ').split('.').first),
              const SizedBox(height: 8),
              const Text('提示词', style: TextStyle(fontWeight: FontWeight.bold)),
              SelectableText(item.prompt.isEmpty ? '（无）' : item.prompt),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.workspaces),
                    label: const Text('设为工作台'),
                    onPressed: () {
                      context.read<AppState>().setWorkbenchFromHistory(item);
                      Navigator.pop(ctx);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.replay),
                    label: const Text('复用参数'),
                    onPressed: () {
                      final params = GenerateParams.fromJson(item.params);
                      context.read<AppState>().setParam((p) {
                        final next = params;
                        p
                          ..model = next.model
                          ..stylePrompt = next.stylePrompt
                          ..positivePrompt = next.positivePrompt
                          ..negativePrompt = next.negativePrompt
                          ..width = next.width
                          ..height = next.height
                          ..steps = next.steps
                          ..cfgScale = next.cfgScale
                          ..sampler = next.sampler
                          ..seed = next.seed;
                      });
                      Navigator.pop(ctx);
                    },
                  ),
                  FilledButton.tonalIcon(icon: const Icon(Icons.share), label: const Text('分享'), onPressed: () => Share.shareXFiles([XFile(item.filePath)], text: item.prompt)),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('删除'),
                    onPressed: () {
                      context.read<AppState>().deleteHistory(item.id);
                      Navigator.pop(ctx);
                    },
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _MetaRow extends StatelessWidget {
  final String label;
  final String value;
  const _MetaRow(this.label, this.value);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [SizedBox(width: 64, child: Text(label, style: const TextStyle(color: Colors.grey))), Expanded(child: Text(value))]),
      );
}
