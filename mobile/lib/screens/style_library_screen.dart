import 'dart:io';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import '../models/nai_models.dart';
import '../models/style_library.dart';
import '../state/app_state.dart';
import '../i18n/style_library_text.dart';
import '../ui/studio_dropdown.dart';
import '../ui/zoomable_image.dart';
import '../services/gallery_download.dart';

class StyleSortPicker extends StatelessWidget {
  const StyleSortPicker({super.key});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        t = styleLibraryText(state.settings.language);
    final value = styleSorts.contains(state.settings.stylePromptPresetSort)
        ? state.settings.stylePromptPresetSort
        : 'default';
    return StudioDropdownButton<String>(
        value: value,
        isExpanded: true,
        items: styleSorts
            .map((v) => DropdownMenuItem(
                value: v, child: Text(t[v == 'name' ? 'nameSort' : v]!)))
            .toList(),
        onChanged: (v) {
          if (v != null) {
            state
                .updateStyleLibrary((s) => s.stylePromptPresetSort = v)
                .catchError((Object e) {
              if (context.mounted) {
                ScaffoldMessenger.of(context)
                    .showSnackBar(SnackBar(content: Text('$e')));
              }
            });
          }
        });
  }
}

class SaveGalleryStyleButton extends StatefulWidget {
  final String name, prompt;
  final List<String> images;
  const SaveGalleryStyleButton(
      {super.key,
      required this.name,
      required this.prompt,
      required this.images});
  @override
  State<SaveGalleryStyleButton> createState() => _SaveGalleryStyleButtonState();
}

class _SaveGalleryStyleButtonState extends State<SaveGalleryStyleButton> {
  bool busy = false;
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        t = styleLibraryText(state.settings.language);
    return FilledButton.tonalIcon(
        icon: const Icon(Icons.bookmark_add_outlined),
        label: Text(busy ? '…' : t['saveStyle']!),
        onPressed: busy
            ? null
            : () async {
                setState(() => busy = true);
                final client = http.Client();
                Directory? temp;
                bool committed = false;
                final p = StylePromptPreset(
                    id: 'style-${DateTime.now().microsecondsSinceEpoch}',
                    name: widget.name.isEmpty ? widget.prompt : widget.name,
                    prompt: widget.prompt,
                    createdAt: DateTime.now().toIso8601String());
                try {
                  temp =
                      await Directory.systemTemp.createTemp('style-preview-');
                  for (final url in widget.images
                      .where((u) => u.isNotEmpty)
                      .toSet()
                      .take(9)) {
                    final data = await fetchGalleryImage(client, url,
                        {'Referer': 'https://novelai.quicktagcloud.com/'});
                    final f = File(
                        '${temp.path}/${p.previewImages.length}.${data.extension}');
                    await f.writeAsBytes(data.bytes);
                    final copied = await state.storage
                        .copyStylePromptPreviewImage(
                            presetId: p.id,
                            sourcePath: f.path,
                            sourceName: f.uri.pathSegments.last);
                    if (copied == null) {
                      throw const FormatException('Preview import failed');
                    }
                    p.previewImages.add(copied);
                  }
                  await state
                      .updateStyleLibrary((s) => s.stylePromptPresets.add(p));
                  committed = true;
                  if (context.mounted) {
                    ScaffoldMessenger.of(context)
                        .showSnackBar(SnackBar(content: Text(t['saved']!)));
                  }
                } catch (e) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context)
                        .showSnackBar(SnackBar(content: Text('$e')));
                  }
                } finally {
                  client.close();
                  if (!committed) {
                    await state.storage.deleteStylePromptPreviewImages(p.id);
                  }
                  await temp?.delete(recursive: true);
                  if (mounted) setState(() => busy = false);
                }
              });
  }
}

class StyleLibraryScreen extends StatefulWidget {
  final VoidCallback? onApply;
  const StyleLibraryScreen({super.key, this.onApply});
  @override
  State<StyleLibraryScreen> createState() => _StyleLibraryScreenState();
}

