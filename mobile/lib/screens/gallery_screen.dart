import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/nai_models.dart';
import '../state/app_state.dart';
import '../ui/zoomable_image.dart';

const _ungroupedFilter = '__ungrouped';

class GalleryScreen extends StatefulWidget {
  const GalleryScreen({super.key});

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  String group = '';
  String date = '';
  bool groupInitialized = false;
  final groupCtrl = TextEditingController();

  @override
  void dispose() {
    groupCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (!groupInitialized) {
      group = state.selectedGroupId;
      groupInitialized = true;
    }
    final groups = state.groups;
    final dates = state.history.map((item) => item.date).toSet().toList()
      ..sort((a, b) => b.compareTo(a));
    final history = state.history
        .where((item) =>
            (group.isEmpty ||
                (group == _ungroupedFilter
                    ? item.groupId == null || item.groupId!.isEmpty
                    : item.groupId == group)) &&
            (date.isEmpty || item.date == date))
        .toList();
    return Scaffold(
      appBar: AppBar(title: const Text('历史与素材')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: date,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: '日期',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: '',
                            child: Text('全部日期'),
                          ),
                          ...dates.map(
                            (value) => DropdownMenuItem(
                              value: value,
                              child: Text(value),
                            ),
                          ),
                        ],
                        onChanged: (value) =>
                            setState(() => date = value ?? ''),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: group,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: '分组',
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          const DropdownMenuItem(
                            value: '',
                            child: Text('全部分组'),
                          ),
                          const DropdownMenuItem(
                            value: _ungroupedFilter,
                            child: Text('未分组'),
                          ),
                          ...groups.map(
                            (item) => DropdownMenuItem(
                              value: item.id,
                              child: Text(
                                item.name,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                        onChanged: (value) {
                          final next = value ?? '';
                          setState(() => group = next);
                          unawaited(state.setActiveHistoryGroup(
                            next == _ungroupedFilter ? '' : next,
                          ));
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: Wrap(
                    spacing: 4,
                    children: [
                      IconButton.filledTonal(
                        tooltip: '创建分组',
                        onPressed: () => _createGroup(context),
                        icon: const Icon(Icons.create_new_folder_outlined),
                      ),
                      PopupMenuButton<String>(
                        tooltip: '分组操作',
                        enabled: group.isNotEmpty && group != _ungroupedFilter,
                        onSelected: (action) {
                          if (action == 'rename') {
                            _renameSelectedGroup(context);
                          }
                          if (action == 'delete') {
                            _deleteSelectedGroup(context);
                          }
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'rename',
                            child: Text('重命名分组'),
                          ),
                          PopupMenuItem(
                            value: 'delete',
                            child: Text('删除分组'),
                          ),
                        ],
                        icon: const Icon(Icons.folder_open_outlined),
                      ),
                      IconButton.filledTonal(
                        tooltip: '导出当前筛选 ZIP',
                        onPressed: history.isEmpty
                            ? null
                            : () => _export(context, history),
                        icon: const Icon(Icons.archive_outlined),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text('${history.length} 张图片'),
            ),
          ),
          Expanded(
            child: history.isEmpty
                ? const Center(child: Text('暂无历史记录'))
                : GridView.builder(
                    padding: const EdgeInsets.all(12),
                    gridDelegate:
                        const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 170,
                      mainAxisExtent: 194,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                    ),
                    itemCount: history.length,
                    itemBuilder: (context, index) =>
                        _HistoryTile(history[index], _openDetail),
                  ),
          ),
        ],
      ),
    );
  }

