import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'online_gallery_service.dart';

const galleryFavoritesKey = 'online-gallery-favorites.v1';
String validGalleryUrl(String value) {
  final u = Uri.tryParse(value);
  return u != null && ['http', 'https'].contains(u.scheme) && u.host.isNotEmpty
      ? value
      : '';
}

class GalleryFavorite {
  final String source,
      id,
      title,
      author,
      sourceUrl,
      prompt,
      negativePrompt,
      createdAt;
  final int score, savedAt;
  final List<Map<String, String>> images;
  const GalleryFavorite(
      {required this.source,
      required this.id,
      required this.title,
      this.author = '',
      this.sourceUrl = '',
      this.prompt = '',
      this.negativePrompt = '',
      this.createdAt = '',
      this.score = 0,
      required this.savedAt,
      this.images = const []});
  String get key => '$source:$id';
  Map<String, dynamic> toJson() => {
        'source': source,
        'id': id,
        'title': title,
        'author': author,
        'sourceUrl': sourceUrl,
        'prompt': prompt,
        'negativePrompt': negativePrompt,
        'createdAt': createdAt,
        'score': score,
        'savedAt': savedAt,
        'images': images
      };
  factory GalleryFavorite.fromJson(Map<String, dynamic> j) {
    if (![
          'aitag',
          'artist-ranking',
          'danbooru',
          'safebooru',
          'gelbooru',
          'quicktag',
          'tags-gallery'
        ].contains(j['source']) ||
        j['id'] is! String ||
        j['id'] == '' ||
        j['title'] is! String ||
        j['images'] is! List ||
        j['savedAt'] is! num) throw const FormatException('Invalid favorite');
    return GalleryFavorite(
        source: j['source'],
        id: j['id'],
        title: j['title'],
        author: '${j['author'] ?? ''}',
        sourceUrl: validGalleryUrl('${j['sourceUrl'] ?? ''}'),
        prompt: '${j['prompt'] ?? ''}',
        negativePrompt: '${j['negativePrompt'] ?? ''}',
        createdAt: '${j['createdAt'] ?? ''}',
        score: (j['score'] as num? ?? 0).toInt(),
        savedAt: (j['savedAt'] as num).toInt(),
        images: (j['images'] as List)
            .map((i) => <String, String>{
                  'url': validGalleryUrl('${i['url'] ?? ''}'),
                  'thumb': validGalleryUrl('${i['thumb'] ?? ''}')
                })
            .where((i) => i['url']!.isNotEmpty)
            .toList());
  }
  factory GalleryFavorite.fromItem(OnlineGalleryItem item,
          {OnlineGalleryDetail? detail}) =>
      GalleryFavorite(
          source: item.source.id,
          id: item.id,
          title: item.title,
          author: item.author,
          sourceUrl: item.sourceUrl,
          prompt: detail?.prompt ?? item.prompt,
          negativePrompt: detail?.negativePrompt ?? item.negativePrompt,
          createdAt: item.createdAt,
          score: item.score,
          savedAt: DateTime.now().millisecondsSinceEpoch,
          images: ((detail?.media.isNotEmpty ?? false)
                  ? detail!.media
                  : [item.cover])
              .map((m) => <String, String>{
                    'url':
                        m.downloadUrl.isNotEmpty ? m.downloadUrl : m.displayUrl,
                    'thumb':
                        m.previewUrl.isNotEmpty ? m.previewUrl : m.displayUrl
                  })
              .where((m) => m['url']!.isNotEmpty)
              .toList());
}

List<GalleryFavorite> parseFavorites(String? raw) {
  if (raw == null) return [];
  final j = jsonDecode(raw);
  if (j['version'] != 1 || j['items'] is! List) {
    throw const FormatException('Invalid favorites library');
  }
  final seen = <String>{};
  return (j['items'] as List)
      .map((i) => GalleryFavorite.fromJson(Map<String, dynamic>.from(i)))
      .where((i) => seen.add(i.key))
      .toList();
}

List<GalleryFavorite> orderFavorites(List<GalleryFavorite> items, String sort) {
  final out = [...items];
  out.sort((a, b) {
    final n = switch (sort) {
      'oldest' => a.savedAt.compareTo(b.savedAt),
      'name' => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
      'name-desc' => b.title.toLowerCase().compareTo(a.title.toLowerCase()),
      'author' => a.author.toLowerCase().compareTo(b.author.toLowerCase()),
      'source' => a.source.compareTo(b.source),
      'score' => b.score.compareTo(a.score),
      _ => b.savedAt.compareTo(a.savedAt)
    };
    return n == 0 ? a.key.compareTo(b.key) : n;
  });
  return out;
}

class GalleryFavoritesStore extends ChangeNotifier {
  static final instance = GalleryFavoritesStore();
  List<GalleryFavorite> items = [];
  Object? error;
  Future<void>? _load;
  Future<void> _writes = Future.value();
  Future<void> load() => _load ??= () async {
        try {
          items = parseFavorites((await SharedPreferences.getInstance())
              .getString(galleryFavoritesKey));
          error = null;
        } catch (e) {
          error = e;
        }
        notifyListeners();
      }();
  Future<void> toggle(GalleryFavorite item) {
    final result = _writes.catchError((_) {}).then((_) async {
      await load();
      if (error != null) throw error!;
      final next = items.any((i) => i.key == item.key)
          ? items.where((i) => i.key != item.key).toList()
          : [item, ...items];
      final ok = await (await SharedPreferences.getInstance()).setString(
          galleryFavoritesKey,
          jsonEncode(
              {'version': 1, 'items': next.map((i) => i.toJson()).toList()}));
      if (!ok) throw StateError('Favorites save failed');
      items = next;
      notifyListeners();
    });
    _writes = result;
    return result;
  }
}