class _StyleLibraryScreenState extends State<StyleLibraryScreen> {
  String query = '', group = '';
  bool busy = false;
  String? error;
  Future<void> run(Future<void> Function() work) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> edit(AppState state, [StylePromptPreset? preset]) async {
    await Navigator.push<void>(
        context,
        MaterialPageRoute(
            builder: (_) => _StyleEditor(
                preset: preset, group: group.isEmpty ? 'Default' : group)));
  }

  Future<String?> ask(String title) async {
    final c = TextEditingController();
    final value = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(title),
                content: TextField(controller: c, autofocus: true),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text(styleLibraryText(this
                          .context
                          .read<AppState>()
                          .settings
                          .language)['cancel']!)),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, c.text.trim()),
                      child: Text(styleLibraryText(this
                          .context
                          .read<AppState>()
                          .settings
                          .language)['save']!))
                ]));
    c.dispose();
    return value;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        t = styleLibraryText(state.settings.language),
        s = state.settings;
    final groups = {
      'Default',
      ...s.stylePromptPresetGroups,
      ...s.stylePromptPresets.map((p) => p.group)
    }.toList();
    final visible = sortStyles(s.stylePromptPresets, s.stylePromptPresetSort)
        .where((p) =>
            (group.isEmpty || p.group == group) &&
            '${p.name}\n${p.prompt}'
                .toLowerCase()
                .contains(query.toLowerCase()))
        .toList();
    return Scaffold(
        appBar: AppBar(title: Text(t['title']!), actions: [
          IconButton(
              tooltip: t['new'],
              onPressed: busy ? null : () => edit(state),
              icon: const Icon(Icons.add)),
          IconButton(
              tooltip: t['batch'],
              onPressed: busy
                  ? null
                  : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => _StyleBatch(
                              group: group.isEmpty ? 'Default' : group))),
              icon: const Icon(Icons.playlist_add))
        ]),
        body: SafeArea(
            child: Column(children: [
          Padding(
              padding: const EdgeInsets.all(12),
              child: Column(children: [
                TextField(
                    decoration: InputDecoration(
                        labelText: t['search'],
                        prefixIcon: const Icon(Icons.search)),
                    onChanged: (v) => setState(() => query = v)),
                Row(children: [
                  Expanded(
                      child: StudioDropdownButton<String>(
                          value: groups.contains(group) ? group : '',
                          isExpanded: true,
                          items: [
                            DropdownMenuItem(value: '', child: Text(t['all']!)),
                            ...groups.map((g) =>
                                DropdownMenuItem(value: g, child: Text(g)))
                          ],
                          onChanged: (v) => setState(() => group = v ?? ''))),
                  IconButton(
                      tooltip: t['newGroup'],
                      icon: const Icon(Icons.create_new_folder_outlined),
                      onPressed: busy
                          ? null
                          : () async {
                              final name = await ask(t['newGroup']!);
                              if (name != null && name.isNotEmpty) {
                                await run(() => state.updateStyleLibrary((s) {
                                      if (!s.stylePromptPresetGroups
                                          .contains(name)) {
                                        s.stylePromptPresetGroups.add(name);
                                      }
                                    }));
                              }
                            }),
                  IconButton(
                      tooltip: t['deleteGroup'],
                      icon: const Icon(Icons.folder_delete_outlined),
                      onPressed: busy || group.isEmpty || group == 'Default'
                          ? null
                          : () => run(() => state.updateStyleLibrary((s) {
                                s.stylePromptPresetGroups.remove(group);
                                for (final p in s.stylePromptPresets) {
                                  if (p.group == group) p.group = 'Default';
                                }
                                group = '';
                              })))
                ]),
                const StyleSortPicker(),
                if (error != null)
                  Text(error!,
                      style:
                          TextStyle(color: Theme.of(context).colorScheme.error))
              ])),
          if (busy) const LinearProgressIndicator(),
          Expanded(
              child: visible.isEmpty
                  ? Center(child: Text(t['empty']!))
                  : ReorderableListView.builder(
                      buildDefaultDragHandles: false,
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                      itemCount: visible.length,
                      onReorder: (a, b) {
                        if (b > a) b--;
                        if (!busy) {
                          run(() => state.updateStyleLibrary((s) {
                                moveStyle(
                                    s.stylePromptPresets,
                                    visible[a].id,
                                    visible[b].id,
                                    visible.map((p) => p.id).toList());
                                s.stylePromptPresetSort = 'custom';
                              }));
                        }
                      },
                      itemBuilder: (context, i) {
                        final p = visible[i];
                        return Card(
                            key: ValueKey(p.id),
                            child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(children: [
                                        ReorderableDragStartListener(
                                            index: i,
                                            enabled: !busy,
                                            child: const Padding(
                                                padding: EdgeInsets.all(12),
                                                child:
                                                    Icon(Icons.drag_handle))),
                                        if (p.previewImages.isNotEmpty)
                                          _StylePreviewCover(preset: p),
                                        const SizedBox(width: 8),
                                        Expanded(
                                            child: Text(p.name,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .titleMedium))
                                      ]),
                                      Text(
                                          '${p.group} · ${t['rating']} ${p.rating}/5 · ${t['uses']} ${p.usageCount}'),
                                      Text(p.prompt,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis),
                                      Wrap(spacing: 8, children: [
                                        TextButton(
                                            onPressed: busy
                                                ? null
                                                : () => edit(state, p),
                                            child: Text(t['edit']!)),
                                        TextButton(
                                            onPressed: busy
                                                ? null
                                                : () {
                                                    state
                                                        .applyStylePromptPreset(
                                                            p);
                                                    widget.onApply?.call();
                                                  },
                                            child: Text(t['apply']!)),
                                        IconButton(
                                            tooltip: t['moveUp'],
                                            onPressed: busy || i == 0
                                                ? null
                                                : () => run(() => state
                                                        .updateStyleLibrary(
                                                            (s) {
                                                      moveStyle(
                                                          s.stylePromptPresets,
                                                          p.id,
                                                          visible[i - 1].id,
                                                          visible
                                                              .map((p) => p.id)
                                                              .toList());
                                                      s.stylePromptPresetSort =
                                                          'custom';
                                                    })),
                                            icon:
                                                const Icon(Icons.arrow_upward)),
                                        IconButton(
                                            tooltip: t['moveDown'],
                                            onPressed: busy ||
                                                    i == visible.length - 1
                                                ? null
                                                : () => run(() => state
                                                        .updateStyleLibrary(
                                                            (s) {
                                                      moveStyle(
                                                          s.stylePromptPresets,
                                                          p.id,
                                                          visible[i + 1].id,
                                                          visible
                                                              .map((p) => p.id)
                                                              .toList());
                                                      s.stylePromptPresetSort =
                                                          'custom';
                                                    })),
                                            icon: const Icon(
                                                Icons.arrow_downward)),
                                        IconButton(
                                            tooltip: t['delete'],
                                            onPressed: busy
                                                ? null
                                                : () async {
                                                    final yes = await showDialog<
                                                            bool>(
                                                        context: context,
                                                        builder: (context) =>
                                                            AlertDialog(
                                                                title: Text(t[
                                                                    'confirmDelete']!),
                                                                actions: [
                                                                  TextButton(
                                                                      onPressed: () => Navigator.pop(
                                                                          context,
                                                                          false),
                                                                      child: Text(
                                                                          t['cancel']!)),
                                                                  TextButton(
                                                                      onPressed: () => Navigator.pop(
                                                                          context,
                                                                          true),
                                                                      child: Text(
                                                                          t['delete']!))
                                                                ]));
                                                    if (yes == true) {
                                                      await run(() => state
                                                          .removeStylePromptPreset(
                                                              p.id));
                                                    }
                                                  },
                                            icon: const Icon(
                                                Icons.delete_outline))
                                      ])
                                    ])));
                      }))
        ])));
  }
}

