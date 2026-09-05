import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../artist/artist_recipe.dart';
import '../artist/curated_artists.dart';
import '../models/nai_models.dart';
import 'proxy_http_client.dart';

class ArtistTagService {
  static const _cacheKey = 'artist_lab_popular_pool_v2';
  static const _cacheTimeKey = 'artist_lab_popular_pool_saved_at_v2';
  static const _rankingCountCacheKey = 'artist_ranking_count_cache_v1';
  static const _apiPageSize = 1000;
  static const _maxNumberedPage = 1000;

  Future<DateTime?> lastUpdatedAt() async {
    final value = (await SharedPreferences.getInstance()).getInt(_cacheTimeKey);
    return value == null || value <= 0
        ? null
        : DateTime.fromMillisecondsSinceEpoch(value);
  }

  Future<List<String>> previews(
    AppSettings settings,
    String artist, {
    int limit = 4,
  }) async {
    final tag = canonicalArtistTagName(artist);
    if (tag.isEmpty) return const [];
    final client = createProxyHttpClient(settings, scope: ProxyScope.update);
    try {
      final uri = Uri.https('danbooru.donmai.us', '/posts.json', {
        'limit': '${limit.clamp(1, 6)}',
        'tags': '$tag rating:g order:score',
      });
      final response = await client.get(uri, headers: {
        'Accept': 'application/json',
        'User-Agent': 'Langbai-NovelAI-Studio-Mobile/Artist-Ranking',
      }).timeout(const Duration(seconds: 30));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw http.ClientException('Danbooru HTTP ${response.statusCode}', uri);
      }
      final rows = jsonDecode(response.body);
      if (rows is! List) return const [];
      return rows
          .whereType<Map>()
          .map((row) {
            for (final key in const [
              'preview_file_url',
              'large_file_url',
              'file_url'
            ]) {
              final value = row[key]?.toString().trim() ?? '';
              if (value.startsWith('https://')) return value;
            }
            return '';
          })
          .where((value) => value.isNotEmpty)
          .toList(growable: false);
    } finally {
      client.close();
    }
  }

  Future<List<ArtistTagRecord>> popular(
    AppSettings settings, {
    int limit = 1000,
    bool force = false,
    bool includeCurated = true,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    var cached = <ArtistTagRecord>[];
    final raw = prefs.getString(_cacheKey);
    if (raw != null) {
      try {
        cached = (jsonDecode(raw) as List)
            .whereType<Map>()
            .map((item) =>
                ArtistTagRecord.fromJson(Map<String, dynamic>.from(item)))
            .where((item) =>
                item.id > 0 && item.name.isNotEmpty && !item.deprecated)
            .toList();
      } catch (_) {
        cached = <ArtistTagRecord>[];
      }
    }
    if (!force) {
      final savedAt = prefs.getInt(_cacheTimeKey) ?? 0;
      if (cached.isNotEmpty &&
          DateTime.now().millisecondsSinceEpoch - savedAt <
              const Duration(days: 7).inMilliseconds) {
        if (cached.length >= limit) {
          return includeCurated
              ? mergeCuratedArtistTags(cached.take(limit).toList())
              : cached.take(limit).toList();
        }
      }
    }
    final client = createProxyHttpClient(settings, scope: ProxyScope.update);
    final output = <ArtistTagRecord>[];
    final ids = <int>{};
    try {
      for (var page = 1; output.length < limit; page++) {
        final pageSize = minInt(100, limit - output.length);
        final uri = Uri.https('danbooru.donmai.us', '/tags.json', {
          'limit': '$pageSize',
          'page': '$page',
          'search[category]': '1',
          'search[order]': 'count',
        });
        final response = await client.get(uri, headers: {
          'Accept': 'application/json',
          'User-Agent': 'Langbai-NovelAI-Studio-Mobile/Artist-Lab',
        }).timeout(const Duration(seconds: 30));
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw http.ClientException(
              'Danbooru HTTP ${response.statusCode}', uri);
        }
        final rows = jsonDecode(response.body);
        if (rows is! List || rows.isEmpty) break;
        for (final row in rows.whereType<Map>()) {
          final item = ArtistTagRecord.fromJson(Map<String, dynamic>.from(row));
          if (item.id > 0 &&
              item.name.isNotEmpty &&
              !item.deprecated &&
              ids.add(item.id)) {
            output.add(item);
          }
        }
        if (rows.length < pageSize) break;
      }
    } catch (_) {
      final fallback =
          cached.isNotEmpty ? cached.take(limit).toList() : <ArtistTagRecord>[];
      return includeCurated ? mergeCuratedArtistTags(fallback) : fallback;
    } finally {
      client.close();
    }
    await prefs.setString(
        _cacheKey, jsonEncode(output.map((item) => item.toJson()).toList()));
    await prefs.setInt(_cacheTimeKey, DateTime.now().millisecondsSinceEpoch);
    return includeCurated ? mergeCuratedArtistTags(output) : output;
  }

  Future<List<ArtistTagRecord>> _rankingBatch(
    http.Client client,
    String query,
    int page,
  ) async {
    final uri = Uri.https('danbooru.donmai.us', '/tags.json', {
      'limit': '$_apiPageSize',
      'page': '$page',
      'search[category]': '1',
      'search[order]': 'count',
      'search[is_deprecated]': 'no',
      if (query.isNotEmpty) 'search[name_matches]': '*$query*',
    });
    final response = await client.get(uri, headers: {
      'Accept': 'application/json',
      'User-Agent': 'Langbai-NovelAI-Studio-Mobile/Artist-Ranking',
    }).timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw http.ClientException('Danbooru HTTP ${response.statusCode}', uri);
    }
    final rows = jsonDecode(response.body);
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map((row) => ArtistTagRecord.fromJson(Map<String, dynamic>.from(row)))
        .where((item) => item.id > 0 && item.name.isNotEmpty && !item.deprecated)
        .toList(growable: false);
  }

  Future<({int total, int savedAt})> _rankingCount(
    http.Client client,
    String query, {
    required bool force,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final key = query.isEmpty ? '__all__' : query;
    Map<String, dynamic> cache = {};
    try {
      cache = Map<String, dynamic>.from(
          jsonDecode(prefs.getString(_rankingCountCacheKey) ?? '{}') as Map);
    } catch (_) {
      cache = {};
    }
    final cached = cache[key];
    if (!force && cached is Map) {
      final total = int.tryParse('${cached['total']}') ?? 0;
      final savedAt = int.tryParse('${cached['savedAt']}') ?? 0;
      if (total >= 0 &&
          savedAt > 0 &&
          DateTime.now().millisecondsSinceEpoch - savedAt <
              const Duration(days: 7).inMilliseconds) {
        return (total: total, savedAt: savedAt);
      }
    }
    var low = 1;
    var high = _maxNumberedPage;
    var lastPage = 0;
    var lastCount = 0;
    while (low <= high) {
      final page = (low + high) ~/ 2;
      final rows = await _rankingBatch(client, query, page);
      if (rows.isNotEmpty) {
        lastPage = page;
        lastCount = rows.length;
        low = page + 1;
      } else {
        high = page - 1;
      }
    }
    final savedAt = DateTime.now().millisecondsSinceEpoch;
    final total = lastPage == 0
        ? 0
        : (lastPage - 1) * _apiPageSize + lastCount;
    cache[key] = {'total': total, 'savedAt': savedAt};
    await prefs.setString(_rankingCountCacheKey, jsonEncode(cache));
    return (total: total, savedAt: savedAt);
  }

  Future<ArtistRankingPage> rankingPage(
    AppSettings settings, {
    int page = 1,
    int pageSize = 12,
    String query = '',
    bool force = false,
  }) async {
    final normalized = query.trim().toLowerCase().replaceAll(RegExp(r'\s+'), '_');
    final safeQuery = normalized.length > 120 ? normalized.substring(0, 120) : normalized;
    final safePageSize = pageSize.clamp(1, 60).toInt();
    final client = createProxyHttpClient(settings, scope: ProxyScope.update);
    try {
      final count = await _rankingCount(client, safeQuery, force: force);
      final pageCount = count.total == 0 ? 1 : (count.total / safePageSize).ceil();
      final safePage = page.clamp(1, pageCount).toInt();
      final offset = (safePage - 1) * safePageSize;
      final apiPage = offset ~/ _apiPageSize + 1;
      final innerOffset = offset % _apiPageSize;
      final first = await _rankingBatch(client, safeQuery, apiPage);
      final window = <ArtistTagRecord>[...first];
      if (innerOffset + safePageSize > first.length &&
          apiPage < _maxNumberedPage) {
        window.addAll(await _rankingBatch(client, safeQuery, apiPage + 1));
      }
      final end = minInt(innerOffset + safePageSize, window.length);
      final items = innerOffset >= window.length
          ? <ArtistTagRecord>[]
          : window.sublist(innerOffset, end);
      return ArtistRankingPage(
        items: items,
        page: safePage,
        pageSize: safePageSize,
        total: count.total,
        updatedAt: DateTime.fromMillisecondsSinceEpoch(count.savedAt),
      );
    } finally {
      client.close();
    }
  }
}

class ArtistRankingSnapshot {
  final List<ArtistTagRecord> items;
  final DateTime? updatedAt;
  const ArtistRankingSnapshot(this.items, this.updatedAt);
}

class ArtistRankingPage {
  final List<ArtistTagRecord> items;
  final int page;
  final int pageSize;
  final int total;
  final DateTime? updatedAt;
  const ArtistRankingPage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.updatedAt,
  });
}

List<ArtistTagRecord> mergeCuratedArtistTags(List<ArtistTagRecord> items) {
  final output = <ArtistTagRecord>[];
  final ids = <int>{};
  final names = <String>{};
  void add(ArtistTagRecord item) {
    if (item.id <= 0 || item.deprecated) return;
    final name = canonicalArtistTagName(item.name);
    if (name.isEmpty || ids.contains(item.id) || names.contains(name)) return;
    ids.add(item.id);
    names.add(name);
    output.add(ArtistTagRecord(item.id, name, item.postCount));
  }

  for (final item in items) {
    add(item);
  }
  for (final item in kCuratedArtistTags) {
    add(item);
  }
  return output;
}

int minInt(int left, int right) => left < right ? left : right;
