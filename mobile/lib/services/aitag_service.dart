import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

const aitagSiteUrl = 'https://aitag.win';
const aitagPageSize = 60;
const _maxCachedImageBytes = 64 * 1024 * 1024;

String _string(Object? value) => value == null ? '' : value.toString();
int _integer(Object? value) => int.tryParse(_string(value)) ?? 0;

Object? parseAitagJson(Object? value) {
  if (value is! String || value.trim().isEmpty) return value;
  try {
    return jsonDecode(value);
  } catch (_) {
    return value;
  }
}

List<String> _stringList(Object? value) {
  final parsed = parseAitagJson(value);
  if (parsed is List) {
    return parsed.map(_string).where((item) => item.isNotEmpty).toList();
  }
  return parsed is String
      ? parsed
          .split(',')
          .map((item) => item.trim())
          .where((item) => item.isNotEmpty)
          .toList()
      : const [];
}

class AitagWork {
  final int id;
  final String userId;
  final String title;
  final String caption;
  final List<String> tags;
  final String createDate;
  final String aiType;
  final int totalView;
  final int totalBookmarks;
  final int imageCount;

  const AitagWork({
    required this.id,
    required this.userId,
    required this.title,
    required this.caption,
    required this.tags,
    required this.createDate,
    required this.aiType,
    required this.totalView,
    required this.totalBookmarks,
    required this.imageCount,
  });

  factory AitagWork.fromJson(Map<String, dynamic> json) => AitagWork(
        id: _integer(json['id']),
        userId: _string(json['userId'] ?? json['userid']),
        title: _string(json['title']),
        caption: _string(json['caption']),
        tags: _stringList(json['tags']),
        createDate: _string(json['create_date'] ?? json['createDate']),
        aiType: _string(json['AI_type'] ?? json['ai_type'] ?? json['aiType']),
        totalView: _integer(json['total_view'] ?? json['totalView']),
        totalBookmarks:
            _integer(json['total_bookmarks'] ?? json['totalBookmarks']),
        imageCount: _integer(json['image_count'] ?? json['imageCount']),
      );
}

class AitagImage {
  final int id;
  final String authorId;
  final String imageType;
  final String model;
  final String fileName;
  final Object? aiJson;
  final String promptText;

  const AitagImage({
    required this.id,
    required this.authorId,
    required this.imageType,
    required this.model,
    required this.fileName,
    required this.aiJson,
    required this.promptText,
  });

  factory AitagImage.fromJson(Map<String, dynamic> json) => AitagImage(
        id: _integer(json['id']),
        authorId: _string(json['author_id'] ?? json['authorId']),
        imageType: _string(json['image_type'] ?? json['imageType']),
        model: _string(json['model']),
        fileName: _string(json['file_name'] ?? json['fileName']),
        aiJson: parseAitagJson(json['ai_json'] ?? json['aiJson']),
        promptText: _string(json['prompt_text'] ?? json['promptText']),
      );
}

class AitagWorkDetail {
  final AitagWork work;
  final List<AitagImage> images;
  const AitagWorkDetail({required this.work, required this.images});
}

class AitagSearchResult {
  final int page;
  final int total;
  final List<AitagWork> items;
  const AitagSearchResult(
      {required this.page, required this.total, required this.items});
}

class AitagService {
  final http.Client _client;
  String assetBaseUrl = 'https://ai-img.10118899.xyz/';
  List<int> availableYears = const [];
  List<String> availableMonths = const [];
  final Map<int, Future<AitagWorkDetail>> _detailCache = {};

  AitagService({http.Client? client}) : _client = client ?? http.Client();

  Future<Map<String, dynamic>> _get(Uri uri,
      {bool emptySearchOnNotFound = false}) async {
    final response = await _client.get(uri, headers: const {
      'Accept': 'application/json',
      'User-Agent': 'Langbai-NovelAI-Studio-Mobile/AITag-Data-Client',
    }).timeout(const Duration(seconds: 30));
    if (emptySearchOnNotFound && response.statusCode == 404) {
      return <String, dynamic>{};
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw http.ClientException('AITag HTTP ${response.statusCode}', uri);
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('Invalid AITag response');
    }
    return decoded;
  }