class _StyleEditor extends StatefulWidget {
  final StylePromptPreset? preset;
  final String group;
  const _StyleEditor({this.preset, required this.group});
  @override
  State<_StyleEditor> createState() => _StyleEditorState();
}

class _StyleEditorState extends State<_StyleEditor> {
  late final p = widget.preset == null
      ? StylePromptPreset(
          id: 'style-${DateTime.now().microsecondsSinceEpoch}',
          name: '',
          prompt: '',
          group: widget.group,
          createdAt: DateTime.now().toIso8601String())
      : StylePromptPreset.fromJson(widget.preset!.toJson());
  late final name = TextEditingController(text: p.name),
      prompt = TextEditingController(text: p.prompt),
      ratingInput = TextEditingController(text: p.rating.toString());
  double? get inputRating => double.tryParse(ratingInput.text.trim());
  bool get validRating =>
      inputRating != null &&
      inputRating!.isFinite &&
      inputRating! >= 0 &&
      inputRating! <= 5;
  bool busy = false, committed = false;
  AppState? app;
  final imported = <StylePromptPreviewImage>[];
  Future<void> cleanup() async {
    for (final im in imported) {
      if (!committed || !p.previewImages.any((x) => x.id == im.id)) {
        await app?.storage.deleteStylePromptPreviewImage(p.id, im);
      }
    }
  }

