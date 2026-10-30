import '../images/image_file_access.dart';
import '../images/coordinated_file_image.dart';
import '../i18n/platform_feature_text.dart';
import '../ui/global_typography.dart';
import '../ui/image_actions_menu.dart';
import '../ui/studio_theme.dart';
import '../ui/studio_dropdown.dart';
import '../ui/android/android_gate.dart';
import '../ui/android/android_tokens.dart';
import 'gallery/android_gallery_viewer.dart';
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/nai_models.dart';
import '../i18n/app_locales.dart';
import '../state/app_state.dart';
import '../ui/zoomable_image.dart';
import '../services/local_favorites.dart';
import '../i18n/local_favorites_text.dart';

const _ungroupedFilter = '__ungrouped';

/// Copies a history image into the metadata inspector's durable snapshot.
/// Keeping this separate from navigation makes grouped and ungrouped items use
/// the same explicit session snapshot, while retaining its source association.
Future<void> stageHistoryImageForMetadata(
  AppState state,
  HistoryItem item,
) async {
  final file = File(item.filePath);
  await state.storage.saveMetadataInspectorImage(
    await state.storage.readImage(file.path),
    _fileName(item.filePath),
  );
  state.storage.associateMetadataInspectorSource(item.filePath);
}

class GalleryScreen extends StatefulWidget {
  final VoidCallback? onOpenMetadata;
  final VoidCallback? onOpenCreate;

