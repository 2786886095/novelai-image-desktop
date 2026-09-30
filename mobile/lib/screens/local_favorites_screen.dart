import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../i18n/local_favorites_text.dart';
import '../services/local_favorites.dart';
import '../state/app_state.dart';
import 'gallery_favorites_screen.dart';

class LocalFavoritesScreen extends StatefulWidget {
  const LocalFavoritesScreen({super.key});
  @override
  State<LocalFavoritesScreen> createState() => _LocalFavoritesScreenState();
}

class _LocalFavoritesScreenState extends State<LocalFavoritesScreen> {
  final store = MobileLocalFavorites.instance;
  LocalFavoriteLibrary? library;
  String? error;
  String date = '', layout = 'grid';
  int page = 1, pageSize = 24;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    store.addListener(_load);
    _load();
  }

  @override
  void dispose() {
    store.removeListener(_load);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final result = await store.list();
      if (mounted) {
        setState(() {
          library = result;
          error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    }
  }

  Future<void> _run(Future<void> Function() operation) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await operation();
      await _load();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _chooseDirectory(String language) async {
    String? selected;
    try {
      selected = await FilePicker.platform.getDirectoryPath();
    } catch (_) {
      if (mounted) {
        setState(() => error = localFavoritesText(language, 'noFolder'));
      }
      return;
    }
    if (selected == null) return;
    await _run(() => store.setDirectory(selected!));
  }

  Future<void> _rename(LocalFavorite item, String language) async {
    final controller = TextEditingController(text: item.name);
    final suffix = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
              title: Text(localFavoritesText(language, 'rename')),
              content: Row(children: [
                Text('${item.prefix}_'),
                Expanded(
                    child: TextField(
                  controller: controller,
                  autofocus: true,
                  maxLength: 100,
                  decoration:
                      const InputDecoration(border: OutlineInputBorder()),
                  onSubmitted: (value) => Navigator.pop(context, value),
                ))
              ]),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: Text(localFavoritesText(language, 'cancel'))),
                FilledButton(
                    onPressed: () => Navigator.pop(context, controller.text),
                    child: Text(localFavoritesText(language, 'save')))
              ],
            ));
    controller.dispose();
    if (suffix != null) {
      await _run(() async {
        await store.rename(item.id, suffix);
      });
    }
  }

  void _preview(List<LocalFavorite> items, int index, String language) {
    Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => _FavoritePreview(
            items: items,
            initialIndex: index,
            directory: library!.directory,
            language: language)));
  }

  @override
  Widget build(BuildContext context) {
    final language = context.watch<AppState>().settings.language;
    String t(String key) => localFavoritesText(language, key);
    final current = library;
    final dates =
        current?.items.map((e) => e.prefix.substring(0, 8)).toSet().toList() ??
            [];
    dates.sort((a, b) => b.compareTo(a));
    final filtered = (current?.items ?? const <LocalFavorite>[])
        .where((item) => date.isEmpty || item.prefix.startsWith(date))
        .toList()
        .reversed
        .toList();
    final pages = (filtered.length / pageSize).ceil().clamp(1, 999999);
    final shownPage = page.clamp(1, pages);
    final visible =
        filtered.skip((shownPage - 1) * pageSize).take(pageSize).toList();
    return Scaffold(
      appBar: AppBar(title: Text(t('title')), actions: [
        IconButton(
            tooltip: t('online'),
            icon: const Icon(Icons.public),
            onPressed: () => Navigator.push(
                context,
                MaterialPageRoute<void>(
                    builder: (_) => const GalleryFavoritesScreen()))),
      ]),
      body: Column(children: [
        if (current != null)
          Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t('local'),
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                          child: Text('${t('directory')}: ${current.directory}',
                              overflow: TextOverflow.ellipsis)),
                      OutlinedButton(
                          onPressed:
                              busy ? null : () => _chooseDirectory(language),
                          child: Text(t('choose')))
                    ]),
                    Wrap(spacing: 8, children: [
                      DropdownButton<String>(
                          value: date,
                          items: [
                            DropdownMenuItem(value: '', child: Text(t('all'))),
                            for (final d in dates)
                              DropdownMenuItem(value: d, child: Text(d))
                          ],
                          onChanged: (v) => setState(() {
                                date = v ?? '';
                                page = 1;
                              })),
                      DropdownButton<String>(
                          value: layout,
                          items: ['grid', 'masonry']
                              .map((v) =>
                                  DropdownMenuItem(value: v, child: Text(t(v))))
                              .toList(),
                          onChanged: (v) =>
                              setState(() => layout = v ?? 'grid')),
                      DropdownButton<int>(
                          value: pageSize,
                          items: [12, 24, 48, 96]
                              .map((n) => DropdownMenuItem(
                                  value: n, child: Text('${t('size')} $n')))
                              .toList(),
                          onChanged: (v) => setState(() {
                                pageSize = v ?? 24;
                                page = 1;
                              })),
                    ]),
                  ])),
        if (error != null)
          Padding(
              padding: const EdgeInsets.all(12),
              child: Text('${t('error')}: $error',
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error))),
        Expanded(
            child: current == null
                ? const Center(child: CircularProgressIndicator())
                : visible.isEmpty
                    ? Center(child: Text(t('empty')))
                    : LayoutBuilder(builder: (context, bounds) {
                        final columns =
                            (bounds.maxWidth / 190).floor().clamp(2, 6);
                        if (layout == 'masonry') {
                          return ListView(
                              padding: const EdgeInsets.all(8),
                              children: [
                                Row(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      for (var col = 0; col < columns; col++)
                                        Expanded(
                                            child: Column(children: [
                                          for (var i = col;
                                              i < visible.length;
                                              i += columns)
                                            _card(visible[i], visible, i,
                                                language,
                                                masonry: true),
                                        ])),
                                    ]),
                              ]);
                        }
                        return GridView.builder(
                            padding: const EdgeInsets.all(8),
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: columns,
                                    mainAxisExtent: 226,
                                    mainAxisSpacing: 8,
                                    crossAxisSpacing: 8),
                            itemCount: visible.length,
                            itemBuilder: (context, i) =>
                                _card(visible[i], visible, i, language));
                      })),
        if (pages > 1)
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            IconButton(
                tooltip: t('previous'),
                onPressed: shownPage <= 1 ? null : () => setState(() => page--),
                icon: const Icon(Icons.chevron_left)),
            Text('$shownPage / $pages'),
            IconButton(
                tooltip: t('next'),
                onPressed:
                    shownPage >= pages ? null : () => setState(() => page++),
                icon: const Icon(Icons.chevron_right)),
          ]),
      ]),
    );
  }

  Widget _card(
      LocalFavorite item, List<LocalFavorite> items, int index, String language,
      {bool masonry = false}) {
    final file =
        File('${library!.directory}${Platform.pathSeparator}${item.fileName}');
    final exists = file.existsSync();
    return Card(
        clipBehavior: Clip.antiAlias,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          InkWell(
              onTap: exists ? () => _preview(items, index, language) : null,
              child: exists
                  ? Image.file(file,
                      width: double.infinity,
                      height: masonry ? null : 160,
                      fit: masonry ? BoxFit.fitWidth : BoxFit.cover,
                      cacheWidth: 440)
                  : SizedBox(
                      height: 160,
                      child: Center(
                          child:
                              Text(localFavoritesText(language, 'missing'))))),
          Text(item.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            IconButton(
                tooltip: localFavoritesText(language, 'rename'),
                onPressed:
                    busy || !exists ? null : () => _rename(item, language),
                icon: const Icon(Icons.drive_file_rename_outline)),
            IconButton(
                tooltip: localFavoritesText(language, 'remove'),
                onPressed:
                    busy ? null : () => _run(() => store.remove(item.id)),
                icon: const Icon(Icons.bookmark_remove_outlined)),
          ]),
        ]));
  }
}

