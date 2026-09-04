import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

const _gelbooruUserId = '2045330';
const _gelbooruApiKey =
    '01f32eb53a430f85762184542ba8dfb757f0ca61960fb26b14b8c328a4fc974579bd1cbc008b5786513b6bea46b220179e12f71cfd120e0419f865257d66d35d';
const _pageSize = 60;
const _quickTagSource = 'https://novelai.quicktagcloud.com/data-source.json';
const _userAgent = 'Langbai-NovelAI-Studio-Mobile/Online-Gallery-Client';

enum OnlineGallerySource {
  aitag,
  artistRanking,
  safebooru,
  danbooru,
  gelbooru,
  quicktag,
}

extension OnlineGallerySourceInfo on OnlineGallerySource {
  String get id => switch (this) {
        OnlineGallerySource.aitag => 'aitag',
        OnlineGallerySource.artistRanking => 'artist-ranking',
        OnlineGallerySource.safebooru => 'safebooru',
        OnlineGallerySource.danbooru => 'danbooru',
        OnlineGallerySource.gelbooru => 'gelbooru',
        OnlineGallerySource.quicktag => 'quicktag',
      };

  String get label => switch (this) {
        OnlineGallerySource.aitag => 'AI TAG',
        OnlineGallerySource.artistRanking => '画师排行榜',
        OnlineGallerySource.safebooru => 'Safebooru',
        OnlineGallerySource.danbooru => 'Danbooru',
        OnlineGallerySource.gelbooru => 'Gelbooru',
        OnlineGallerySource.quicktag => '法典图鉴',
      };

  String get siteUrl => switch (this) {
        OnlineGallerySource.aitag => 'https://aitag.win',
        OnlineGallerySource.artistRanking =>
          'https://danbooru.donmai.us/artists',
        OnlineGallerySource.safebooru => 'https://safebooru.donmai.us',
        OnlineGallerySource.danbooru => 'https://danbooru.donmai.us',
        OnlineGallerySource.gelbooru => 'https://gelbooru.com',
        OnlineGallerySource.quicktag => 'https://novelai.quicktagcloud.com',
      };
}

class OnlineGalleryMedia {
  final String id;
  final String previewUrl;
  final String displayUrl;
  final String downloadUrl;
  final int width;
  final int height;

  const OnlineGalleryMedia({
    required this.id,
    required this.previewUrl,
    required this.displayUrl,
    required this.downloadUrl,
    this.width = 0,
    this.height = 0,
  });
}

class OnlineGalleryTagGroups {
  final List<String> artists;
  final List<String> characters;
  final List<String> copyrights;
  final List<String> general;
  final List<String> meta;

  const OnlineGalleryTagGroups({
    this.artists = const [],
    this.characters = const [],
    this.copyrights = const [],
    this.general = const [],
    this.meta = const [],
  });
}

class OnlineGalleryItem {
  final OnlineGallerySource source;
  final String id;
  final bool isCollection;
  final String collectionId;
  final String title;
  final String author;
  final String description;
  final String createdAt;
  final String rating;
  final int score;
  final int favoriteCount;
  final int viewCount;
  final int mediaCount;
  final String prompt;
  final String negativePrompt;
  final OnlineGalleryTagGroups tags;
  final OnlineGalleryMedia cover;
  final String sourceUrl;

  const OnlineGalleryItem({
    required this.source,
    required this.id,
    required this.cover,
    required this.sourceUrl,
    this.isCollection = false,
    this.collectionId = '',
    this.title = '',
    this.author = '',
    this.description = '',
    this.createdAt = '',
    this.rating = 'general',
    this.score = 0,
    this.favoriteCount = 0,
    this.viewCount = 0,
    this.mediaCount = 1,
    this.prompt = '',
    this.negativePrompt = '',
    this.tags = const OnlineGalleryTagGroups(),
  });
}

