import 'dart:convert';
import 'package:http/http.dart' as http;
import 'online_gallery_service.dart';

const tagsGalleryOrigin = 'https://tags.gallery';
const tagsGalleryCategories = [
  'artist',
  'character',
  'copyright',
  'fashion_style',
  'face',
  'face_parts',
  'hair',
  'accessories',
  'composition'
];
List<String> tagsGalleryLabels(String language) =>
    const {
      'zh-CN': ['画师', '角色', '作品', '服装风格', '面容', '五官', '发型', '配饰', '构图'],
      'zh-TW': ['畫師', '角色', '作品', '服裝風格', '面容', '五官', '髮型', '配飾', '構圖'],
      'en-US': [
        'Artists',
        'Characters',
        'Series',
        'Fashion',
        'Faces',
        'Facial features',
        'Hair',
        'Accessories',
        'Composition'
      ],
      'ja-JP': ['絵師', 'キャラ', '作品', '服', '顔', '顔パーツ', '髪', '小物', '構図'],
      'ko-KR': ['작가', '캐릭터', '작품', '패션', '얼굴', '얼굴 특징', '머리', '액세서리', '구도']
    }[language] ??
    tagsGalleryLabels('en-US');
String tagsGalleryCategory(String value) {
  if (value.isEmpty) return 'artist';
  if (!tagsGalleryCategories.contains(value)) {
    throw const FormatException('TAGS_GALLERY_INVALID_CATEGORY');
  }
  return value;
}

String _decode(String value) => value.replaceAllMapped(
        RegExp(r'&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);',
            caseSensitive: false), (m) {
      final k = m[1]!.toLowerCase();
      if (k.startsWith('#')) {
        final n = int.tryParse(k.substring(k.startsWith('#x') ? 2 : 1),
                radix: k.startsWith('#x') ? 16 : 10) ??
            0;
        return n > 0 && n <= 0x10ffff ? String.fromCharCode(n) : '';
      }
      return const {
            'amp': '&',
            'quot': '"',
            'apos': "'",
            'lt': '<',
            'gt': '>',
            'nbsp': ' '
          }[k] ??
          '';
    });
Map<String, String> _attrs(String raw) => {
      for (final m in RegExp(r'''([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')''')
          .allMatches(raw))
        m[1]!.toLowerCase(): _decode(m[2] ?? m[3] ?? '')
    };
String _body(String raw) {
  if (raw.length > 5000000) {
    throw const FormatException('TAGS_GALLERY_RESPONSE_TOO_LARGE');
  }
  return raw
      .replaceAll(
          RegExp(r'<script\b[^>]*>[\s\S]*?</script>', caseSensitive: false), '')
      .replaceAll(RegExp(r'<!--[\s\S]*?-->'), '');
}

String _image(String raw) {
  final u = Uri.tryParse(tagsGalleryOrigin)?.resolve(raw);
  return raw.isNotEmpty &&
          u?.origin == tagsGalleryOrigin &&
          u!.path.startsWith('/images/')
      ? u.toString()
      : '';
}

OnlineGalleryMedia _media(String raw, String id) {
  final img = _attrs(
      RegExp(r'<img\b([^>]*)>', caseSensitive: false).firstMatch(raw)?[1] ??
          '');
  final source = _attrs(
      RegExp(r'<source\b([^>]*)>', caseSensitive: false).firstMatch(raw)?[1] ??
          '');
  final url = _image(img['src'] ?? '');
  final thumb = _image((source['srcset'] ?? '').split(RegExp(r'\s|,')).first);
  return OnlineGalleryMedia(
      id: id,
      previewUrl: thumb.isEmpty ? url : thumb,
      displayUrl: url,
      downloadUrl: url,
      width: int.tryParse(img['width'] ?? '') ?? 0,
      height: int.tryParse(img['height'] ?? '') ?? 0);
}

OnlineGalleryItem _item(String id, String title, OnlineGalleryMedia cover) {
  final c = tagsGalleryCategory(id.split('/').first);
  return OnlineGalleryItem(
      source: OnlineGallerySource.tagsGallery,
      id: id,
      title: title,
      author: c == 'artist' ? title : '',
      description: title,
      rating: '',
      mediaCount: cover.displayUrl.isEmpty ? 0 : 1,
      prompt: title,
      tags: OnlineGalleryTagGroups(
          artists: c == 'artist' ? [title] : [],
          characters: c == 'character' ? [title] : [],
          copyrights: c == 'copyright' ? [title] : [],
          general:
              !['artist', 'character', 'copyright'].contains(c) ? [title] : []),
      cover: cover,
      sourceUrl: '$tagsGalleryOrigin/$id');
}

({int total, List<OnlineGalleryItem> items}) parseTagsGalleryPage(
    String raw, String category) {
  final html = _body(raw),
      plain = _decode(_body(raw).replaceAll(RegExp(r'<[^>]*>'), ' '));
  final count = RegExp(r'hits=\s*([\d,]+)').firstMatch(plain)?[1];
  if (count == null) throw const FormatException('TAGS_GALLERY_LAYOUT_CHANGED');
  final total = int.parse(count.replaceAll(',', ''));
  final items = <OnlineGalleryItem>[];
  for (final m in RegExp(r'<a\b([^>]*)>([\s\S]*?)</a>', caseSensitive: false)
      .allMatches(html)) {
    final a = _attrs(m[1]!);
    if (!(a['aria-label'] ?? '').startsWith('Open detail: ')) continue;
    final href = a['href'] ?? '';
    if (!href.startsWith('/$category/') ||
        href.contains('?') ||
        href.contains('#')) continue;
    final id = href.substring(1);
    items.add(_item(id, a['aria-label']!.substring(13), _media(m[2]!, id)));
  }
  if (total > 0 && items.isEmpty) {
    throw const FormatException('TAGS_GALLERY_LAYOUT_CHANGED');
  }
  return (total: total, items: items);
}