  Future<void> _createGroup(BuildContext context) async {
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('创建分组'),
        content: TextField(
          controller: groupCtrl,
          autofocus: true,
          decoration: const InputDecoration(labelText: '分组名称'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () async {
              await context.read<AppState>().createGroup(groupCtrl.text);
              groupCtrl.clear();
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: const Text('创建'),
          ),
        ],
      ),
    );
  }

  Future<void> _renameSelectedGroup(BuildContext context) async {
    final state = context.read<AppState>();
    final selected = state.groups.where((item) => item.id == group).firstOrNull;
    if (selected == null) return;
    final value = await _askForName(context, '重命名分组', selected.name);
    if (value != null) await state.renameGroup(selected.id, value);
  }

  Future<void> _deleteSelectedGroup(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除分组'),
        content: const Text('组内图片会保留并移到“未分组”。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await context.read<AppState>().deleteGroup(group);
    if (mounted) setState(() => group = '');
  }

  Future<void> _export(
    BuildContext context,
    List<HistoryItem> items,
  ) async {
    try {
      final state = context.read<AppState>();
      final selected =
          state.groups.where((item) => item.id == group).firstOrNull;
      final path = await state.exportHistory(
        items,
        archiveName: group == _ungroupedFilter
            ? '未分组'
            : selected?.name ?? 'Langbai-NovelAI-Studio',
      );
      await Share.shareXFiles(
        [XFile(path)],
        text: 'Langbai NovelAI Studio 历史导出',
      );
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(error.toString().replaceFirst('Bad state: ', ''))),
        );
      }
    }
  }

  void _openDetail(BuildContext context, HistoryItem item) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        final file = File(item.filePath);
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.82,
          builder: (_, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.all(16),
            children: [
              if (file.existsSync())
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    height: 420,
                    child: ZoomableImage(
                      image: Image.file(file, fit: BoxFit.contain),
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              Text(
                _fileName(item.filePath),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              _MetaRow('功能', item.feature),
              _MetaRow('模型', item.model),
              _MetaRow('种子', '${item.seed}'),
              _MetaRow('尺寸', '${item.width}x${item.height}'),
              _MetaRow(
                '时间',
                item.createdAt.replaceFirst('T', ' ').split('.').first,
              ),
              const SizedBox(height: 8),
              const Text('提示词', style: TextStyle(fontWeight: FontWeight.bold)),
              SelectableText(item.prompt.isEmpty ? '（无）' : item.prompt),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.workspaces_outline),
                    label: const Text('设为工作台'),
                    onPressed: () {
                      context.read<AppState>().setWorkbenchFromHistory(item);
                      Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.replay),
                    label: const Text('复用参数'),
                    onPressed: () {
                      _reuseParams(context, item);
                      Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.drive_file_rename_outline),
                    label: const Text('重命名'),
                    onPressed: () async {
                      await _renameImage(context, item);
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.drive_file_move_outline),
                    label: const Text('移动分组'),
                    onPressed: () async {
                      await _moveImage(context, item);
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.share_outlined),
                    label: const Text('分享'),
                    onPressed: () => Share.shareXFiles(
                      [XFile(item.filePath)],
                      text: item.prompt,
                    ),
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.delete_outline),
                    label: const Text('删除'),
                    onPressed: () async {
                      await context.read<AppState>().deleteHistory(item.id);
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
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

  void _reuseParams(BuildContext context, HistoryItem item) {
    final params = GenerateParams.fromJson(item.params);
    final state = context.read<AppState>();
    state.setParam((current) {
      current
        ..model = params.model
        ..positivePrompt = params.positivePrompt
        ..width = params.width
        ..height = params.height
        ..steps = params.steps
        ..cfgScale = params.cfgScale
        ..cfgRescale = params.cfgRescale
        ..sampler = params.sampler
        ..noiseSchedule = params.noiseSchedule
        ..seed = params.seed
        ..seedMode = params.seedMode
        ..ucPreset = params.ucPreset
        ..qualityToggle = params.qualityToggle
        ..smea = params.smea
        ..smeaDyn = params.smeaDyn
        ..variety = params.variety
        ..fileNamePrefix = params.fileNamePrefix;
      if (!state.settings.lockStylePrompt) {
        current.stylePrompt = params.stylePrompt;
      }
      if (!state.settings.lockNegativePrompt) {
        current.negativePrompt = params.negativePrompt;
      }
    });
  }

  Future<void> _renameImage(BuildContext context, HistoryItem item) async {
    final value = await _askForName(
      context,
      '重命名图片',
      _fileStem(item.filePath),
    );
    if (value == null || !context.mounted) return;
    try {
      await context.read<AppState>().renameHistory(item.id, value);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(error.toString().replaceFirst('Bad state: ', ''))),
        );
      }
    }
  }

  Future<void> _moveImage(BuildContext context, HistoryItem item) async {
    var selected = item.groupId ?? '';
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('移动到分组'),
          content: DropdownButtonFormField<String>(
            value: selected,
            isExpanded: true,
            items: [
              const DropdownMenuItem(value: '', child: Text('未分组')),
              ...context.read<AppState>().groups.map(
                    (group) => DropdownMenuItem(
                      value: group.id,
                      child: Text(group.name, overflow: TextOverflow.ellipsis),
                    ),
                  ),
            ],
            onChanged: (value) => setDialogState(() => selected = value ?? ''),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('取消'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, selected),
              child: const Text('移动'),
            ),
          ],
        ),
      ),
    );
    if (result != null && context.mounted) {
      await context
          .read<AppState>()
          .moveHistory(item.id, result.isEmpty ? null : result);
    }
  }

  Future<String?> _askForName(
    BuildContext context,
    String title,
    String initialValue,
  ) async {
    final controller = TextEditingController(text: initialValue);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(labelText: '名称'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    controller.dispose();
    final trimmed = result?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}

class _HistoryTile extends StatelessWidget {
  final HistoryItem item;
  final void Function(BuildContext context, HistoryItem item) onTap;

  const _HistoryTile(this.item, this.onTap);

  @override
  Widget build(BuildContext context) {
    final file = File(item.filePath);
    if (!file.existsSync()) {
      // File deleted/moved on disk → drop it from the library instead of showing
      // a broken tile. Scheduled post-frame so we never mutate state mid-build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.read<AppState>().dropMissingImage(item.id);
      });
      return const SizedBox.shrink();
    }
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(8),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => onTap(context, item),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Image.file(
                file,
                fit: BoxFit.cover,
                cacheWidth: 360,
                filterQuality: FilterQuality.low,
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              child: Text(
                _fileName(item.filePath),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
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
        child: Row(
          children: [
            SizedBox(
              width: 64,
              child: Text(label, style: const TextStyle(color: Colors.grey)),
            ),
            Expanded(child: Text(value)),
          ],
        ),
      );
}

String _fileName(String path) => path.replaceAll('\\', '/').split('/').last;

String _fileStem(String path) {
  final name = _fileName(path);
  final dot = name.lastIndexOf('.');
  return dot > 0 ? name.substring(0, dot) : name;
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
