import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/gallery_favorites.dart';
import '../services/aitag_service.dart' show aitagImageHeaders;
import '../services/gallery_labels.dart';
import '../state/app_state.dart';
import '../ui/studio_dropdown.dart';

class GalleryFavoriteButton extends StatefulWidget {
  final GalleryFavorite item;
  final Future<GalleryFavorite> Function()? prepare;
  const GalleryFavoriteButton({super.key, required this.item, this.prepare});
  @override
  State<GalleryFavoriteButton> createState() => _GalleryFavoriteButtonState();
}

class _GalleryFavoriteButtonState extends State<GalleryFavoriteButton> {
  bool busy = false;
  @override
  void initState() {
    super.initState();
    GalleryFavoritesStore.instance.load();
  }

  @override
  Widget build(BuildContext context) {
    final text =
            galleryLibraryText(context.watch<AppState>().settings.language),
        store = GalleryFavoritesStore.instance;
    return AnimatedBuilder(
        animation: store,
        builder: (context, _) {
          final saved = store.items.any((i) => i.key == widget.item.key);
          return IconButton(
              tooltip: text[saved ? 'remove' : 'add'],
              isSelected: saved,
              color: saved ? Colors.red : null,
              icon: busy
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : Icon(saved ? Icons.favorite : Icons.favorite_border),
              onPressed: busy
                  ? null
                  : () async {
                      setState(() => busy = true);
                      try {
                        await store.toggle(!saved && widget.prepare != null
                            ? await widget.prepare!()
                            : widget.item);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                              content:
                                  Text(text[saved ? 'removed' : 'added'])));
                        }
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(text['failed'])));
                        }
                      } finally {
                        if (mounted) setState(() => busy = false);
                      }
                    });
        });
  }
}

class GalleryFavoritesButton extends StatelessWidget {
  const GalleryFavoritesButton({super.key});
  @override
  Widget build(BuildContext context) => IconButton(
      tooltip: galleryLibraryText(
          context.watch<AppState>().settings.language)['library'],
      icon: const Icon(Icons.favorite_border),
      onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const GalleryFavoritesScreen())));
}

class GalleryFavoritesScreen extends StatefulWidget {
  const GalleryFavoritesScreen({super.key});
  @override
  State<GalleryFavoritesScreen> createState() => _GalleryFavoritesScreenState();
}

class _GalleryFavoritesScreenState extends State<GalleryFavoritesScreen> {
  String query = '', source = 'all', sort = 'newest';
  int page = 1, size = 12;
  @override
  void initState() {
    super.initState();
    GalleryFavoritesStore.instance.load();
  }

  @override
  Widget build(BuildContext context) {
    final language = context.watch<AppState>().settings.language,
        text = galleryLibraryText(language),
        store = GalleryFavoritesStore.instance;
    return AnimatedBuilder(
        animation: store,
        builder: (context, _) {
          final items = orderFavorites(
                  store.items
                      .where((i) =>
                          (source == 'all' || i.source == source) &&
                          '${i.title} ${localizedGalleryTag(i.title, language)} ${i.author} ${i.prompt}'
                              .toLowerCase()
                              .contains(query.toLowerCase()))
                      .toList(),
                  sort),
              pages = (items.length / size).ceil().clamp(1, 1000000),
              shown = page.clamp(1, pages);
          return Scaffold(
              appBar: AppBar(
                  title: Text('${text['library']} · ${store.items.length}')),
              body: Column(children: [
                Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(children: [
                      TextField(
                          decoration: InputDecoration(
                              labelText: text['search'],
                              prefixIcon: const Icon(Icons.search)),
                          onChanged: (v) => setState(() {
                                query = v;
                                page = 1;
                              })),
                      const SizedBox(height: 8),
                      Wrap(spacing: 12, runSpacing: 8, children: [
                        StudioDropdownButton<String>(
                            value: sort,
                            items: [
                              for (final e in [
                                'newest',
                                'oldest',
                                'name',
                                'name-desc',
                                'author',
                                'source',
                                'score'
                              ].indexed)
                                DropdownMenuItem(
                                    value: e.$2,
                                    child: Text(text['sorts'][e.$1]))
                            ],
                            onChanged: (v) => setState(() {
                                  sort = v!;
                                  page = 1;
                                })),
                        StudioDropdownButton<String>(
                            value: source,
                            items: [
                              DropdownMenuItem(
                                  value: 'all', child: Text(text['all'])),
                              ...store.items.map((i) => i.source).toSet().map(
                                  (s) => DropdownMenuItem(
                                      value: s, child: Text(s)))
                            ],
                            onChanged: (v) => setState(() {
                                  source = v!;
                                  page = 1;
                                })),
                        StudioDropdownButton<int>(
                            value: size,
                            items: [
                              for (final n in [12, 24, 48, 60])
                                DropdownMenuItem(
                                    value: n,
                                    child: Text("${text['pageSize']} $n"))
                            ],
                            onChanged: (v) => setState(() {
                                  size = v!;
                                  page = 1;
                                }))
                      ])
                    ])),
                if (store.error != null) Text(text['failed']),
                Expanded(
                    child: items.isEmpty
                        ? Center(child: Text(text['empty']))
                        : LayoutBuilder(
                            builder: (context, c) => GridView.builder(
                                padding: const EdgeInsets.all(12),
                                gridDelegate:
                                    SliverGridDelegateWithFixedCrossAxisCount(
                                        crossAxisCount: (c.maxWidth / 190)
                                            .floor()
                                            .clamp(1, 6),
                                        mainAxisExtent: 285,
                                        crossAxisSpacing: 12,
                                        mainAxisSpacing: 12),
                                itemCount: items
                                    .skip((shown - 1) * size)
                                    .take(size)
                                    .length,
                                itemBuilder: (context, index) {
                                  final item =
                                      items[(shown - 1) * size + index];
                                  return Card(
                                      clipBehavior: Clip.antiAlias,
                                      child: Column(children: [
                                        Expanded(
                                            child: InkWell(
                                                onTap: () => Navigator.push(
                                                    context,
                                                    MaterialPageRoute(
                                                        builder: (_) =>
                                                            _FavoriteDetail(
                                                                item: item))),
                                                child: SizedBox(
                                                    width: double.infinity,
                                                    child: _FavoriteImage(
                                                        item: item,
                                                        url: (item.images.firstOrNull?['thumb'] ?? '').isNotEmpty
                                                            ? item.images.first['thumb']!
                                                            : item.images.firstOrNull?['url'] ?? '')))),
                                        Padding(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 8),
                                            child: Row(children: [
                                              Expanded(
                                                  child: Text(
                                                      item.source ==
                                                              'tags-gallery'
                                                          ? localizedGalleryTag(
                                                              item.title,
                                                              language)
                                                          : item.title,
                                                      maxLines: 2,
                                                      overflow: TextOverflow
                                                          .ellipsis)),
                                              GalleryFavoriteButton(item: item)
                                            ])),
                                        Text(item.source)
                                      ]));
                                }))),
                SafeArea(
                    top: false,
                    child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                              tooltip: MaterialLocalizations.of(context)
                                  .previousPageTooltip,
                              onPressed: shown > 1
                                  ? () => setState(() => page = shown - 1)
                                  : null,
                              icon: const Icon(Icons.chevron_left)),
                          TextButton(
                              onPressed: () async {
                                final controller =
                                    TextEditingController(text: '$shown');
                                final n = await showDialog<int>(
                                    context: context,
                                    builder: (c) => AlertDialog(
                                            title: Text(
                                                '${text['page']} / $pages'),
                                            content: TextField(
                                                controller: controller,
                                                keyboardType:
                                                    TextInputType.number,
                                                inputFormatters: [
                                                  FilteringTextInputFormatter
                                                      .digitsOnly
                                                ],
                                                onSubmitted: (v) =>
                                                    Navigator.pop(
                                                        c, int.tryParse(v))),
                                            actions: [
                                              TextButton(
                                                  onPressed: () =>
                                                      Navigator.pop(
                                                          c,
                                                          int.tryParse(
                                                              controller.text)),
                                                  child: Text(
                                                      MaterialLocalizations.of(
                                                              c)
                                                          .okButtonLabel))
                                            ]));
                                controller.dispose();
                                if (n != null && mounted) {
                                  setState(() => page = n.clamp(1, pages));
                                }
                              },
                              child: Text('$shown / $pages · ${items.length}')),
                          IconButton(
                              tooltip: MaterialLocalizations.of(context)
                                  .nextPageTooltip,
                              onPressed: shown < pages
                                  ? () => setState(() => page = shown + 1)
                                  : null,
                              icon: const Icon(Icons.chevron_right))
                        ]))
              ]));
        });
  }
}

