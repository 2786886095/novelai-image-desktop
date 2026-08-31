import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import '../models/nai_models.dart';
import '../services/proxy_http_client.dart';

const _pinnedCommit = '2975a0aae0a375abf9d3f7abadc19276633a8e42';
const _downloadUrl =
    'https://raw.githubusercontent.com/SuzumiyaAkizuki/DanbooruSearchOnline/'
    '$_pinnedCommit/origin_database/tags_enhanced.csv';
const _maxDownloadBytes = 20 * 1024 * 1024;
const _minimumRecords = 10000;

class OfflineTagHit {
  final String tag;
  final List<String> chinese;
  final int postCount;
  final int category;

  const OfflineTagHit({
    required this.tag,
    required this.chinese,
    required this.postCount,
    required this.category,
  });
}

class OfflineTagStatus {
  final bool downloaded;
  final int sizeBytes;
  final int count;

  const OfflineTagStatus({
    this.downloaded = false,
    this.sizeBytes = 0,
    this.count = 0,
  });
}

class OfflineArtistStyleCatalog {
  final List<OfflineTagHit> items;
  final int total;

  const OfflineArtistStyleCatalog({
    required this.items,
    required this.total,
  });
}

class OfflineTagStore {
  static const _channel = MethodChannel('langbai.novelai/native_text');
  List<OfflineTagHit>? _index;

  Future<Directory> _directory() async {
    final root = await getApplicationSupportDirectory();
    final directory = Directory('${root.path}/tag-data');
    if (!directory.existsSync()) directory.createSync(recursive: true);
    return directory;
  }

  Future<File> _dataFile() async =>
      File('${(await _directory()).path}/danbooru-cn.csv');
  Future<File> _metaFile() async =>
      File('${(await _directory()).path}/danbooru-cn.json');

  Future<OfflineTagStatus> status() async {
    final data = await _dataFile();
    if (!data.existsSync()) return const OfflineTagStatus();
    var count = 0;
    final meta = await _metaFile();
    if (meta.existsSync()) {
      try {
        final value = jsonDecode(await meta.readAsString());
        count = (value['count'] as num?)?.toInt() ?? 0;
      } catch (_) {}
    }
    return OfflineTagStatus(
      downloaded: count >= _minimumRecords,
      sizeBytes: await data.length(),
      count: count,
    );
  }