class OnlineGalleryPage {
  final OnlineGallerySource source;
  final int page;
  final int pageSize;
  final int? total;
  final bool hasMore;
  final String collectionId;
  final String collectionTitle;
  final List<OnlineGalleryItem> items;

  const OnlineGalleryPage({
    required this.source,
    required this.page,
    required this.items,
    this.pageSize = _pageSize,
    this.total,
    this.hasMore = false,
    this.collectionId = '',
    this.collectionTitle = '',
  });
}

class OnlineGalleryDetail {
  final OnlineGalleryItem item;
  final List<OnlineGalleryMedia> media;
  final String prompt;
  final String negativePrompt;
  final String note;
  final List<String> categoryPath;
  final Map<String, dynamic> metadata;

  const OnlineGalleryDetail({
    required this.item,
    required this.media,
    required this.prompt,
    required this.negativePrompt,
    this.note = '',
    this.categoryPath = const [],
    this.metadata = const {},
  });
}

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
List<Object?> _list(Object? value) => value is List ? value : const [];
String _text(Object? value) => value == null ? '' : value.toString();
int _integer(Object? value) => value is num
    ? value.round()
    : int.tryParse(_text(value)) ?? double.tryParse(_text(value))?.round() ?? 0;
bool _boolean(Object? value) =>
    value == true || value == 1 || value == '1' || value == 'true';

List<String> _tags(Object? value) {
  if (value is List) {
    return value
        .map(_text)
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }
  return _text(value)
      .trim()
      .split(RegExp(r'\s+'))
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();
}

String _https(Object? value, [String? base]) {
  final raw = _text(value).trim();
  if (raw.isEmpty) return '';
  try {
    final uri = base == null ? Uri.parse(raw) : Uri.parse(base).resolve(raw);
    return uri.scheme == 'https' ? uri.toString() : '';
  } catch (_) {
    return '';
  }
}

OnlineGalleryMedia _media(
  String id,
  String preview,
  String display,
  String download, {
  int width = 0,
  int height = 0,
}) {
  final fallback = download.isNotEmpty
      ? download
      : display.isNotEmpty
          ? display
          : preview;
  return OnlineGalleryMedia(
    id: id,
    previewUrl: preview.isNotEmpty ? preview : fallback,
    displayUrl: display.isNotEmpty ? display : fallback,
    downloadUrl: fallback,
    width: width < 0 ? 0 : width,
    height: height < 0 ? 0 : height,
  );
}

class _QuickMeta {
  final Map<String, dynamic> raw;
  final String id;
  final String title;
  final String author;
  final String version;
  final int entryCount;
  final int imagedCount;
  final String cover;
  final String coverCodexId;
  final bool nsfw;
  final String dataUrl;
  final String assetBaseUrl;
  final String assetPathMode;

  const _QuickMeta({
    required this.raw,
    required this.id,
    required this.title,
    required this.author,
    required this.version,
    required this.entryCount,
    required this.imagedCount,
    required this.cover,
    required this.coverCodexId,
    required this.nsfw,
    required this.dataUrl,
    required this.assetBaseUrl,
    required this.assetPathMode,
  });

  factory _QuickMeta.fromJson(Object? value) {
    final item = _map(value);
    return _QuickMeta(
      raw: item,
      id: _safeCollectionId(item['id']),
      title: _text(item['title']),
      author: _text(item['author']),
      version: _text(item['version']),
      entryCount: _integer(item['entryCount']),
      imagedCount: _integer(item['imagedCount']),
      cover: _text(item['cover']),
      coverCodexId: _safeCollectionId(item['coverCodexId']),
      nsfw: _boolean(item['nsfw']),
      dataUrl: _https(item['dataUrl']),
      assetBaseUrl: _https(item['assetBaseUrl']),
      assetPathMode: _text(item['assetPathMode']),
    );
  }
}

class _QuickCatalog {
  final String releaseBaseUrl;
  final String mediaBaseUrl;
  final String imagePrefix;
  final String originalPrefix;
  final Map<String, Map<String, dynamic>> manifestFiles;
  final List<_QuickMeta> codexes;

