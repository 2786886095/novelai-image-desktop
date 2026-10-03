import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../i18n/local_favorites_text.dart';
import '../i18n/app_locales.dart';
import '../services/local_favorites.dart';
import '../state/app_state.dart';
import '../ui/zoomable_image.dart';
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
          if (date.isNotEmpty &&
              !result.items.any((item) => item.prefix.startsWith(date))) {
            date = '';
          }
          final count = result.items
              .where((item) => date.isEmpty || item.prefix.startsWith(date))
              .length;
          page = page.clamp(1, (count / pageSize).ceil().clamp(1, 999999));
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
    final navigator = Navigator.of(context, rootNavigator: true);
    final route = DialogRoute<String>(
        context: context,
        themes: InheritedTheme.capture(from: context, to: navigator.context),
        barrierColor:
            Theme.of(context).dialogTheme.barrierColor ?? Colors.black54,
        traversalEdgeBehavior: TraversalEdgeBehavior.closedLoop,
        builder: (context) => AlertDialog(
              title: Text(localFavoritesText(language, 'rename')),
              content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('${item.prefix}_'),
                    const SizedBox(height: 8),
                    TextField(
                      controller: controller,
                      autofocus: true,
                      maxLength: 100,
                      decoration:
                          const InputDecoration(border: OutlineInputBorder()),
                      onSubmitted: (value) => Navigator.pop(context, value),
                    )
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
    final suffix = await navigator.push(route);
    // Keep the field alive until the reverse animation removes its overlay.
    await route.completed;
    controller.dispose();
    if (suffix != null && mounted) {
      await _run(() async {
        await store.rename(item.id, suffix);
      });
    }
  }

  void _preview(List<LocalFavorite> items, int index, String language) {
    final files = [
      for (final item in items)
        File('${library!.directory}${Platform.pathSeparator}${item.fileName}')
    ];
    showGalleryImagePreview(context,
        images: [
          for (final file in files)
            file.existsSync()
                ? Image.file(file, fit: BoxFit.contain)
                : Center(
                    child: Text(localFavoritesText(language, 'missing'),
                        style: const TextStyle(color: Colors.white)))
        ],
        initialIndex: index,
        captions: [for (final item in items) item.fileName],
        actionsBuilder: (context, current) => IconButton(
            tooltip: mobileUiTextFor(language, 'gallery.share'),
            color: Colors.white,
            icon: const Icon(Icons.share_outlined),
            onPressed: files[current].existsSync()
                ? () => Share.shareXFiles([XFile(files[current].path)])
                : null));
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
    final image = InkWell(
        onTap: exists ? () => _preview(items, index, language) : null,
        child: exists
            ? Image.file(file,
                width: double.infinity,
                fit: masonry ? BoxFit.fitWidth : BoxFit.cover,
                cacheWidth: 440)
            : Center(child: Text(localFavoritesText(language, 'missing'))));
    return Card(
        clipBehavior: Clip.antiAlias,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (masonry)
            (exists ? image : SizedBox(height: 160, child: image))
          else
            Expanded(child: image),
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