  Future<void> loadConfig() async {
    final data = await _get(Uri.parse('$aitagSiteUrl/api/config'));
    final base = _string(data['asset_base_url'] ?? data['assetBaseUrl']).trim();
    if (base.isNotEmpty) assetBaseUrl = base;
    availableYears = (data['available_years'] is List
            ? data['available_years'] as List
            : const [])
        .map(_integer)
        .where((year) => year >= 2000 && year <= 2200)
        .toList();
    availableMonths = (data['available_months'] is List
            ? data['available_months'] as List
            : const [])
        .map(_string)
        .where((month) => RegExp(r'^\d{4}-(?:0[1-9]|1[0-2])$').hasMatch(month))
        .toList();
  }

  Future<AitagSearchResult> search({
    int page = 1,
    String query = '',
    String prompt = '',
    String sort = 'new',
    String? timeRange,
  }) async {
    final monthly = sort == 'monthly';
    final selectedTimeRange = _validTimeRange(timeRange)
        ? timeRange!
        : monthly
            ? 'current'
            : 'all';
    final historicalRank = monthly && selectedTimeRange != 'current';
    final params = <String, String>{
      'page': '${page.clamp(1, 10000)}',
      'page_size': '$aitagPageSize',
      if (query.trim().isNotEmpty)
        'q': query.trim().substring(0, query.trim().length.clamp(0, 2000)),
      if (prompt.trim().isNotEmpty)
        'prompt':
            prompt.trim().substring(0, prompt.trim().length.clamp(0, 2000)),
      if (!monthly) 'sort': 'new',
      if (!monthly) 'time_range': selectedTimeRange,
      if (historicalRank)
        'month': selectedTimeRange == 'older'
            ? 'older'
            : selectedTimeRange.substring(1),
    };
    final path = monthly
        ? historicalRank
            ? '/api/rank/monthly/fixed'
            : '/api/rank/monthly/real'
        : '/api/ai_works_search';
    final data = await _get(
        Uri.parse('$aitagSiteUrl$path').replace(queryParameters: params),
        emptySearchOnNotFound: true);
    final rawItems = data['items'] is List ? data['items'] as List : const [];
    return AitagSearchResult(
      page: _integer(data['page']).clamp(1, 10000),
      total: _integer(data['total']).clamp(0, 1 << 31),
      items: rawItems
          .whereType<Map>()
          .map((item) => AitagWork.fromJson(Map<String, dynamic>.from(item)))
          .where((item) => item.id > 0)
          .toList(),
    );
  }

  Future<AitagWorkDetail> work(int id) {
    if (id <= 0) {
      return Future.error(const FormatException('Invalid AITag work id'));
    }
    return _detailCache.putIfAbsent(id, () async {
      try {
        final data = await _get(Uri.parse('$aitagSiteUrl/api/work/$id'));
        final workJson = data['work'] is Map
            ? Map<String, dynamic>.from(data['work'] as Map)
            : <String, dynamic>{};
        final rawImages =
            data['images'] is List ? data['images'] as List : const [];
        return AitagWorkDetail(
          work: AitagWork.fromJson(workJson),
          images: rawImages
              .whereType<Map>()
              .map((image) =>
                  AitagImage.fromJson(Map<String, dynamic>.from(image)))
              .toList(),
        );
      } catch (_) {
        _detailCache.remove(id);
        rethrow;
      }
    });
  }

  void clearDetailCache() => _detailCache.clear();

  Future<File> cachedImage(String url, {int retentionDays = 30}) =>
      AitagImageCache.get(url, _client, retentionDays: retentionDays);

  String imageUrl(AitagImage image) {
    if (image.authorId.isEmpty ||
        image.imageType.isEmpty ||
        image.fileName.isEmpty) return '';
    final base = assetBaseUrl.replaceFirst(RegExp(r'/+$'), '');
    final parts = [image.imageType, image.authorId, '${image.fileName}.webp']
        .map(Uri.encodeComponent);
    return '$base/${parts.join('/')}';
  }

  void close() => _client.close();
}

class AitagImageCache {
  static Future<Directory> _directory() async {
    final root = await getTemporaryDirectory();
    return Directory('${root.path}${Platform.pathSeparator}aitag-image-cache');
  }