class _FavoriteImage extends StatelessWidget {
  final GalleryFavorite item;
  final String url;
  const _FavoriteImage({required this.item, required this.url});
  @override
  Widget build(BuildContext context) => url.isEmpty
      ? const Center(child: Icon(Icons.image_not_supported_outlined))
      : Image.network(url,
          fit: BoxFit.contain,
          headers: item.source == 'aitag' ? aitagImageHeaders : {
            'Referer': item.sourceUrl,
            'User-Agent': 'Langbai-NovelAI-Studio-Mobile'
          },
          errorBuilder: (_, __, ___) =>
              const Center(child: Icon(Icons.broken_image_outlined)));
}

class _FavoriteDetail extends StatefulWidget {
  final GalleryFavorite item;
  const _FavoriteDetail({required this.item});
  @override
  State<_FavoriteDetail> createState() => _FavoriteDetailState();
}

class _FavoriteDetailState extends State<_FavoriteDetail> {
  int index = 0;
  @override
  Widget build(BuildContext context) {
    final item = widget.item,
        text = galleryLibraryText(context.watch<AppState>().settings.language);
    return Scaffold(
        appBar: AppBar(
            title: Text(item.source == 'tags-gallery' ? localizedGalleryTag(item.title, context.watch<AppState>().settings.language) : item.title),
            actions: [GalleryFavoriteButton(item: item)]),
        body: SafeArea(
            child: ListView(padding: const EdgeInsets.all(16), children: [
          SizedBox(
              height: MediaQuery.sizeOf(context).height * .6,
              child: InteractiveViewer(
                  child: _FavoriteImage(
                      item: item,
                      url: item.images.elementAtOrNull(index)?['url'] ?? ''))),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            IconButton(
                onPressed: index > 0 ? () => setState(() => index--) : null,
                icon: const Icon(Icons.chevron_left)),
            Text('${index + 1} / ${item.images.length}'),
            IconButton(
                onPressed: index < item.images.length - 1
                    ? () => setState(() => index++)
                    : null,
                icon: const Icon(Icons.chevron_right))
          ]),
          Wrap(spacing: 8, children: [
            OutlinedButton(
                onPressed: item.sourceUrl.isEmpty
                    ? null
                    : () => launchUrl(Uri.parse(item.sourceUrl),
                        mode: LaunchMode.externalApplication),
                child: Text(text['open'])),
            OutlinedButton(
                onPressed: () =>
                    Clipboard.setData(ClipboardData(text: item.prompt))
                        .then((_) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(text['copied'])));
                      }
                    }),
                child: Text(text['copy']))
          ]),
          SelectableText(item.prompt)
        ])));
  }
}
