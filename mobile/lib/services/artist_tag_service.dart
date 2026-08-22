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

  Future<List<ArtistTagRecord>> popular(
    AppSettings settings, {
    int limit = 1000,
    bool force = false,
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
          return mergeCuratedArtistTags(cached.take(limit).toList());
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
      return mergeCuratedArtistTags(fallback);
    } finally {
      client.close();
    }
    await prefs.setString(
        _cacheKey, jsonEncode(output.map((item) => item.toJson()).toList()));
    await prefs.setInt(_cacheTimeKey, DateTime.now().millisecondsSinceEpoch);
    return mergeCuratedArtistTags(output);
  }
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