  String? error;
  @override
  void dispose() {
    unawaited(cleanup());
    name.dispose();
    prompt.dispose();
    ratingInput.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        t = styleLibraryText(state.settings.language),
        groups = {
          'Default',
          p.group,
          ...state.settings.stylePromptPresetGroups,
          ...state.settings.stylePromptPresets.map((p) => p.group)
        };
    app = state;
    return PopScope(
        canPop: !busy,
        child: Scaffold(
            appBar: AppBar(title: Text(t['edit']!)),
            body: ListView(padding: const EdgeInsets.all(16), children: [
              TextField(
                  controller: name,
                  decoration: InputDecoration(labelText: t['name'])),
              const SizedBox(height: 12),
              TextField(
                  controller: prompt,
                  minLines: 4,
                  maxLines: 10,
                  decoration: InputDecoration(labelText: t['prompt'])),
              const SizedBox(height: 12),
              StudioDropdownButton<String>(
                  value: p.group,
                  isExpanded: true,
                  items: groups
                      .map((g) => DropdownMenuItem(value: g, child: Text(g)))
                      .toList(),
                  onChanged: (v) => setState(() => p.group = v!)),
              TextField(
                  key: const ValueKey('style-rating-input'),
                  controller: ratingInput,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                      labelText: t['rating'],
                      suffixText: '/ 5',
                      errorText: validRating ? null : t['ratingRange']),
                  onChanged: (_) => setState(() {})),
              Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: p.previewImages
                      .map((im) => SizedBox(
                          width: 112,
                          child: Column(children: [
                            InkWell(
                                onTap: () => showGalleryImagePreview(context,
                                    initialIndex: p.previewImages.indexOf(im),
                                    images: p.previewImages
                                        .map(
                                            (x) => Image.file(File(x.filePath)))
                                        .toList()),
                                child: Image.file(File(im.filePath),
                                    height: 100,
                                    width: 112,
                                    fit: BoxFit.contain)),
                            TextButton(
                                key: ValueKey('style-set-cover-${im.id}'),
                                onPressed: busy ? null : () => setState(() => p.coverImageId = im.id),
                                child: Text(p.coverIndex == p.previewImages.indexOf(im) ? t['cover']! : t['setCover']!)),
                            TextButton(
                                onPressed: busy
                                    ? null
                                    : () async {
                                        final yes = await showDialog<bool>(
                                            context: context,
                                            builder: (dialogContext) =>
                                                AlertDialog(
                                                    title: Text(t[
                                                        'confirmImageDelete']!),
                                                    content: Text(im.name),
                                                    actions: [
                                                      TextButton(
                                                          onPressed: () =>
                                                              Navigator.pop(
                                                                  dialogContext,
                                                                  false),
                                                          child: Text(
                                                              t['cancel']!)),
                                                      FilledButton(
                                                          onPressed: () =>
                                                              Navigator.pop(
                                                                  dialogContext,
                                                                  true),
                                                          child: Text(
                                                              t['delete']!)),
                                                    ]));
                                        if (yes == true && mounted) {
                                          setState(
                                              () => p.previewImages.remove(im));
                                        }
                                      },
                                child: Text(t['delete']!))
                          ])))
                      .toList()),
              OutlinedButton.icon(
                  onPressed: busy || p.previewImages.length >= 9
                      ? null
                      : () async {
                          setState(() => busy = true);
                          try {
                            final result = await FilePicker.platform.pickFiles(
                                type: FileType.custom,
                                allowedExtensions: [
                                  'png',
                                  'jpg',
                                  'jpeg',
                                  'webp'
                                ],
                                allowMultiple: true);
                            for (final f in result?.files
                                    .take(9 - p.previewImages.length) ??
                                <PlatformFile>[]) {
                              if (f.path == null) continue;
                              final im = await state.storage
                                  .copyStylePromptPreviewImage(
                                      presetId: p.id,
                                      sourcePath: f.path!,
                                      sourceName: f.name);
                              if (im != null) {
                                p.previewImages.add(im);
                                imported.add(im);
                              }
                            }
                          } catch (e) {
                            error = '$e';
                          } finally {
                            if (mounted) setState(() => busy = false);
                          }
                        },
                  icon: const Icon(Icons.add_photo_alternate_outlined),
                  label:
                      Text('${t['addImages']} · ${p.previewImages.length}/9')),
              if (error != null) Text(error!),
              const SizedBox(height: 16),
              FilledButton(
                  onPressed: busy || !validRating
                      ? null
                      : () async {
                          if (name.text.trim().isEmpty ||
                              prompt.text.trim().isEmpty) {
                            setState(
                                () => error = '${t['name']} / ${t['prompt']}');
                            return;
                          }
                          if (!validRating) return;
                          p.rating = inputRating!;
                          p.name = name.text.trim();
                          p.prompt = prompt.text.trim();
                          setState(() => busy = true);
                          try {
                            await state.updateStyleLibrary((s) {
                              final i = s.stylePromptPresets
                                  .indexWhere((x) => x.id == p.id);
                              if (i < 0) {
                                s.stylePromptPresets.add(p);
                              } else {
                                p.usageCount =
                                    s.stylePromptPresets[i].usageCount;
                                p.sortOrder = s.stylePromptPresets[i].sortOrder;
                                s.stylePromptPresets[i] = p;
                              }
                            });
                            committed = true;
                            for (final im in widget.preset?.previewImages ??
                                <StylePromptPreviewImage>[]) {
                              if (!p.previewImages.any((x) => x.id == im.id)) {
                                await state.storage
                                    .deleteStylePromptPreviewImage(p.id, im);
                              }
                            }
                            if (context.mounted) {
                              Navigator.pop(context);
                            }
                          } catch (e) {
                            if (mounted) {
                              setState(() => error = '$e');
                            }
                          } finally {
                            if (mounted) {
                              setState(() => busy = false);
                            }
                          }
                        },
                  child: Text(t['save']!))
            ])));
  }
}

