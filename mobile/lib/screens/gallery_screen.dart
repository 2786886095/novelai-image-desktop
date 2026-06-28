import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/nai_models.dart';
import '../i18n/app_locales.dart';
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
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
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
      appBar: AppBar(title: Text(t('gallery.title'))),
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
                        decoration: InputDecoration(
                          labelText: t('gallery.date'),
                          border: const OutlineInputBorder(),
                        ),
                        items: [
                          DropdownMenuItem(
                            value: '',
                            child: Text(t('gallery.allDates')),
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
                        decoration: InputDecoration(
                          labelText: t('gallery.group'),
                          border: const OutlineInputBorder(),
                        ),
                        items: [
                          DropdownMenuItem(
                            value: '',
                            child: Text(t('gallery.allGroups')),
                          ),
                          DropdownMenuItem(
                            value: _ungroupedFilter,
                            child: Text(t('gallery.ungrouped')),
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
                        tooltip: t('gallery.createGroup'),
                        onPressed: () => _createGroup(context),
                        icon: const Icon(Icons.create_new_folder_outlined),
                      ),
                      PopupMenuButton<String>(
                        tooltip: t('gallery.groupActions'),
                        enabled: group.isNotEmpty && group != _ungroupedFilter,
                        onSelected: (action) {
                          if (action == 'rename') {
                            _renameSelectedGroup(context);
                          }
                          if (action == 'delete') {
                            _deleteSelectedGroup(context);
                          }
                        },
                        itemBuilder: (_) => [
                          PopupMenuItem(
                            value: 'rename',
                            child: Text(t('gallery.renameGroup')),
                          ),
                          PopupMenuItem(
                            value: 'delete',
                            child: Text(t('gallery.deleteGroup')),
                          ),
                        ],
                        icon: const Icon(Icons.folder_open_outlined),
                      ),
                      IconButton.filledTonal(
                        tooltip: t('gallery.exportZip'),
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
              child: Text(mobileUiFormatFor(
                  language, 'gallery.imageCount', {'count': history.length})),
            ),
          ),
          Expanded(
            child: history.isEmpty
                ? Center(child: Text(t('gallery.empty')))
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
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('gallery.createGroup')),
        content: TextField(
          controller: groupCtrl,
          autofocus: true,
          decoration: InputDecoration(labelText: t('gallery.groupName')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('common.cancel')),
          ),
          FilledButton(
            onPressed: () async {
              await context.read<AppState>().createGroup(groupCtrl.text);
              groupCtrl.clear();
              if (dialogContext.mounted) Navigator.pop(dialogContext);
            },
            child: Text(t('common.create')),
          ),
        ],
      ),
    );
  }

  Future<void> _renameSelectedGroup(BuildContext context) async {
    final state = context.read<AppState>();
    final selected = state.groups.where((item) => item.id == group).firstOrNull;
    if (selected == null) return;
    final value = await _askForName(
        context,
        mobileUiTextFor(state.settings.language, 'gallery.renameGroup'),
        selected.name);
    if (value != null) await state.renameGroup(selected.id, value);
  }

  Future<void> _deleteSelectedGroup(BuildContext context) async {
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('gallery.deleteGroup')),
        content: Text(t('gallery.deleteGroupContent')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(t('common.delete')),
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
      final language = state.settings.language;
      final selected =
          state.groups.where((item) => item.id == group).firstOrNull;
      final path = await state.exportHistory(
        items,
        archiveName: group == _ungroupedFilter
            ? mobileUiTextFor(language, 'gallery.ungrouped')
            : selected?.name ?? 'Langbai-NovelAI-Studio',
      );
      await Share.shareXFiles(
        [XFile(path)],
        text: mobileUiTextFor(language, 'gallery.historyExport'),
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
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
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
              _MetaRow(t('gallery.feature'), item.feature),
              _MetaRow(t('gallery.model'), item.model),
              _MetaRow(t('gallery.seed'), '${item.seed}'),
              _MetaRow(t('gallery.size'), '${item.width}x${item.height}'),
              _MetaRow(
                t('gallery.time'),
                item.createdAt.replaceFirst('T', ' ').split('.').first,
              ),
              const SizedBox(height: 8),
              Text(t('gallery.prompt'),
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              SelectableText(
                  item.prompt.isEmpty ? t('gallery.noPrompt') : item.prompt),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.workspaces_outline),
                    label: Text(t('gallery.setWorkbench')),
                    onPressed: () {
                      context.read<AppState>().setWorkbenchFromHistory(item);
                      Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.replay),
                    label: Text(t('gallery.reuseParams')),
                    onPressed: () {
                      _reuseParams(context, item);
                      Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.drive_file_rename_outline),
                    label: Text(t('gallery.rename')),
                    onPressed: () async {
                      await _renameImage(context, item);
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.drive_file_move_outline),
                    label: Text(t('gallery.moveGroup')),
                    onPressed: () async {
                      await _moveImage(context, item);
                      if (sheetContext.mounted) Navigator.pop(sheetContext);
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.share_outlined),
                    label: Text(t('gallery.share')),
                    onPressed: () => Share.shareXFiles(
                      [XFile(item.filePath)],
                      text: item.prompt,
                    ),
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.delete_outline),
                    label: Text(t('common.delete')),
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
      mobileUiTextFor(
          context.read<AppState>().settings.language, 'gallery.renameImage'),
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
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(t('gallery.moveToGroup')),
          content: DropdownButtonFormField<String>(
            value: selected,
            isExpanded: true,
            items: [
              DropdownMenuItem(value: '', child: Text(t('gallery.ungrouped'))),
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
              child: Text(t('common.cancel')),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, selected),
              child: Text(t('common.move')),
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
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final controller = TextEditingController(text: initialValue);
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: InputDecoration(labelText: t('gallery.name')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(t('common.save')),
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
