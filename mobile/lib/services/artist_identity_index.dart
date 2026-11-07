import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

const artistIndexByteLimit = 2 * 1024 * 1024;
const _indexKey = 'artist_identity_index_v1';
final _start = RegExp(r'https?://', caseSensitive: false);
final _tag = RegExp(r"^[\p{L}\p{N}_().'\u2019-]{1,160}$", unicode: true);
bool validLookupTag(String value) =>
    _tag.hasMatch(value) && !value.startsWith('-');
typedef ArtistProfile = ({String key, String value, bool isUrl});

ArtistProfile? lookupProfile(String input) {
  if (input.isEmpty ||
      input.length > 512 ||
      RegExp(r'[\x00-\x1f*\\]').hasMatch(input)) return null;
  if (!input.contains('://')) {
    if (input.length > 120 ||
        !RegExp(r"^[\p{L}\p{N}_(). '\u2019-]+$", unicode: true)
            .hasMatch(input)) {
      return null;
    }
    final value = input.trim().replaceAll(RegExp(r'\s+'), '_');
    return value.isEmpty
        ? null
        : (key: 'name:${value.toLowerCase()}', value: value, isUrl: false);
  }
  if (!RegExp(r'^https?://[^/?#:@]+(?:[/?#]|$)', caseSensitive: false)
      .hasMatch(input)) return null;
  final url = Uri.tryParse(input);
  if (url == null || url.hasPort || url.userInfo.isNotEmpty) return null;
  if (const ['pixiv.net', 'www.pixiv.net'].contains(url.host)) {
    final id = RegExp(r'^/(?:[a-z]{2}/)?users/(\d{1,20})/?$',
                caseSensitive: false)
            .firstMatch(url.path)
            ?.group(1) ??
        (url.path == '/member.php' && url.queryParametersAll['id']?.length == 1
            ? url.queryParameters['id']
            : null);
    if (id != null &&
        RegExp(r'^\d{1,20}$').hasMatch(id) &&
        !RegExp(r'^0+$').hasMatch(id)) {
      final value = id.replaceFirst(RegExp(r'^0+'), '');
      return (
        key: 'pixiv:$value',
        value: 'https://www.pixiv.net/users/$value',
        isUrl: true
      );
    }
  }
  if (const [
    'x.com',
    'www.x.com',
    'twitter.com',
    'www.twitter.com',
    'mobile.twitter.com'
  ].contains(url.host)) {
    final handle =
        RegExp(r'^/([a-z0-9_]{1,15})(?:/status/\d+)?/?$', caseSensitive: false)
            .firstMatch(url.path)
            ?.group(1)
            ?.toLowerCase();
    if (handle != null &&
        !const [
          'home',
          'search',
          'i',
          'intent',
          'explore',
          'settings',
          'share',
          'messages',
          'notifications',
          'compose',
          'login',
          'signup'
        ].contains(handle)) {
      return (
        key: 'x:$handle',
        value: 'https://twitter.com/$handle',
        isUrl: true
      );
    }
  }
  return null;
}

({List<ArtistProfile> profiles, int invalid}) parseArtistBatch(String input) {
  if (input.length > 12000) throw const FormatException('Invalid artist batch');
  final items = <String, ArtistProfile>{};
  var invalid = 0;
  for (final line in input.split(RegExp(r'[\r\n,，;；]+'))) {
    final chunks = _start.hasMatch(line)
        ? line.split(RegExp(r'(?=https?://)|\s+', caseSensitive: false))
        : [line];
    for (final chunk in chunks) {
      if (chunk.trim().isEmpty) continue;
      final profile = lookupProfile(chunk.trim());
      if (profile == null) {
        invalid++;
        continue;
      }
      items.putIfAbsent(profile.key, () => profile);
    }
  }
  if (items.isEmpty || items.length > 12) {
    throw const FormatException('Invalid artist batch');
  }
  return (profiles: items.values.toList(), invalid: invalid);
}

List<String> artistIdentityUrls(Iterable<Object?> values) {
  final urls = <String>{};
  for (var value in values.take(100)) {
    if (value is Map) {
      if (value['is_active'] == false) continue;
      value = value['url'];
    }
    final profile = value is String ? lookupProfile(value) : null;
    if (profile?.isUrl == true) urls.add(profile!.value);
    if (urls.length == 20) break;
  }
  return urls.toList();
}

typedef ArtistIndexRow = ({
  int id,
  String tag,
  List<String> urls,
  int savedAt,
  String source
});
typedef ArtistPreview = ({int id, String url, DateTime date});
bool artistIndexMatch(ArtistProfile profile, ArtistIndexRow row) =>
    profile.isUrl
        ? row.urls.contains(profile.value)
        : row.tag.toLowerCase() == profile.value.toLowerCase();