  Future<String> download(AppSettings settings) async {
    final client = createProxyHttpClient(settings, scope: ProxyScope.mcp);
    Uint8List bytes;
    try {
      final response = await client
          .get(Uri.parse(_downloadUrl))
          .timeout(const Duration(seconds: 120));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('HTTP ${response.statusCode}');
      }
      bytes = response.bodyBytes;
    } finally {
      client.close();
    }
    if (bytes.length > _maxDownloadBytes) {
      throw Exception('Downloaded content exceeds the 20 MB limit');
    }
    final decoded = await decodeGbk(bytes);
    final parsed = parseTagCsv(decoded);
    if (parsed.length < _minimumRecords) {
      throw Exception(
          'Tag data validation failed: only ${parsed.length} records parsed');
    }
    final target = await _dataFile();
    final temporary = File('${target.path}.tmp');
    await temporary.writeAsBytes(bytes, flush: true);
    if (target.existsSync()) await target.delete();
    await temporary.rename(target.path);
    final meta = await _metaFile();
    await meta.writeAsString(
      jsonEncode({'count': parsed.length, 'commit': _pinnedCommit}),
      flush: true,
    );
    _index = parsed;
    return 'Tag library downloaded (${parsed.length} records with Chinese aliases)';
  }

  Future<List<OfflineTagHit>> search(String query, {int limit = 12}) async {
    final raw = query.trim();
    if (raw.isEmpty) return [];
    final index = await _load();
    if (index.isEmpty) return [];
    final cjk = RegExp(r'[\u3400-\u9fff]').hasMatch(raw);
    final normalized = raw.toLowerCase().replaceAll('_', ' ');
    final scored = <({OfflineTagHit hit, int score})>[];
    for (final hit in index) {
      var score = 0;
      if (cjk) {
        for (final alias in hit.chinese) {
          if (alias == raw) {
            score = 3;
            break;
          }
          if (alias.startsWith(raw)) {
            score = score < 2 ? 2 : score;
          } else if (alias.contains(raw) && score < 1) {
            score = 1;
          }
        }
      } else {
        final name = hit.tag.toLowerCase().replaceAll('_', ' ');
        if (name == normalized) {
          score = 3;
        } else if (name.startsWith(normalized)) {
          score = 2;
        } else if (name.contains(normalized)) {
          score = 1;
        }
      }
      if (score > 0) scored.add((hit: hit, score: score));
    }
    scored.sort((left, right) {
      final byScore = right.score.compareTo(left.score);
      return byScore != 0
          ? byScore
          : right.hit.postCount.compareTo(left.hit.postCount);
    });
    return scored.take(limit).map((item) => item.hit).toList();
  }

  /// Lazily browses the two namespaces used by the artist-string style picker.
  /// Danbooru has no general "style" category: explicit `_(style)` tags are
  /// the precise parody/style set, while category 3 contains source works
  /// (anime, manga, games and novels).
  Future<OfflineArtistStyleCatalog> browseArtistStyleCatalog({
    required String scope,
    String query = '',
    int offset = 0,
    int limit = 120,
  }) async {
    final index = await _load();
    final needle = query.trim().toLowerCase().replaceAll('_', ' ');
    final isChinese = RegExp(r'[\u3400-\u9fff]').hasMatch(needle);
    final filtered = index.where((hit) {
      final inScope = scope == 'copyright'
          ? hit.category == 3
          : hit.category == 0 && hit.tag.toLowerCase().endsWith('_(style)');
      if (!inScope) return false;
      if (needle.isEmpty) return true;
      final name = hit.tag.toLowerCase().replaceAll('_', ' ');
      if (name.contains(needle)) return true;
      return isChinese && hit.chinese.any((alias) =>
          alias.toLowerCase().replaceAll('_', ' ').contains(needle));
    }).toList();
    final safeOffset = offset.clamp(0, filtered.length).toInt();
    final safeLimit = limit.clamp(1, 500).toInt();
    return OfflineArtistStyleCatalog(
      items: filtered.skip(safeOffset).take(safeLimit).toList(),
      total: filtered.length,
    );
  }

  /// Finds complete mature tags inside a longer description or generated
  /// draft. Longer semantic matches outrank broad popular tags; post count is
  /// used only as a tie-breaker.
  Future<List<OfflineTagHit>> searchConcepts(String query,
      {int limit = 12}) async {
    final raw = query.trim();
    if (raw.isEmpty) return const [];
    final index = await _load();
    if (index.isEmpty) return const [];
    final english = raw.toLowerCase().replaceAll('_', ' ');
    final scored = <({OfflineTagHit hit, int score})>[];
    for (final hit in index) {
      if (hit.category == 1 || hit.category == 5) continue;
      final name = hit.tag.toLowerCase().replaceAll('_', ' ').trim();
      var score = 0;
      if (name.length >= 3 && english.contains(name)) {
        score = 80 + (name.length * 4).clamp(0, 80);
      }
      for (final alias in hit.chinese) {
        final candidate = alias.trim();
        if (candidate.length < 2 || !raw.contains(candidate)) continue;
        final aliasScore = 90 + (candidate.length * 8).clamp(0, 90);
        if (aliasScore > score) score = aliasScore;
      }
      if (score > 0) scored.add((hit: hit, score: score));
    }
    scored.sort((left, right) {
      final byScore = right.score.compareTo(left.score);
      return byScore != 0
          ? byScore
          : right.hit.postCount.compareTo(left.hit.postCount);
    });
    return scored.take(limit).map((item) => item.hit).toList();
  }

  Future<List<OfflineTagHit>> _load() async {
    final cached = _index;
    if (cached != null) return cached;
    final file = await _dataFile();
    if (!file.existsSync()) return const [];
    final parsed = parseTagCsv(await decodeGbk(await file.readAsBytes()));
    _index = parsed;
    return parsed;
  }

  static Future<String> decodeGbk(Uint8List bytes) async {
    try {
      final decoded = await _channel.invokeMethod<String>('decodeGbk', bytes);
      if (decoded != null) return decoded;
    } on MissingPluginException {
      // Tests and non-Android development builds can still parse UTF-8 fixtures.
    }
    return utf8.decode(bytes, allowMalformed: false);
  }
}

List<OfflineTagHit> parseTagCsv(String text) {
  final lines = const LineSplitter().convert(text);
  if (lines.isEmpty ||
      !lines.first.toLowerCase().contains('name') ||
      !lines.first.toLowerCase().contains('cn_name')) {
    throw const FormatException(
        'Invalid header (missing name/cn_name columns)');
  }
  final result = <OfflineTagHit>[];
  for (final line in lines.skip(1)) {
    if (line.trim().isEmpty) continue;
    final columns = parseCsvLine(line);
    final name = columns.isEmpty ? '' : columns[0].trim();
    if (name.isEmpty) continue;
    final chinese = (columns.length > 1 ? columns[1] : '')
        .split(',')
        .map((value) => value.trim())
        .where((value) => value.isNotEmpty)
        .toList();
    if (chinese.isEmpty) continue;
    result.add(OfflineTagHit(
      tag: name,
      chinese: chinese,
      postCount: columns.length > 3 ? int.tryParse(columns[3]) ?? 0 : 0,
      category: columns.length > 4 ? int.tryParse(columns[4]) ?? 0 : 0,
    ));
  }
  result.sort((left, right) => right.postCount.compareTo(left.postCount));
  return result;
}

List<String> parseCsvLine(String line) {
  final output = <String>[];
  final current = StringBuffer();
  var quoted = false;
  for (var index = 0; index < line.length; index++) {
    final character = line[index];
    if (quoted) {
      if (character == '"') {
        if (index + 1 < line.length && line[index + 1] == '"') {
          current.write('"');
          index++;
        } else {
          quoted = false;
        }
      } else {
        current.write(character);
      }
    } else if (character == '"') {
      quoted = true;
    } else if (character == ',') {
      output.add(current.toString());
      current.clear();
    } else {
      current.write(character);
    }
  }
  output.add(current.toString());
  return output;
}
