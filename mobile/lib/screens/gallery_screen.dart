import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';

class GalleryScreen extends StatelessWidget {
  const GalleryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final history = context.watch<AppState>().history;
    return Scaffold(
      appBar: AppBar(title: const Text('图库')),
      body: history.isEmpty
          ? const Center(child: Text('还没有生成记录'))
          : GridView.builder(
              padding: const EdgeInsets.all(12),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
              ),
              itemCount: history.length,
              itemBuilder: (context, i) {
                final item = history[i];
                final file = File(item.filePath);
                return GestureDetector(
                  onTap: () => _openDetail(context, item),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: file.existsSync()
                        ? Image.file(file, fit: BoxFit.cover)
                        : Container(
                            color: Theme.of(context).colorScheme.surfaceContainerHighest,
                            child: const Icon(Icons.broken_image),
                          ),
                  ),
                );
              },
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
          initialChildSize: 0.7,
          builder: (_, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.all(16),
            children: [
              if (file.existsSync())
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Image.file(file),
                ),
              const SizedBox(height: 16),
              _MetaRow('模型', item.model),
              _MetaRow('种子', '${item.seed}'),
              _MetaRow('尺寸', '${item.width}×${item.height}'),
              _MetaRow('时间', item.createdAt.replaceFirst('T', ' ').split('.').first),
              const SizedBox(height: 8),
              const Text('提示词', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              SelectableText(item.prompt.isEmpty ? '（无）' : item.prompt),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('删除'),
                      onPressed: () {
                        context.read<AppState>().deleteHistory(item.id);
                        Navigator.pop(ctx);
                      },
                    ),
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
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(width: 64, child: Text(label, style: const TextStyle(color: Colors.grey))),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