  const GalleryScreen({super.key, this.onOpenMetadata, this.onOpenCreate});

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> with WidgetsBindingObserver {
  final Set<String> selected={};bool editing=false,operating=false;
  Timer? _reconcileTimer;bool _visible=false;
  @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);
    _reconcileTimer=Timer.periodic(const Duration(seconds:10),(_){if(mounted && _visible && WidgetsBinding.instance.lifecycleState!=AppLifecycleState.paused) _refreshFiles();});}
  @override void didChangeDependencies(){super.didChangeDependencies();final enabled=TickerMode.of(context);
    if(enabled && !_visible)WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)_refreshFiles();});_visible=enabled;}
  @override void didChangeAppLifecycleState(AppLifecycleState state){if(state==AppLifecycleState.resumed && _visible)_refreshFiles();}
  Future<void> _refreshFiles() async {try {await context.read<AppState>().reconcileMissingHistory();} catch (_) {/* Inconclusive storage never prunes rows. */}}
  Future<void> _batchMove() async {
    final app=context.read<AppState>();String t(String k)=>platformFeatureText(app.settings.language,k);
    final group=await showDialog<String>(context:context,builder:(ctx)=>SimpleDialog(title:Text(t('move')),children:[
      SimpleDialogOption(onPressed:()=>Navigator.pop(ctx,''),child:Text(mobileUiTextFor(app.settings.language,'gallery.ungrouped'))),
      ...app.groups.map((g)=>SimpleDialogOption(onPressed:()=>Navigator.pop(ctx,g.id),child:Text(g.name)))]));
    if(group==null || !mounted)return;setState(()=>operating=true);
    try {await app.moveHistoryItems(Set.of(selected),group.isEmpty?null:group);if(mounted)setState(selected.clear);}
    catch (_) {if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(t('saveFailed'))));}
    finally {if(mounted)setState(()=>operating=false);}
  }
  Future<void> _batchDelete() async {
    final app=context.read<AppState>();String t(String k)=>platformFeatureText(app.settings.language,k);
    final ids=Set<String>.of(selected);
    final approved=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(title:Text(t('delete')),
      content:Text('${ids.length} · ${t('deleteConfirm')}'),actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:Text(t('cancel'))),
      FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:Text(t('delete')))]));
    if(approved!=true || !mounted)return;setState(()=>operating=true);
    try {final result=await app.deleteHistoryItems(ids);
      if(mounted){setState(()=>selected.removeAll(result.removedIds));if(result.failedIds.isNotEmpty)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(t('partialDelete'))));}}
    catch (_) {if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(t('partialDelete'))));}
    finally {if(mounted)setState(()=>operating=false);}
  }

  String group = '';
  String date = '';
  bool groupInitialized = false;
  final groupCtrl = TextEditingController();

  @override
  void dispose() {
    _reconcileTimer?.cancel();WidgetsBinding.instance.removeObserver(this);
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
    selected.retainAll(state.history.map((h)=>h.id).toSet());
    String feature(String k)=>platformFeatureText(language,k);
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
    if (_usesAndroidGallery(context)) {
      return _buildAndroidGallery(context, state, history, dates);
    }
    return Scaffold(
      appBar: AppBar(title: studioAppBarTitle(context, Text(t('gallery.title'))),actions:[
        IconButton(tooltip:feature('refresh'),onPressed:operating?null:_refreshFiles,icon:const Icon(Icons.refresh)),
        IconButton(key:const ValueKey('works-batch-edit'),tooltip:feature('batchEdit'),onPressed:operating?null:()=>setState((){editing=!editing;selected.clear();}),icon:Icon(editing?Icons.done:Icons.checklist))]),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: StudioDropdownButtonFormField<String>(
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
                      child: StudioDropdownButtonFormField<String>(
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
                        popUpAnimationStyle:
                            MediaQuery.disableAnimationsOf(context)
                                ? AnimationStyle.noAnimation
                                : AppMotion.disclosureStyle,
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
          if(editing)Padding(padding:const EdgeInsets.symmetric(horizontal:12),child:Wrap(spacing:8,runSpacing:4,children:[
            Text('${selected.length}'),TextButton(onPressed:operating?null:()=>setState(()=>selected.addAll(history.map((h)=>h.id))),child:Text(feature('selectAll'))),
            TextButton(onPressed:operating?null:()=>setState(selected.clear),child:Text(feature('clearSelection'))),
            OutlinedButton(onPressed:operating||selected.isEmpty?null:_batchMove,child:Text(feature('move'))),
            FilledButton(onPressed:operating||selected.isEmpty?null:_batchDelete,child:Text(feature('delete')))])),
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
                        _HistoryTile(history[index],
                            (context, item) => _openDetail(context, item, history),
                            selecting:editing,selected:selected.contains(history[index].id),
                            onSelect:operating?null:()=>setState((){final id=history[index].id;if(!selected.remove(id))selected.add(id);})),
                  ),
          ),
        ],
      ),
    );
  }

  // Existing embedders without the new shell callback retain the classic view.
  // This also leaves iOS and the explicit classic build entirely unchanged.
  bool _usesAndroidGallery(BuildContext context) =>
      widget.onOpenCreate != null && isAndroidRedesign(context);

  Widget _buildAndroidGallery(BuildContext context, AppState state,
      List<HistoryItem> history, List<String> dates) {
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    String feature(String key) => platformFeatureText(language, key);
    final tokens = LangbaiAndroidTokens.of(context);
    final days = history.map((item) => item.date).toSet().toList()
      ..sort((a, b) => b.compareTo(a));
    return Scaffold(
      key: const ValueKey('android-gallery-grid'),
      backgroundColor: tokens.canvas,
      appBar: AppBar(
        title: studioAppBarTitle(context, Row(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: Text(androidGalleryText(language, 'works'), overflow: TextOverflow.ellipsis)),
          const SizedBox(width: 8),
          Semantics(
            label: mobileUiFormatFor(language, 'gallery.imageCount', {'count': history.length}),
            excludeSemantics: true,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
              decoration: BoxDecoration(color: tokens.inset, borderRadius: BorderRadius.circular(24)),
              child: Text('${history.length}', style: Theme.of(context).textTheme.labelLarge),
            ),
          ),
        ])),
        actions: [
          IconButton(tooltip: feature('refresh'), onPressed: operating ? null : _refreshFiles, icon: const Icon(Icons.refresh)),
          PopupMenuButton<String>(
            key: const ValueKey('android-gallery-menu'),
            tooltip: androidGalleryText(language, 'more'),
            enabled: !operating,
            popUpAnimationStyle: MediaQuery.disableAnimationsOf(context) ? AnimationStyle.noAnimation : AppMotion.disclosureStyle,
            onSelected: (action) {
              switch (action) {
                case 'select': setState(() { editing = !editing; selected.clear(); });
                case 'export': _export(context, history);
                case 'create': _createGroup(context);
                case 'rename': _renameSelectedGroup(context);
                case 'delete': _deleteSelectedGroup(context);
              }
            },
            itemBuilder: (_) => [
              PopupMenuItem(value: 'select', child: Text(editing ? t('common.close') : feature('batchEdit'))),
              PopupMenuItem(value: 'export', enabled: history.isNotEmpty, child: Text(t('gallery.exportZip'))),
              PopupMenuItem(value: 'create', child: Text(t('gallery.createGroup'))),
              PopupMenuItem(value: 'rename', enabled: group.isNotEmpty && group != _ungroupedFilter, child: Text(t('gallery.renameGroup'))),
              PopupMenuItem(value: 'delete', enabled: group.isNotEmpty && group != _ungroupedFilter, child: Text(t('gallery.deleteGroup'))),
            ],
          ),
        ],
      ),
      body: Column(children: [
        // Content-sized filter pills wrap as whole units. Two equal dropdown
        // fields left ~42dp for the value at 320dp and split words mid-line.
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: Wrap(spacing: 8, runSpacing: 8, children: [
              _AndroidFilterPill<String>(
                key: const ValueKey('android-gallery-group-filter'),
                label: t('gallery.group'),
                icon: Icons.folder_outlined,
                value: group,
                defaultValue: '',
                options: [
                  ('', t('gallery.allGroups')),
                  (_ungroupedFilter, t('gallery.ungrouped')),
                  ...state.groups.map((item) => (item.id, item.name)),
                  if (group.isNotEmpty && group != _ungroupedFilter && !state.groups.any((item) => item.id == group))
                    (group, group),
                ],
                onSelected: (next) {
                  setState(() => group = next);
                  unawaited(state.setActiveHistoryGroup(next == _ungroupedFilter ? '' : next));
                },
              ),
              _AndroidFilterPill<String>(
                key: const ValueKey('android-gallery-date-filter'),
                label: t('gallery.date'),
                icon: Icons.calendar_today_outlined,
                value: date,
                defaultValue: '',
                options: [
                  ('', t('gallery.allDates')),
                  ...dates.map((value) => (value, value)),
                  if (date.isNotEmpty && !dates.contains(date)) (date, date),
                ],
                onSelected: (next) => setState(() => date = next),
              ),
            ]),
          ),
        ),
        if (editing)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text('${androidGalleryText(language, 'selected')} ${selected.length}'),
              TextButton(onPressed: operating ? null : () => setState(() => selected.addAll(history.map((item) => item.id))), child: Text(feature('selectAll'))),
              TextButton(onPressed: operating ? null : () => setState(selected.clear), child: Text(feature('clearSelection'))),
              IconButton(key: const ValueKey('works-batch-edit'), tooltip: t('common.close'), onPressed: operating ? null : () => setState(() { editing = false; selected.clear(); }), icon: const Icon(Icons.close)),
            ]),
          ),
        Expanded(
          child: history.isEmpty
              ? Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.photo_library_outlined, size: 48, color: tokens.textSecondary),
                  const SizedBox(height: 16),
                  Text(t('gallery.empty'), style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(androidGalleryText(language, 'emptyHint'), textAlign: TextAlign.center),
                  const SizedBox(height: 20),
                  FilledButton.icon(onPressed: widget.onOpenCreate, icon: const Icon(Icons.draw_outlined), label: Text(androidGalleryText(language, 'goCreate'))),
                ])))
              : LayoutBuilder(builder: (context, constraints) {
                  final width = constraints.maxWidth;
                  final columns = width < 400 ? 2 : width < 600 ? 3 : width < 1000 ? 4 : 6;
                  final cell = (width - 32 - (columns - 1) * 12) / columns;
                  final largeText = MediaQuery.textScalerOf(context).scale(1) >= 1.3;
                  return CustomScrollView(
                    key: const PageStorageKey('android-gallery-dated-grid'),
                    slivers: [
                      for (final day in days) ...[
                        SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 10), child: Text(day, style: Theme.of(context).textTheme.titleSmall))),
                        SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          sliver: SliverGrid.builder(
                            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: columns, mainAxisExtent: cell * 1.1 + (largeText ? 80 : 52), mainAxisSpacing: 12, crossAxisSpacing: 12),
                            itemCount: history.where((item) => item.date == day).length,
                            itemBuilder: (context, index) {
                              final item = history.where((item) => item.date == day).elementAt(index);
                              return _HistoryTile(item, (context, item) => _openDetail(context, item, history),
                                  androidStyle: true,
                                  selecting: editing,
                                  selected: selected.contains(item.id),
                                  onSelect: operating ? null : () => setState(() { if (!selected.remove(item.id)) selected.add(item.id); }),
                                  onLongPress: () { if (!operating) setState(() { editing = true; selected.add(item.id); }); });
                            },
                          ),
                        ),
                      ],
                      const SliverToBoxAdapter(child: SizedBox(height: 16)),
                    ],
                  );
                }),
        ),
        if (editing)
          Material(
            color: tokens.dock,
            child: SafeArea(top: false, child: Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 8), child: Wrap(spacing: 10, runSpacing: 8, children: [
              OutlinedButton.icon(onPressed: operating || selected.isEmpty ? null : _batchMove, icon: const Icon(Icons.drive_file_move_outline), label: Text(feature('move'))),
              OutlinedButton.icon(onPressed: operating || selected.isEmpty ? null : () => _export(context, history.where((item) => selected.contains(item.id)).toList()), icon: const Icon(Icons.archive_outlined), label: Text(t('gallery.exportZip'))),
              FilledButton.icon(onPressed: operating || selected.isEmpty ? null : _batchDelete, icon: const Icon(Icons.delete_outline), label: Text(feature('delete'))),
            ]))),
          ),
      ]),
    );
  }

  Future<void> _openAndroidDetail(BuildContext context, HistoryItem item, List<HistoryItem> navigation) async {
    final state = context.read<AppState>();
    await Navigator.of(context).push<void>(MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => ChangeNotifierProvider<AppState>.value(
        value: state,
        child: AndroidGalleryViewer(
          initialId: item.id,
          navigationIds: navigation.map((entry) => entry.id).toList(),
          onOpenCreate: widget.onOpenCreate,
          onReuse: (entry) => _reuseParams(context, entry),
          onWorkbench: (viewer, entry) async {
            await state.setWorkbenchFromHistory(entry);
            if (!viewer.mounted) return;
            Navigator.of(viewer).pop();
            widget.onOpenCreate?.call();
          },
          onMetadata: (viewer, entry) async {
            await stageHistoryImageForMetadata(state, entry);
            if (!viewer.mounted) return;
            Navigator.of(viewer).pop();
            widget.onOpenMetadata?.call();
          },
          onShare: (viewer, entry) async {
            ScaffoldMessenger.of(viewer).showSnackBar(SnackBar(content: Text(androidGalleryText(state.settings.language, 'exportHint'))));
            await shareImageFile(viewer, entry.filePath, text: entry.prompt);
          },
          onRename: _renameImage,
          onMove: _moveImage,
          onFilePath: (viewer, entry) => _showFilePath(viewer, entry, state.settings.language),
          onFavorite: (viewer, entry) async {
            await MobileLocalFavorites.instance.add(entry);
            if (viewer.mounted) ScaffoldMessenger.of(viewer).showSnackBar(SnackBar(content: Text(localFavoritesText(state.settings.language, 'added'))));
          },
          onDelete: (viewer, entry) async {
            String t(String key) => mobileUiTextFor(state.settings.language, key);
            final confirmed = await showDialog<bool>(context: viewer, builder: (dialog) => AlertDialog(
              title: Text(t('common.delete')),
              content: Text(_fileName(entry.filePath)),
              actions: [
                TextButton(onPressed: () => Navigator.pop(dialog, false), child: Text(t('common.cancel'))),
                FilledButton(onPressed: () => Navigator.pop(dialog, true), child: Text(t('common.delete'))),
              ],
            ));
            if (confirmed == true && viewer.mounted) await state.deleteHistory(entry.id);
          },
        ),
      ),
    ));
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

  void _openDetail(BuildContext context, HistoryItem item, List<HistoryItem> navigation) {
    if (_usesAndroidGallery(context)) {
      unawaited(_openAndroidDetail(context, item, navigation));
      return;
    }
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
              if (ImageFiles.keepVisible(file.path))
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    height: 420,
                    child: ZoomableImage(
                      image: imageFile(file, fit: BoxFit.contain),
                      gallery: navigation.map((i) => imageFile(
                          File(i.filePath), fit: BoxFit.contain)).toList(),
                      imagePaths: navigation.map((i) => i.filePath).toList(),
                      initialIndex: navigation.indexWhere((i) => i.id == item.id),
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
                      final messenger = ScaffoldMessenger.of(context);
                      Navigator.pop(sheetContext);
                      context
                          .read<AppState>()
                          .setWorkbenchFromHistory(item)
                          .then((_) {
                        messenger.showSnackBar(
                          SnackBar(
                              content: Text(t('gallery.setWorkbenchDone'))),
                        );
                      });
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.replay),
                    label: Text(t('gallery.reuseParams')),
                    onPressed: () {
                      final messenger = ScaffoldMessenger.of(context);
                      _reuseParams(context, item);
                      Navigator.pop(sheetContext);
                      messenger.showSnackBar(
                        SnackBar(content: Text(t('gallery.reuseParamsDone'))),
                      );
                    },
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.data_object_outlined),
                    label: Text(t('gallery.viewMetadata')),
                    onPressed: !ImageFiles.keepVisible(file.path)
                        ? null
                        : () async {
                            final messenger = ScaffoldMessenger.of(context);
                            try {
                              await stageHistoryImageForMetadata(
                                context.read<AppState>(),
                                item,
                              );
                              if (sheetContext.mounted) {
                                Navigator.pop(sheetContext);
                              }
                              widget.onOpenMetadata?.call();
                            } catch (error) {
                              messenger.showSnackBar(
                                SnackBar(
                                  content: Text(error
                                      .toString()
                                      .replaceFirst('Bad state: ', '')),
                                ),
                              );
                            }
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
                    onPressed: () => shareImageFile(context, item.filePath, text: item.prompt),
                  ),
                  FilledButton.tonalIcon(
                    key: const ValueKey('gallery-view-file-path'),
                    icon: const Icon(Icons.folder_outlined),
                    label: Text(t('gallery.viewFilePath')),
                    onPressed: () => _showFilePath(sheetContext, item, language),
                  ),
                  FilledButton.tonalIcon(
                    icon: const Icon(Icons.star_border),
                    label: Text(localFavoritesText(language, 'add')),
                    onPressed: !ImageFiles.keepVisible(file.path)
                        ? null
                        : () async {
                            final messenger = ScaffoldMessenger.of(context);
                            try {
                              await MobileLocalFavorites.instance.add(item);
                              if (context.mounted) {
                                messenger.showSnackBar(SnackBar(
                                    duration: const Duration(seconds: 2),
                                    content: Text(localFavoritesText(
                                        language, 'added'))));
                              }
                            } catch (error) {
                              if (context.mounted) {
                                messenger.showSnackBar(SnackBar(
                                    content: Text(
                                        '${localFavoritesText(language, 'error')}: $error')));
                              }
                            }
                          },
                  ),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.delete_outline),
                    label: Text(t('common.delete')),
                    onPressed: () async {
                      final confirmed = await showDialog<bool>(
                          context: sheetContext,
                          builder: (context) => AlertDialog(
                                  title: Text(t('common.delete')),
                                  content: Text(_fileName(item.filePath)),
                                  actions: [
                                    TextButton(
                                        onPressed: () =>
                                            Navigator.pop(context, false),
                                        child: Text(t('common.cancel'))),
                                    FilledButton(
                                        onPressed: () =>
                                            Navigator.pop(context, true),
                                        child: Text(t('common.delete')))
                                  ]));
                      if (confirmed != true || !context.mounted) return;
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
        ..qualityPreset = params.qualityPreset
        ..qualityToggle = params.qualityToggle
        ..transparentBackground = params.transparentBackground
        ..smea = params.smea
        ..smeaDyn = params.smeaDyn
        ..variety = params.variety
        ..fileNamePrefix = params.fileNamePrefix;
      current.stylePrompt = params.stylePrompt;
      current.negativePrompt = params.negativePrompt;
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
          content: StudioDropdownButtonFormField<String>(
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
    final navigator = Navigator.of(context, rootNavigator: true);
    final route = DialogRoute<String>(
      context: context,
      themes: InheritedTheme.capture(from: context, to: navigator.context),
      barrierColor: Theme.of(context).dialogTheme.barrierColor ?? Colors.black54,
      traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
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
    final result = await navigator.push(route);
    // The TextField is still mounted during the dialog's reverse animation.
    await route.completed;
    controller.dispose();
    final trimmed = result?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }

  Future<void> _showFilePath(
    BuildContext context,
    HistoryItem item,
    String language,
  ) async {
    String t(String key) => mobileUiTextFor(language, key);
    final path = File(item.filePath).absolute.path;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('gallery.viewFilePath')),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: SelectableText(
              path,
              key: const ValueKey('gallery-full-file-path'),
            ),
          ),
        ),
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.copy_outlined),
            label: Text(t('gallery.copyFilePath')),
            onPressed: () async {
              var message = t('gallery.filePathCopied');
              try {
                await Clipboard.setData(ClipboardData(text: path));
              } on PlatformException {
                message = t('gallery.copyFilePathFailed');
              }
              if (dialogContext.mounted) {
                ScaffoldMessenger.of(dialogContext).showSnackBar(
                  SnackBar(content: Text(message)),
                );
              }
            },
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('common.close')),
          ),
        ],
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  final HistoryItem item;
  final void Function(BuildContext context, HistoryItem item) onTap;

  final bool selecting,selected;final VoidCallback? onSelect;
  final bool androidStyle;
  final VoidCallback? onLongPress;
  const _HistoryTile(this.item, this.onTap,{this.selecting=false,this.selected=false,this.onSelect,this.androidStyle=false,this.onLongPress});

  @override
  Widget build(BuildContext context) {
    final file = File(item.filePath);
    if (!ImageFiles.keepVisible(file.path)) {
      // File deleted/moved on disk → drop it from the library instead of showing
      // a broken tile. Scheduled post-frame so we never mutate state mid-build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.read<AppState>().dropMissingImage(item.id);
      });
      return const SizedBox.shrink();
    }
    return Material(
      color: androidStyle ? LangbaiAndroidTokens.of(context).card : Theme.of(context).colorScheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(androidStyle ? 16 : 8),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: selecting?onSelect:() => onTap(context, item),
        onLongPress: selecting?null:onLongPress ?? () => showLocalImageActions(context, item.filePath),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if(selecting)SizedBox(height:28,child:Checkbox(value:selected,onChanged:onSelect==null?null:(_)=>onSelect!())),
            Expanded(
              child: imageFile(
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
            if (androidStyle) Padding(padding: const EdgeInsets.fromLTRB(8, 0, 8, 8), child: Text('${item.width} × ${item.height}', style: Theme.of(context).textTheme.labelSmall)),
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

/// Single-line Android filter chip with a menu. The current value never wraps;
/// a long user group name ellipsizes within the row and the menu shows it in
/// full. A non-default selection uses the tonal container to read as active.
class _AndroidFilterPill<T> extends StatelessWidget {
  final String label;
  final IconData icon;
  final T value;
  final T defaultValue;
  final List<(T, String)> options;
  final ValueChanged<T> onSelected;
  const _AndroidFilterPill({super.key, required this.label, required this.icon,
    required this.value, required this.defaultValue, required this.options,
    required this.onSelected});

  @override
  Widget build(BuildContext context) {
    final tokens = LangbaiAndroidTokens.of(context);
    final scheme = Theme.of(context).colorScheme;
    final active = value != defaultValue;
    final current = options.where((option) => option.$1 == value).firstOrNull?.$2 ?? '$value';
    final foreground = active ? scheme.onPrimaryContainer : tokens.textPrimary;
    return Material(
      color: active ? scheme.primaryContainer : tokens.card,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: active ? scheme.primaryContainer : tokens.outline)),
      clipBehavior: Clip.antiAlias,
      child: PopupMenuButton<T>(
        tooltip: label,
        initialValue: value,
        popUpAnimationStyle: MediaQuery.disableAnimationsOf(context) ? AnimationStyle.noAnimation : AppMotion.disclosureStyle,
        onSelected: onSelected,
        itemBuilder: (_) => [
          for (final option in options)
            PopupMenuItem<T>(value: option.$1,
              child: Text(option.$2, maxLines: 2, overflow: TextOverflow.ellipsis)),
        ],
        child: Semantics(
          label: label,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(12, 6, 6, 6),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 18, color: foreground),
                const SizedBox(width: 8),
                Flexible(child: Text(current, maxLines: 1, softWrap: false,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(color: foreground))),
                Icon(Icons.arrow_drop_down, color: foreground),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