  const _QuickCatalog({
    required this.releaseBaseUrl,
    required this.mediaBaseUrl,
    required this.imagePrefix,
    required this.originalPrefix,
    required this.manifestFiles,
    required this.codexes,
  });
}

class _QuickCodex {
  final _QuickMeta meta;
  final String title;
  final String author;
  final String version;
  final String source;
  final List<Map<String, dynamic>> entries;

  const _QuickCodex({
    required this.meta,
    required this.title,
    required this.author,
    required this.version,
    required this.source,
    required this.entries,
  });
}

String _safeCollectionId(Object? value) {
  final id = _text(value).trim();
  return RegExp(r'^[a-z0-9][a-z0-9_-]{0,127}$', caseSensitive: false)
          .hasMatch(id)
      ? id
      : '';
}

class OnlineGalleryService {
  final http.Client _client;
  _QuickCatalog? _quickCatalog;
  final Map<String, _QuickCodex> _quickCodexes = {};
  final Map<String, Future<OnlineGalleryDetail>> _detailCache = {};

  OnlineGalleryService({http.Client? client})
      : _client = client ?? http.Client();

  Map<String, String> _headers(String referer) => {
        'Accept': 'application/json',
        'Referer': referer,
        'User-Agent': _userAgent,
      };

  Future<Object?> _getJson(Uri uri, String referer) async {
    final response = await _client
        .get(uri, headers: _headers(referer))
        .timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw http.ClientException('HTTP ${response.statusCode}', uri);
    }
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  Future<OnlineGalleryPage> search({
    required OnlineGallerySource source,
    int page = 1,
    String query = '',
    String collectionId = '',
    bool safeOnly = true,
  }) {
    final targetPage = page.clamp(1, 100000).toInt();
    final safeQuery = query.trim();
    return switch (source) {
      OnlineGallerySource.danbooru ||
      OnlineGallerySource.safebooru =>
        _searchDonmai(source, targetPage, safeQuery, safeOnly),
      OnlineGallerySource.gelbooru =>
        _searchGelbooru(targetPage, safeQuery, safeOnly),
      OnlineGallerySource.quicktag =>
        _searchQuickTag(targetPage, safeQuery, collectionId, safeOnly),
      OnlineGallerySource.aitag => Future.error(
          ArgumentError('AITag is handled by its dedicated data service')),
      OnlineGallerySource.artistRanking => Future.error(
          ArgumentError('Artist ranking is handled by ArtistTagService')),
    };
  }

  Future<OnlineGalleryPage> _searchDonmai(
    OnlineGallerySource source,
    int page,
    String query,
    bool safeOnly,
  ) async {
    final base = source == OnlineGallerySource.safebooru
        ? 'https://safebooru.donmai.us'
        : 'https://danbooru.donmai.us';
    final tags = [query, if (safeOnly) 'rating:g']
        .where((item) => item.isNotEmpty)
        .join(' ');
    final uri = Uri.parse('$base/posts.json').replace(queryParameters: {
      'tags': tags,
      'limit': '$_pageSize',
      'page': '$page',
    });
    final decoded = await _getJson(uri, base);
    final raw = _list(decoded);
    final items = raw
        .map((item) => _parseDonmai(item, source))
        .where((item) => item.id.isNotEmpty && item.cover.previewUrl.isNotEmpty)
        .toList();
    return OnlineGalleryPage(
      source: source,
      page: page,
      items: items,
      hasMore: raw.isNotEmpty,
    );
  }