class _FavoritePreview extends StatefulWidget {
  final List<LocalFavorite> items;
  final int initialIndex;
  final String directory, language;
  const _FavoritePreview(
      {required this.items,
      required this.initialIndex,
      required this.directory,
      required this.language});
  @override
  State<_FavoritePreview> createState() => _FavoritePreviewState();
}

class _FavoritePreviewState extends State<_FavoritePreview> {
  late int index = widget.initialIndex;
  @override
  Widget build(BuildContext context) {
    final item = widget.items[index];
    final file =
        File('${widget.directory}${Platform.pathSeparator}${item.fileName}');
    return Scaffold(
        appBar: AppBar(
            title: Text('${index + 1} / ${widget.items.length}'),
            actions: [
              IconButton(
                  icon: const Icon(Icons.share_outlined),
                  onPressed: file.existsSync()
                      ? () => Share.shareXFiles([XFile(file.path)])
                      : null),
            ]),
        body: SafeArea(
            child: Row(children: [
          IconButton(
              tooltip: localFavoritesText(widget.language, 'previous'),
              onPressed: index <= 0 ? null : () => setState(() => index--),
              icon: const Icon(Icons.chevron_left)),
          Expanded(
              child: file.existsSync()
                  ? InteractiveViewer(
                      key: ValueKey(item.id),
                      minScale: 0.5,
                      maxScale: 5,
                      child:
                          Center(child: Image.file(file, fit: BoxFit.contain)))
                  : Center(
                      child: Text(
                          localFavoritesText(widget.language, 'missing')))),
          IconButton(
              tooltip: localFavoritesText(widget.language, 'next'),
              onPressed: index >= widget.items.length - 1
                  ? null
                  : () => setState(() => index++),
              icon: const Icon(Icons.chevron_right)),
        ])));
  }
}