Uri tagsGalleryUrl(String category, int page, String query,
        [String sort = 'score']) =>
    Uri.parse(
            '$tagsGalleryOrigin/v4-5${category == 'artist' ? '' : '/$category'}')
        .replace(queryParameters: {
      if (page > 1) 'p': '$page',
      if (query.isNotEmpty) 'q': query,
      if (sort != 'score') 's': sort
    });
Uri tagsGalleryDetailUrl(String id) {
  final parts = id.split('/');
  if (parts.length != 2 ||
      parts[1].isEmpty ||
      RegExp(r'[?#\\]').hasMatch(id) ||
      Uri.decodeComponent(id).contains('..')) {
    throw const FormatException('TAGS_GALLERY_INVALID_ID');
  }
  tagsGalleryCategory(parts[0]);
  return Uri.parse('$tagsGalleryOrigin/$id');
}

OnlineGalleryDetail parseTagsGalleryDetail(String raw, String id) {
  tagsGalleryDetailUrl(id);
  final html = _body(raw);
  final copies = RegExp(r'<button\b([^>]*)>', caseSensitive: false)
      .allMatches(html)
      .map((m) => _attrs(m[1]!)['aria-label'] ?? '')
      .where((s) => s.startsWith('Copy tag: '))
      .map((s) => s.substring(10))
      .toList();
  if (copies.isEmpty) {
    throw const FormatException('TAGS_GALLERY_LAYOUT_CHANGED');
  }
  final cover = _media(html, id);
  final item = _item(id, copies.first, cover);
  return OnlineGalleryDetail(
      item: item,
      media: cover.displayUrl.isEmpty ? [] : [cover],
      prompt: copies.last,
      negativePrompt: '',
      categoryPath: [
        id.split('/').first
      ],
      metadata: {
        'sourceUrl': item.sourceUrl,
        'model': 'NAI Diffusion Anime V4.5 Full'
      });
}

class TagsGalleryClient {
  final http.Client client;
  final Map<String, ({DateTime at, Future<String> value})> _cache = {};
  TagsGalleryClient(this.client);
  void clear() => _cache.clear();
  Future<String> _get(Uri uri) {
    final cached = _cache[uri.toString()];
    if (cached != null && DateTime.now().difference(cached.at).inMinutes < 10) {
      return cached.value;
    }
    final result = _fetch(uri);
    if (_cache.length >= 64) _cache.remove(_cache.keys.first);
    _cache[uri.toString()] = (at: DateTime.now(), value: result);
    return result;
  }

  Future<String> _fetch(Uri uri) async {
    try {
      final response = await client.get(uri, headers: {
        'Accept': 'text/html',
        'User-Agent': 'Langbai-NovelAI-Studio-Mobile/Online-Gallery-Client'
      }).timeout(const Duration(seconds: 30));
      if (response.statusCode != 200) {
        throw http.ClientException('HTTP ${response.statusCode}', uri);
      }
      if (response.bodyBytes.length > 5000000) {
        throw const FormatException('TAGS_GALLERY_RESPONSE_TOO_LARGE');
      }
      return utf8.decode(response.bodyBytes);
    } catch (_) {
      _cache.remove(uri.toString());
      rethrow;
    }
  }

  Future<OnlineGalleryPage> search(
      String category, int page, int pageSize, String query,
      [String sort = 'score']) async {
    if (!['score', 'count', 'name'].contains(sort)) {
      throw const FormatException('TAGS_GALLERY_INVALID_SORT');
    }
    category = tagsGalleryCategory(category);
    if (page < 1 || page > 100000) {
      throw const FormatException('TAGS_GALLERY_INVALID_PAGE');
    }
    final size = [12, 24, 48, 60].contains(pageSize) ? pageSize : 12;
    final offset = (page - 1) * size, first = offset ~/ 100 + 1;
    final start = parseTagsGalleryPage(
        await _get(tagsGalleryUrl(category, first, query, sort)), category);
    var items = start.items.skip(offset % 100).take(size).toList();
    if (items.length < size && offset + items.length < start.total) {
      final next = parseTagsGalleryPage(
          await _get(tagsGalleryUrl(category, first + 1, query, sort)),
          category);
      items.addAll(next.items.take(size - items.length));
    }
    return OnlineGalleryPage(
        source: OnlineGallerySource.tagsGallery,
        page: page,
        pageSize: size,
        total: start.total,
        items: items,
        hasMore: offset + items.length < start.total);
  }

  Future<OnlineGalleryDetail> detail(String id) async =>
      parseTagsGalleryDetail(await _get(tagsGalleryDetailUrl(id)), id);
}

List<String> tagsGalleryUi(String language) =>
    const {
      'zh-CN': ['分类', '官网尚未提供样例图'],
      'zh-TW': ['分類', '官網尚未提供範例圖'],
      'en-US': ['Category', 'No sample image provided by the source'],
      'ja-JP': ['カテゴリ', '元サイトにサンプル画像がありません'],
      'ko-KR': ['카테고리', '원본 사이트에 샘플 이미지가 없습니다']
    }[language] ??
    const ['Category', 'No sample image provided by the source'];