  OnlineGalleryItem _parseDonmai(Object? value, OnlineGallerySource source) {
    final post = _map(value);
    final id = _text(post['id']);
    final artists = _tags(post['tag_string_artist']);
    final characters = _tags(post['tag_string_character']);
    final copyrights = _tags(post['tag_string_copyright']);
    final general = _tags(post['tag_string_general']);
    final meta = _tags(post['tag_string_meta']);
    final allTags = _tags(post['tag_string']);
    final preview = _https(post['preview_file_url']);
    final display = _https(
        post['large_file_url'] ?? post['sample_url'] ?? post['file_url']);
    final download = _https(
        post['file_url'] ?? post['large_file_url'] ?? post['sample_url']);
    final base = source == OnlineGallerySource.safebooru
        ? 'https://safebooru.donmai.us'
        : 'https://danbooru.donmai.us';
    return OnlineGalleryItem(
      source: source,
      id: id,
      title: characters.firstOrNull ?? copyrights.firstOrNull ?? '#$id',
      author: artists.join(', '),
      description: allTags.take(16).join(' · '),
      createdAt: _text(post['created_at']),
      rating: _text(post['rating']).isEmpty ? 'g' : _text(post['rating']),
      score: _integer(post['score']),
      favoriteCount: _integer(post['fav_count']),
      prompt: allTags.join(', '),
      tags: OnlineGalleryTagGroups(
        artists: artists,
        characters: characters,
        copyrights: copyrights,
        general: general,
        meta: meta,
      ),
      cover: _media(
        '${source.id}:$id:0',
        preview,
        display,
        download,
        width: _integer(post['image_width']),
        height: _integer(post['image_height']),
      ),
      sourceUrl: '$base/posts/${Uri.encodeComponent(id)}',
    );
  }

  Future<OnlineGalleryPage> _searchGelbooru(
    int page,
    String query,
    bool safeOnly,
  ) async {
    final tags = [query, if (safeOnly) 'rating:general']
        .where((item) => item.isNotEmpty)
        .join(' ');
    final uri = Uri.parse('https://gelbooru.com/index.php').replace(
      queryParameters: {
        'page': 'dapi',
        's': 'post',
        'q': 'index',
        'json': '1',
        'limit': '$_pageSize',
        'pid': '${page - 1}',
        'tags': tags,
        'api_key': _gelbooruApiKey,
        'user_id': _gelbooruUserId,
      },
    );
    final decoded = await _getJson(uri, OnlineGallerySource.gelbooru.siteUrl);
    final raw = decoded is List ? decoded : _list(_map(decoded)['post']);
    final items = raw
        .map(_parseGelbooru)
        .where((item) => item.id.isNotEmpty && item.cover.previewUrl.isNotEmpty)
        .toList();
    final attributes = _map(_map(decoded)['@attributes']);
    final total = _integer(attributes['count']);
    return OnlineGalleryPage(
      source: OnlineGallerySource.gelbooru,
      page: page,
      items: items,
      total: total > 0 ? total : null,
      hasMore: raw.length >= _pageSize,
    );
  }

  OnlineGalleryItem _parseGelbooru(Object? value) {
    final post = _map(value);
    final id = _text(post['id']);
    final allTags = _tags(post['tags']);
    final preview = _https(post['preview_url']);
    final display = _https(post['sample_url'] ?? post['file_url']);
    final download = _https(post['file_url'] ?? post['sample_url']);
    return OnlineGalleryItem(
      source: OnlineGallerySource.gelbooru,
      id: id,
      title: '#$id',
      author: _text(post['owner']),
      description: allTags.take(16).join(' · '),
      createdAt: _text(post['created_at']),
      rating: _text(post['rating']).isEmpty ? 'general' : _text(post['rating']),
      score: _integer(post['score']),
      prompt: allTags.join(', '),
      tags: OnlineGalleryTagGroups(general: allTags),
      cover: _media(
        'gelbooru:$id:0',
        preview,
        display,
        download,
        width: _integer(post['width']),
        height: _integer(post['height']),
      ),
      sourceUrl:
          'https://gelbooru.com/index.php?page=post&s=view&id=${Uri.encodeComponent(id)}',
    );
  }

