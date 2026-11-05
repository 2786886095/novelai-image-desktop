import 'dart:convert';
import 'dart:async';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../artist/artist_recipe.dart';
import '../artist/curated_artists.dart';
import '../models/nai_models.dart';
import 'proxy_http_client.dart';

class ArtistTagService {
  final http.Client Function(AppSettings)? clientFactory;
  ArtistTagService({this.clientFactory});
  http.Client _client(AppSettings settings) => clientFactory?.call(settings) ??
      createProxyHttpClient(settings, scope: ProxyScope.update);

  /// Uniform ranks without replacement, not popularity-weighted sampling.
  /// At most 32 tag pages plus 10 count-search pages. Never silently substitutes
  /// a hot-list cache when the global range cannot be established.
  Future<ArtistPoolSample> randomWholePool(AppSettings settings,
      {int sampleSize=32, Random? random, bool force=false}) async {
    final client=_client(settings);
    try {
      final timer=Stopwatch()..start();
      final count=await _rankingCount(client,'',force:force).timeout(const Duration(seconds:45));
      if(count.total==0 || count.total>=_maxNumberedPage*_apiPageSize) {
        throw StateError('Global artist range is unavailable or exceeds the API pagination bound.');
      }
      final rng=random??Random.secure();
      final size=sampleSize.clamp(1,32).clamp(1,count.total).toInt();
      final ranks=<int>{};
      for(var j=count.total-size;j<count.total;j++) {
        final t=rng.nextInt(j+1); ranks.add(ranks.contains(t)?j:t);
      }
      final byPage=<int,List<int>>{};
      for(final rank in ranks) {
        byPage.putIfAbsent(rank~/_apiPageSize+1,()=>[]).add(rank%_apiPageSize);
      }
      final items=<ArtistTagRecord>[];
      for(final entry in byPage.entries) {
        if(timer.elapsed>const Duration(seconds:60)) throw TimeoutException('Global artist sampling timed out.');
        final rows=await _rankingBatch(client,'',entry.key);
        for(final index in entry.value) {
          if(index>=rows.length) throw StateError('Artist pool changed; refresh and try again.');
          items.add(rows[index]);
        }
      }
      if(items.map((e)=>e.id).toSet().length!=items.length) {
        throw StateError('Artist pool changed; refresh and try again.');
      }
      return ArtistPoolSample(items,count.total);
    } finally {client.close();}
  }

  /// Only Danbooru is contacted. External profile URLs are search terms, never
  /// fetch targets. Identity matches are presented for user review, not guessed.
  Future<List<ArtistIdentity>> lookup(AppSettings settings,String input) async {
    final query=artistIdentityQuery(input);
    final client=_client(settings);
    try {
      final uri=Uri.https('danbooru.donmai.us','/artists.json',{
        'limit':'20','search[is_deleted]':'false',
        query.isUrl?'search[url_matches]':'search[any_name_matches]':query.value,
        'only':'id,name,other_names,urls,is_deleted,is_banned',
      });
      final request=http.Request('GET',uri)..headers.addAll({
        'Accept':'application/json',
        'User-Agent':'Langbai-NovelAI-Studio-Mobile/Artist-Lookup',
      });
      final response=await client.send(request).timeout(const Duration(seconds:30));
      if(response.statusCode<200||response.statusCode>=300) {
        throw http.ClientException('Danbooru HTTP ${response.statusCode}');
      }
      final buffer=<int>[];
      await (() async {
        await for(final chunk in response.stream) {
          if(buffer.length+chunk.length>2*1024*1024) throw const FormatException('Artist response too large.');
          buffer.addAll(chunk);
        }
      })().timeout(const Duration(seconds:30));
      final data=jsonDecode(utf8.decode(buffer));
      if(data is! List) throw const FormatException('Invalid artist response.');
      return data.whereType<Map>().where((r)=>r['is_deleted']!=true)
        .map((r)=>ArtistIdentity.fromJson(Map<String,dynamic>.from(r)))
        .where((r)=>r.id>0&&r.tag.isNotEmpty).take(20).toList();
    } finally {client.close();}
  }

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
    final client = _client(settings);
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
    final client = _client(settings);
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
    final client = _client(settings);
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

class ArtistPoolSample {
 final List<ArtistTagRecord> items;
 final int total;
 const ArtistPoolSample(this.items,this.total);
}
class ArtistIdentity {
 final int id;
 final String tag;
 final List<String> urls;
 final List<String> aliases;
 const ArtistIdentity(this.id,this.tag,this.urls,this.aliases);
 String get naiPrompt=>'1.0::artist:$tag ::';
 factory ArtistIdentity.fromJson(Map<String,dynamic> json)=>ArtistIdentity(
   (json['id'] as num?)?.toInt()??0, canonicalArtistTagName('${json['name']??''}'),
   (json['urls'] as List? ?? []).map((u)=>u is Map?u['url']:u).whereType<String>().where((u)=>u.length<=2048&&Uri.tryParse(u)?.scheme=='https').take(12).toList(),
   (json['other_names'] as List? ?? []).whereType<String>().take(12).toList());
}
({bool isUrl,String value}) artistIdentityQuery(String input) {
 final value=input.trim();
 if(value.isEmpty||value.length>240||RegExp(r'[\x00-\x1f*?]').hasMatch(value.replaceAll('?', ''))) {
   throw const InvalidArtistQuery('Invalid artist query.');
 }
 if(value.startsWith('http')||value.contains('://')) {
   final u=Uri.tryParse(value);
   if(u==null||!['https','http'].contains(u.scheme)||u.userInfo.isNotEmpty||u.hasPort) {
     throw const InvalidArtistQuery('Invalid profile URL.');
   }
   final host=u.host.toLowerCase();
   if(['pixiv.net','www.pixiv.net'].contains(host)) {
     final m=RegExp(r'^/(?:[a-z]{2}/)?users/(\d+)/?$').firstMatch(u.path);
     final id=m?.group(1)??(u.path=='/member.php'?u.queryParameters['id']:null);
     if(id!=null&&RegExp(r'^\d+$').hasMatch(id)) return(isUrl:true,value:'https://www.pixiv.net/users/$id');
   }
   if(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].contains(host)) {
     final m=RegExp(r'^/([A-Za-z0-9_]{1,15})(?:/status/\d+)?/?$').firstMatch(u.path);
     if(m!=null&&!['home','search','i','intent','explore','settings'].contains(m[1]!.toLowerCase())) {
       return(isUrl:true,value:'https://twitter.com/${m[1]}');
     }
   }
   throw const InvalidArtistQuery('Use an artist profile, not an artwork or arbitrary URL.');
 }
 if(value.contains('/')||value.contains('?')||value.contains('*')||value.length>120) throw const InvalidArtistQuery('Invalid artist name.');
 return(isUrl:false,value:value.replaceAll(RegExp(r'\s+'),'_'));
}

class InvalidArtistQuery extends FormatException {
 const InvalidArtistQuery(super.message);
}