List<ArtistIndexRow> readArtistIndex(String raw, {bool imported = false}) {
  if (raw.length > artistIndexByteLimit ||
      utf8.encode(raw).length > artistIndexByteLimit) {
    throw const FormatException('Index too large');
  }
  final data = jsonDecode(raw);
  if (data is! Map ||
      data['version'] != 1 ||
      data['artists'] is! List ||
      (data['artists'] as List).length > 2000) {
    throw const FormatException('Invalid index');
  }
  final rows = <ArtistIndexRow>[];
  for (final raw in data['artists'] as List) {
    if (raw is! Map) throw const FormatException('Invalid row');
    final id = raw['id'], tag = raw['tag'], savedAt = raw['savedAt'];
    final urls = raw['urls'] is List
        ? artistIdentityUrls(raw['urls'] as List)
        : <String>[];
    if (id is! int ||
        id <= 0 ||
        id > 9007199254740991 ||
        tag is! String ||
        !validLookupTag(tag) ||
        savedAt is! int ||
        savedAt <= 0 ||
        savedAt > DateTime.now().millisecondsSinceEpoch + 300000 ||
        urls.isEmpty) {
      throw const FormatException('Invalid artist identity');
    }
    rows.add((
      id: id,
      tag: tag,
      urls: urls,
      savedAt: savedAt,
      source: !imported && raw['source'] == 'danbooru' ? 'danbooru' : 'import'
    ));
  }
  return rows;
}

String encodeArtistIndex(List<ArtistIndexRow> rows) => jsonEncode({
      'version': 1,
      'artists': rows
          .map((row) => {
                'id': row.id,
                'tag': row.tag,
                'urls': row.urls,
                'savedAt': row.savedAt,
                'source': row.source
              })
          .toList()
    });

class ArtistIdentityIndex {
  Future<List<ArtistIndexRow>> load() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      return readArtistIndex(prefs.getString(_indexKey) ?? '');
    } on FormatException {
      return [];
    }
  }

  Future<List<ArtistIndexRow>> merge(List<ArtistIndexRow> updates) async {
    final prefs = await SharedPreferences.getInstance();
    final rows = <int, ArtistIndexRow>{};
    for (final row in [...await load(), ...updates]) {
      final previous = rows[row.id];
      if (previous == null ||
          (previous.source == row.source && row.savedAt >= previous.savedAt) ||
          (row.source == 'danbooru' && previous.source != 'danbooru')) {
        rows[row.id] = row;
      }
    }
    final sorted = (rows.values.toList()
          ..sort((a, b) => b.savedAt.compareTo(a.savedAt)))
        .take(2000)
        .toList();
    var body = encodeArtistIndex(sorted);
    while (
        utf8.encode(body).length > artistIndexByteLimit && sorted.isNotEmpty) {
      sorted.removeRange((sorted.length * .85).floor(), sorted.length);
      body = encodeArtistIndex(sorted);
    }
    if (!await prefs.setString(_indexKey, body)) {
      throw StateError('Cannot save artist index');
    }
    return sorted;
  }
}

String formatLookupPrompt(Map<String, double> items, {required bool v5}) =>
    items.entries.where((entry) => validLookupTag(entry.key)).map((entry) {
      final value = entry.value.isFinite
          ? (entry.value.clamp(.01, 5) * 100).round() / 100
          : 1.0;
      final number = value == value.roundToDouble()
          ? value.toInt().toString()
          : value.toString();
      return v5
          ? '$number::artist:${entry.key} ::'
          : value == 1
              ? entry.key
              : '$number::${entry.key} ::';
    }).join(', ');

List<ArtistPreview> parseLookupPreviews(dynamic data) {
  if (data is! List) throw const FormatException('Invalid previews');
  final rows = <ArtistPreview>[];
  for (final raw in data) {
    if (raw is! Map || raw['rating'] != 'g' || raw['is_deleted'] == true) {
      continue;
    }
    final id = raw['id'],
        url = raw['preview_file_url'],
        date = DateTime.tryParse(raw['created_at']?.toString() ?? '');
    if (id is! int ||
        id <= 0 ||
        date == null ||
        url is! String ||
        !RegExp(r'^https://(?:cdn\.donmai\.us|danbooru\.donmai\.us)/[a-z0-9/_-]+\.(?:jpg|jpeg|png|webp)$',
                caseSensitive: false)
            .hasMatch(url)) continue;
    rows.add((id: id, url: url, date: date));
  }
  return (rows..sort((a, b) => b.id.compareTo(a.id))).take(4).toList();
}