  Future<_QuickCatalog> _loadQuickCatalog() async {
    if (_quickCatalog != null) return _quickCatalog!;
    final source = _map(await _getJson(
        Uri.parse(_quickTagSource), OnlineGallerySource.quicktag.siteUrl));
    final baseUrl = _https(source['baseUrl']);
    final pointerName = _text(source['pointer']);
    if (baseUrl.isEmpty ||
        !RegExp(r'^[-a-z0-9_/]+\.json$', caseSensitive: false)
            .hasMatch(pointerName)) {
      throw const FormatException('Invalid QuickTagCloud data source');
    }
    // `baseUrl` currently ends in `/data` without a trailing slash. Resolving
    // `current.json` against it directly treats `data` as a file and produces
    // `/current.json`, which is a real 404 on the QuickTagCloud bucket. Always
    // normalize the bootstrap URL as a directory before resolving its pointer.
    final root = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
    final pointerUrl = _trustedQuickUri(Uri.parse(root).resolve(pointerName));
    final pointer =
        _map(await _getJson(pointerUrl, OnlineGallerySource.quicktag.siteUrl));
    final release = _safeCollectionId(pointer['release']);
    final manifestPath = _text(pointer['manifest']);
    if (release.isEmpty ||
        !RegExp(r'^releases/[a-z0-9_-]+/manifest\.json$', caseSensitive: false)
            .hasMatch(manifestPath)) {
      throw const FormatException('Invalid QuickTagCloud release pointer');
    }
    final releaseBase =
        Uri.parse(root).resolve('releases/$release/').toString();
    final manifest = _map(await _getJson(
        _trustedQuickUri(Uri.parse(root).resolve(manifestPath)),
        OnlineGallerySource.quicktag.siteUrl));
    final files = _map(manifest['files']);
    final rawCodexes = await _getJson(
        _trustedQuickUri(Uri.parse(releaseBase).resolve('codexes.json')),
        OnlineGallerySource.quicktag.siteUrl);
    final media = _map(await _getJson(
        _trustedQuickUri(Uri.parse(releaseBase).resolve('media.json')),
        OnlineGallerySource.quicktag.siteUrl));
    final catalog = _QuickCatalog(
      releaseBaseUrl: releaseBase,
      mediaBaseUrl:
          _https(media['baseUrl']).ifEmpty('https://assets.quicktagcloud.com'),
      imagePrefix: _text(media['imagePrefix']).ifEmpty('images'),
      originalPrefix: _text(media['originalPrefix']).ifEmpty('originals'),
      manifestFiles: files.map(
        (key, value) => MapEntry(key, _map(value)),
      ),
      codexes: _list(rawCodexes)
          .map(_QuickMeta.fromJson)
          .where((item) => item.id.isNotEmpty)
          .toList(),
    );
    _quickCatalog = catalog;
    return catalog;
  }

  Uri _trustedQuickUri(Uri uri) {
    const hosts = {'assets.quicktagcloud.com', 'novelai.quicktagcloud.com'};
    if (uri.scheme != 'https' || !hosts.contains(uri.host)) {
      throw const FormatException('QuickTagCloud returned an untrusted host');
    }
    return uri;
  }

  String _quickAsset(
    _QuickCatalog catalog,
    _QuickMeta meta,
    String file,
    bool original, {
    String assetCodexId = '',
  }) {
    if (file.isEmpty) return '';
    final absolute = _https(file);
    if (absolute.isNotEmpty) return absolute;
    if (meta.assetPathMode == 'relative' && meta.assetBaseUrl.isNotEmpty) {
      return _https(
          file, '${meta.assetBaseUrl.replaceFirst(RegExp(r'/+$'), '')}/');
    }
    final prefix = original ? catalog.originalPrefix : catalog.imagePrefix;
    final collection = assetCodexId.ifEmpty(meta.coverCodexId.ifEmpty(meta.id));
    return '${catalog.mediaBaseUrl.replaceFirst(RegExp(r'/+$'), '')}/${Uri.encodeComponent(prefix)}/${Uri.encodeComponent(collection)}/${file.split('/').map(Uri.encodeComponent).join('/')}';
  }