  static Future<void> prune({int retentionDays = 30}) async {
    if (retentionDays <= 0) return;
    final dir = await _directory();
    if (!await dir.exists()) return;
    final threshold = DateTime.now().subtract(Duration(days: retentionDays));
    await for (final entity in dir.list()) {
      if (entity is! File) continue;
      final stat = await entity.stat();
      if (stat.modified.isBefore(threshold)) await entity.delete();
    }
  }

  static Future<File> get(String url, http.Client client,
      {int retentionDays = 30}) async {
    final uri = Uri.parse(url);
    if (uri.scheme != 'https') throw const FormatException('HTTPS required');
    await prune(retentionDays: retentionDays);
    final dir = await _directory();
    await dir.create(recursive: true);
    final ext = RegExp(r'\.(png|jpe?g|webp|gif)$', caseSensitive: false)
            .firstMatch(uri.path)
            ?.group(0) ??
        '.webp';
    final file = File(
        '${dir.path}${Platform.pathSeparator}${sha256.convert(utf8.encode(url))}$ext');
    if (await file.exists() && await file.length() > 0) {
      await file.setLastModified(DateTime.now());
      return file;
    }
    final response = await client.get(uri).timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 ||
        response.statusCode >= 300 ||
        response.bodyBytes.isEmpty) {
      throw http.ClientException(
          'AITag image HTTP ${response.statusCode}', uri);
    }
    if (response.bodyBytes.length > _maxCachedImageBytes) {
      throw http.ClientException('AITag image too large', uri);
    }
    await file.writeAsBytes(response.bodyBytes, flush: true);
    return file;
  }

  static Future<({int bytes, int files})> stats() async {
    final dir = await _directory();
    if (!await dir.exists()) return (bytes: 0, files: 0);
    var bytes = 0;
    var files = 0;
    await for (final entity in dir.list()) {
      if (entity is File) {
        bytes += await entity.length();
        files++;
      }
    }
    return (bytes: bytes, files: files);
  }

  static Future<void> clear() async {
    final dir = await _directory();
    if (await dir.exists()) await dir.delete(recursive: true);
  }
}

bool _validTimeRange(String? value) =>
    value != null &&
    RegExp(
      r'^(?:all|older|current|y\d{4}|q\d{4}Q[1-4]|m\d{4}-(?:0[1-9]|1[0-2]))$',
    ).hasMatch(value);

String formatAitagMetadata(Object? value) {
  if (value is String) return value;
  try {
    return const JsonEncoder.withIndent('  ').convert(value);
  } catch (_) {
    return _string(value);
  }
}

Map<String, String> aitagMetadataRecord(AitagImage image, String aiType) {
  final parsed = image.aiJson;
  final source =
      parsed is Map ? Map<String, dynamic>.from(parsed) : <String, dynamic>{};
  final result = <String, String>{};
  for (final entry in source.entries) {
    result[entry.key] = entry.value is String
        ? entry.value as String
        : formatAitagMetadata(entry.value);
  }
  if (parsed is String && parsed.trim().isNotEmpty) {
    result['parameters'] = parsed;
  }
  if (source['parameters'] is String) {
    result['parameters'] = source['parameters'] as String;
  }
  if (source['prompt'] is Map) {
    result['prompt'] = formatAitagMetadata(source['prompt']);
  }
  if (source['workflow'] is Map) {
    result['workflow'] = formatAitagMetadata(source['workflow']);
  }
  final novelAi = RegExp('novel|nai', caseSensitive: false)
      .hasMatch('$aiType ${image.model}');
  if (novelAi &&
      !result.containsKey('parameters') &&
      !result.containsKey('prompt') &&
      !result.containsKey('workflow')) {
    result['Description'] = result['Description'] ?? image.promptText;
    result['Comment'] = result['Comment'] ?? formatAitagMetadata(source);
    result['Source'] = result['Source'] ?? image.model;
    result['Software'] = result['Software'] ?? 'NovelAI';
  }
  if (result.isEmpty && image.promptText.isNotEmpty) {
    result['Description'] = image.promptText;
  }
  return result;
}

String stripAitagHtml(String value) => value
    .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .trim();