class _StyleBatch extends StatefulWidget {
  final String group;
  const _StyleBatch({required this.group});
  @override
  State<_StyleBatch> createState() => _StyleBatchState();
}

class _StyleBatchState extends State<_StyleBatch> {
  final lines = TextEditingController();
  List<PlatformFile> images = [];
  String match = 'none';
  bool busy = false;
  String? error;
  @override
  void dispose() {
    lines.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        t = styleLibraryText(state.settings.language);
    return Scaffold(
        appBar: AppBar(title: Text(t['batch']!)),
        body: ListView(padding: const EdgeInsets.all(16), children: [
          Text(t['lines']!),
          TextField(controller: lines, minLines: 6, maxLines: 12),
          const SizedBox(height: 12),
          StudioDropdownButton<String>(
              value: match,
              isExpanded: true,
              items: [
                DropdownMenuItem(value: 'none', child: Text(t['none']!)),
                DropdownMenuItem(value: 'order', child: Text(t['byOrder']!)),
                DropdownMenuItem(value: 'name', child: Text(t['byName']!))
              ],
              onChanged: busy ? null : (v) => setState(() => match = v!)),
          OutlinedButton(
              onPressed: busy
                  ? null
                  : () async {
                      final r = await FilePicker.platform.pickFiles(
                          type: FileType.custom,
                          allowedExtensions: ['png', 'jpg', 'jpeg', 'webp'],
                          allowMultiple: true);
                      if (r != null) setState(() => images = r.files);
                    },
              child: Text('${t['selectImages']} · ${images.length}')),
          Text(images.map((f) => f.name).join(', ')),
          if (error != null) Text(error!),
          FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      final rows = parseStyleLines(lines.text);
                      if (rows.isEmpty) return;
                      setState(() => busy = true);
                      final created = <StylePromptPreset>[];
                      bool committed = false;
                      try {
                        final matches = matchStyleImages(
                            images.map((f) => f.name).toList(),
                            rows.map((r) => r.name).toList(),
                            match);
                        for (final row in rows.indexed) {
                          final p = StylePromptPreset(
                              id: 'style-${DateTime.now().microsecondsSinceEpoch}-${row.$1}',
                              name: row.$2.name,
                              prompt: row.$2.prompt,
                              group: widget.group,
                              createdAt: DateTime.now().toIso8601String());
                          created.add(p);
                          for (final name in matches[row.$1]) {
                            final f = images.firstWhere((f) => f.name == name);
                            if (f.path == null) throw FormatException(name);
                            final im = await state.storage
                                .copyStylePromptPreviewImage(
                                    presetId: p.id,
                                    sourcePath: f.path!,
                                    sourceName: f.name);
                            if (im == null) throw FormatException(name);
                            p.previewImages.add(im);
                          }
                        }
                        await state.updateStyleLibrary(
                            (s) => s.stylePromptPresets.addAll(created));
                        committed = true;
                        if (context.mounted) Navigator.pop(context);
                      } catch (e) {
                        if (mounted) setState(() => error = '$e');
                      } finally {
                        if (!committed) {
                          for (final p in created) {
                            await state.storage
                                .deleteStylePromptPreviewImages(p.id);
                          }
                        }
                        if (mounted) setState(() => busy = false);
                      }
                    },
              child: Text(busy ? '…' : t['import']!))
        ]));
  }
}

class _StylePreviewCover extends StatelessWidget {
  final StylePromptPreset preset;
  const _StylePreviewCover({required this.preset});
  @override
  Widget build(BuildContext context) {
    final t = styleLibraryText(context.watch<AppState>().settings.language);
    final images = preset.previewImages;
    final index = preset.coverIndex;
    if (index < 0) return const SizedBox.shrink();
    return SizedBox(
        width: 96,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Semantics(
              button: true,
              label: '${t['images']}: ${preset.name} · ${index + 1}/${images.length}',
              child: InkWell(
                key: ValueKey('style-preview-${preset.id}-$index'),
                onTap: () => showGalleryImagePreview(context,
                    initialIndex: index,
                    images: images.map((im) => Image.file(File(im.filePath), fit: BoxFit.contain)).toList()),
                child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 44, maxHeight: 144),
                    child: ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: Image.file(File(images[index].filePath),
                            width: 96,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const SizedBox(
                                width: 96, height: 64,
                                child: Icon(Icons.broken_image_outlined))))),
              )),
          Text('${t['images']} · ${images.length}', style: Theme.of(context).textTheme.bodySmall),
        ]));
  }
}