  OnlineGalleryItem _quickCollection(_QuickCatalog catalog, _QuickMeta meta) {
    final cover = _quickAsset(catalog, meta, meta.cover, false);
    return OnlineGalleryItem(
      source: OnlineGallerySource.quicktag,
      id: meta.id,
      isCollection: true,
      collectionId: meta.id,
      title: meta.title.ifEmpty(meta.id),
      author: meta.author,
      description: '${meta.version.ifEmpty('—')} · ${meta.entryCount} 条',
      createdAt: meta.version,
      rating: meta.nsfw ? 'explicit' : 'general',
      mediaCount: meta.imagedCount,
      cover: _media('quicktag:${meta.id}:cover', cover, cover, cover),
      sourceUrl: OnlineGallerySource.quicktag.siteUrl,
    );
  }

  Future<_QuickCodex> _loadQuickCodex(_QuickCatalog catalog, String id) async {
    if (_quickCodexes.containsKey(id)) return _quickCodexes[id]!;
    final meta = catalog.codexes.where((item) => item.id == id).firstOrNull;
    if (meta == null) throw StateError('QuickTagCloud collection not found');
    final canonicalName = '$id.json';
    final url = meta.dataUrl.isNotEmpty
        ? Uri.parse(meta.dataUrl)
        : _trustedQuickUri(
            Uri.parse(catalog.releaseBaseUrl).resolve(canonicalName));
    final response = await _client
        .get(url, headers: _headers(OnlineGallerySource.quicktag.siteUrl))
        .timeout(const Duration(minutes: 3));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw http.ClientException('HTTP ${response.statusCode}', url);
    }
    if (meta.dataUrl.isEmpty) {
      final expected = catalog.manifestFiles[canonicalName];
      if (expected != null) {
        final expectedSize = _integer(expected['size']);
        final expectedHash = _text(expected['sha256']);
        final actualHash = sha256.convert(response.bodyBytes).toString();
        if ((expectedSize > 0 && response.bodyBytes.length != expectedSize) ||
            (expectedHash.isNotEmpty && actualHash != expectedHash)) {
          throw const FormatException(
              'QuickTagCloud collection integrity check failed');
        }
      }
    }
    final parsed = _map(jsonDecode(utf8.decode(response.bodyBytes)));
    final codex = _QuickCodex(
      meta: meta,
      title: _text(parsed['title']).ifEmpty(meta.title),
      author: _text(parsed['author']).ifEmpty(meta.author),
      version: _text(parsed['version']).ifEmpty(meta.version),
      source: _text(parsed['source']),
      entries: _list(parsed['entries']).map(_map).toList(),
    );
    _quickCodexes[id] = codex;
    return codex;
  }

  List<OnlineGalleryMedia> _quickEntryMedia(
    _QuickCatalog catalog,
    _QuickCodex codex,
    Map<String, dynamic> entry,
    String entryId,
  ) {
    final values = _list(entry['images']).map(_map).toList();
    if (values.isEmpty &&
        (entry['image'] != null || entry['original'] != null)) {
      values.add({'path': entry['image'], 'original': entry['original']});
    }
    final assetCodexId =
        _safeCollectionId(entry['assetCodexId']).ifEmpty(codex.meta.id);
    return values.indexed
        .map((indexed) {
          final index = indexed.$1;
          final image = indexed.$2;
          final imagePath =
              _text(image['path'] ?? image['image'] ?? entry['image']);
          final originalPath =
              _text(image['original'] ?? entry['original']).ifEmpty(imagePath);
          final preview = _quickAsset(catalog, codex.meta, imagePath, false,
              assetCodexId: assetCodexId);
          final original = _quickAsset(catalog, codex.meta, originalPath, true,
                  assetCodexId: assetCodexId)
              .ifEmpty(preview);
          return _media(
            'quicktag:${codex.meta.id}:$entryId:$index',
            preview,
            preview,
            original,
            width: _integer(image['width'] ?? entry['imageWidth']),
            height: _integer(image['height'] ?? entry['imageHeight']),
          );
        })
        .where((item) => item.previewUrl.isNotEmpty)
        .toList();
  }

  OnlineGalleryItem _quickEntry(
    _QuickCatalog catalog,
    _QuickCodex codex,
    Map<String, dynamic> entry,
    int index,
  ) {
    final id = _text(entry['id']).ifEmpty('${codex.meta.id}_${index + 1}');
    final media = _quickEntryMedia(catalog, codex, entry, id);
    final prompt = _text(entry['tags'] ?? entry['prompt']);
    final path = _list(entry['path'])
        .map(_text)
        .where((item) => item.isNotEmpty)
        .toList();
    final authors = [
      _text(entry['credit']),
      _text(entry['author']),
      codex.author,
    ].where((item) => item.isNotEmpty).toSet().join(' · ');
    return OnlineGalleryItem(
      source: OnlineGallerySource.quicktag,
      id: id,
      collectionId: codex.meta.id,
      title: _text(entry['title']).ifEmpty(id),
      author: authors,
      description: _text(entry['note']).ifEmpty(path.join(' / ')),
      createdAt: codex.version,
      rating:
          codex.meta.nsfw || _boolean(entry['nsfw']) ? 'explicit' : 'general',
      mediaCount: media.length,
      prompt: prompt,
      negativePrompt: _text(entry['negative'] ?? entry['negativePrompt']),
      tags: OnlineGalleryTagGroups(
        general: prompt
            .split(',')
            .map((item) => item.trim())
            .where((item) => item.isNotEmpty)
            .toList(),
      ),
      cover: media.firstOrNull ??
          _media('quicktag:${codex.meta.id}:$id:0', '', '', ''),
      sourceUrl:
          _https(codex.source).ifEmpty(OnlineGallerySource.quicktag.siteUrl),
    );
  }

  Future<OnlineGalleryPage> _searchQuickTag(
    int page,
    String query,
    String collectionId,
    bool safeOnly,
  ) async {
    final catalog = await _loadQuickCatalog();
    final search = query.toLowerCase();
    final safeCollection = _safeCollectionId(collectionId);
    if (safeCollection.isEmpty) {
      final filtered = catalog.codexes
          .where((item) => !safeOnly || !item.nsfw)
          .where((item) =>
              search.isEmpty ||
              [item.title, item.author, item.id]
                  .join(' ')
                  .toLowerCase()
                  .contains(search))
          .toList();
      final offset = (page - 1) * _pageSize;
      final items = filtered
          .skip(offset)
          .take(_pageSize)
          .map((item) => _quickCollection(catalog, item))
          .toList();
      return OnlineGalleryPage(
        source: OnlineGallerySource.quicktag,
        page: page,
        total: filtered.length,
        hasMore: offset + _pageSize < filtered.length,
        items: items,
      );
    }
    final codex = await _loadQuickCodex(catalog, safeCollection);
    if (safeOnly && codex.meta.nsfw) {
      throw StateError('This collection is hidden by the all-ages filter');
    }
    final all = codex.entries.indexed
        .map((entry) => _quickEntry(catalog, codex, entry.$2, entry.$1))
        .where((item) =>
            search.isEmpty ||
            [item.title, item.author, item.description, item.prompt]
                .join(' ')
                .toLowerCase()
                .contains(search))
        .toList();
    final offset = (page - 1) * _pageSize;
    return OnlineGalleryPage(
      source: OnlineGallerySource.quicktag,
      page: page,
      total: all.length,
      hasMore: offset + _pageSize < all.length,
      collectionId: safeCollection,
      collectionTitle: codex.title,
      items: all.skip(offset).take(_pageSize).toList(),
    );
  }

  Future<OnlineGalleryDetail> detail(OnlineGalleryItem item) {
    final key = '${item.source.id}:${item.collectionId}:${item.id}';
    return _detailCache.putIfAbsent(key, () async {
      try {
        return switch (item.source) {
          OnlineGallerySource.danbooru ||
          OnlineGallerySource.safebooru =>
            _donmaiDetail(item),
          OnlineGallerySource.gelbooru => _gelbooruDetail(item),
          OnlineGallerySource.quicktag => _quickDetail(item),
          OnlineGallerySource.aitag =>
            Future.error(ArgumentError('AITag uses its own detail service')),
          OnlineGallerySource.artistRanking =>
            Future.error(ArgumentError('Artist ranking has no gallery detail')),
        };
      } catch (_) {
        _detailCache.remove(key);
        rethrow;
      }
    });
  }

  Future<OnlineGalleryDetail> _donmaiDetail(OnlineGalleryItem item) async {
    final base = item.source == OnlineGallerySource.safebooru
        ? 'https://safebooru.donmai.us'
        : 'https://danbooru.donmai.us';
    final decoded = await _getJson(
        Uri.parse('$base/posts/${Uri.encodeComponent(item.id)}.json'), base);
    final parsed = _parseDonmai(decoded, item.source);
    return OnlineGalleryDetail(
      item: parsed,
      media: [parsed.cover],
      prompt: parsed.prompt,
      negativePrompt: '',
      metadata: _map(decoded),
    );
  }

  Future<OnlineGalleryDetail> _gelbooruDetail(OnlineGalleryItem item) async {
    final uri = Uri.parse('https://gelbooru.com/index.php').replace(
      queryParameters: {
        'page': 'dapi',
        's': 'post',
        'q': 'index',
        'json': '1',
        'id': item.id,
        'api_key': _gelbooruApiKey,
        'user_id': _gelbooruUserId,
      },
    );
    final decoded = await _getJson(uri, OnlineGallerySource.gelbooru.siteUrl);
    final posts = decoded is List ? decoded : _list(_map(decoded)['post']);
    if (posts.isEmpty) throw StateError('Gelbooru post not found');
    final parsed = _parseGelbooru(posts.first);
    return OnlineGalleryDetail(
      item: parsed,
      media: [parsed.cover],
      prompt: parsed.prompt,
      negativePrompt: '',
      metadata: _map(posts.first),
    );
  }

  Future<OnlineGalleryDetail> _quickDetail(OnlineGalleryItem item) async {
    final catalog = await _loadQuickCatalog();
    final codex = await _loadQuickCodex(catalog, item.collectionId);
    final indexed = codex.entries.indexed.where((entry) {
      final id =
          _text(entry.$2['id']).ifEmpty('${codex.meta.id}_${entry.$1 + 1}');
      return id == item.id;
    }).firstOrNull;
    if (indexed == null) throw StateError('QuickTagCloud entry not found');
    final parsed = _quickEntry(catalog, codex, indexed.$2, indexed.$1);
    final path = _list(indexed.$2['path'])
        .map(_text)
        .where((entry) => entry.isNotEmpty)
        .toList();
    return OnlineGalleryDetail(
      item: parsed,
      media: _quickEntryMedia(catalog, codex, indexed.$2, parsed.id),
      prompt: parsed.prompt,
      negativePrompt: parsed.negativePrompt,
      note: _text(indexed.$2['note']),
      categoryPath: path,
      metadata: {
        'collectionId': codex.meta.id,
        'collectionTitle': codex.title,
        'collectionVersion': codex.version,
        'entry': indexed.$2,
      },
    );
  }

  void clearCache() {
    _quickCatalog = null;
    _quickCodexes.clear();
    _detailCache.clear();
  }

  void close() => _client.close();
}

extension _NullableIterableFirst<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

extension _StringFallback on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
