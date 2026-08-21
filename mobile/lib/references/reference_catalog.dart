import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:http/http.dart' as http;

const referenceCatalogUrls = <String>[
  'https://gitee.com/langbai666/novelai-image-desktop/raw/main/public/reference-catalog/gitee-index.json',
  'https://2786886095.github.io/novelai-image-desktop/reference-catalog/index.json',
  'https://raw.githubusercontent.com/2786886095/novelai-reference-assets/main/catalog/index.json',
];

const referenceCatalogGameNames = <String, Map<String, String>>{
  '原神': {
    'zh-CN': '原神',
    'zh-TW': '原神',
    'ja-JP': '原神',
    'ko-KR': '원신',
    'en-US': 'Genshin Impact',
  },
  '妮姬': {
    'zh-CN': '胜利女神：妮姬',
    'zh-TW': '勝利女神：妮姬',
    'ja-JP': '勝利の女神：NIKKE',
    'ko-KR': '승리의 여신: 니케',
    'en-US': 'GODDESS OF VICTORY: NIKKE',
  },
  '崩坏三': {
    'zh-CN': '崩坏3',
    'zh-TW': '崩壞3rd',
    'ja-JP': '崩壊3rd',
    'ko-KR': '붕괴3rd',
    'en-US': 'Honkai Impact 3rd',
  },
  '异环': {
    'zh-CN': '异环',
    'zh-TW': '異環',
    'ja-JP': 'Neverness to Everness',
    'ko-KR': 'Neverness to Everness',
    'en-US': 'Neverness to Everness',
  },
  '明日方舟': {
    'zh-CN': '明日方舟',
    'zh-TW': '明日方舟',
    'ja-JP': 'アークナイツ',
    'ko-KR': '명일방주',
    'en-US': 'Arknights',
  },
  '星穹铁道': {
    'zh-CN': '崩坏：星穹铁道',
    'zh-TW': '崩壞：星穹鐵道',
    'ja-JP': '崩壊：スターレイル',
    'ko-KR': '붕괴: 스타레일',
    'en-US': 'Honkai: Star Rail',
  },
  '终末地': {
    'zh-CN': '明日方舟：终末地',
    'zh-TW': '明日方舟：終末地',
    'ja-JP': 'アークナイツ：エンドフィールド',
    'ko-KR': '명일방주: 엔드필드',
    'en-US': 'Arknights: Endfield',
  },
  '绝区零': {
    'zh-CN': '绝区零',
    'zh-TW': '絕區零',
    'ja-JP': 'ゼンレスゾーンゼロ',
    'ko-KR': '젠레스 존 제로',
    'en-US': 'Zenless Zone Zero',
  },
  '蔚蓝档案': {
    'zh-CN': '蔚蓝档案',
    'zh-TW': '蔚藍檔案',
    'ja-JP': 'ブルーアーカイブ',
    'ko-KR': '블루 아카이브',
    'en-US': 'Blue Archive',
  },
  '鸣潮': {
    'zh-CN': '鸣潮',
    'zh-TW': '鳴潮',
    'ja-JP': '鳴潮',
    'ko-KR': '명조: 워더링 웨이브',
    'en-US': 'Wuthering Waves',
  },
};

String localizeReferenceCatalogGame(String game, String language) =>
    referenceCatalogGameNames[game]?[language] ??
    referenceCatalogGameNames[game]?['zh-CN'] ??
    game;

String localizeReferenceCatalogCategory(String category, String language) {
  const labels = <String, Map<String, String>>{
    '游戏内角色图': {
      'zh-CN': '游戏内角色图',
      'zh-TW': '遊戲內角色圖',
      'ja-JP': 'ゲーム内キャラクター',
      'ko-KR': '인게임 캐릭터',
      'en-US': 'In-game character',
    },
    '角色立绘': {
      'zh-CN': '角色立绘',
      'zh-TW': '角色立繪',
      'ja-JP': 'キャラクター立ち絵',
      'ko-KR': '캐릭터 일러스트',
      'en-US': 'Character illustration',
    },
    '角色资源': {
      'zh-CN': '角色资源',
      'zh-TW': '角色資源',
      'ja-JP': 'キャラクター素材',
      'ko-KR': '캐릭터 리소스',
      'en-US': 'Character resource',
    },
  };
  return labels[category]?[language] ?? labels[category]?['zh-CN'] ?? category;
}

String localizeReferencePresetGroup(String group, String language) {
  final parts = group.split(' · ');
  if (parts.length == 2 && referenceCatalogGameNames.containsKey(parts.first)) {
    return '${localizeReferenceCatalogGame(parts.first, language)} · '
        '${localizeReferenceCatalogCategory(parts.last, language)}';
  }
  return localizeReferenceCatalogGame(group, language);
}

class ReferenceCatalogGame {
  final String id;
  final Map<String, String> names;
  final List<String> categories;

  const ReferenceCatalogGame({
    required this.id,
    required this.names,
    required this.categories,
  });

  factory ReferenceCatalogGame.fromJson(Map<String, dynamic> json) =>
      ReferenceCatalogGame(
        id: json['id']?.toString() ?? '',
        names: _stringMap(json['names']),
        categories: (json['categories'] as List<dynamic>? ?? const [])
            .map((value) => value.toString())
            .where((value) => value.isNotEmpty)
            .toList(),
      );
}

class ReferenceCatalogAsset {
  final String id;
  final String game;
  final String category;
  final String roleId;
  final Map<String, String> names;
  final Map<String, String> gameNames;
  final List<String> searchAliases;
  final String variant;
  final int width;
  final int height;
  final int bytes;
  final String downloadUrl;
  final Map<String, String> downloadMirrors;
  final String thumbnailUrl;
  final Map<String, String> thumbnailMirrors;

  const ReferenceCatalogAsset({
    required this.id,
    required this.game,
    required this.category,
    required this.roleId,
    required this.names,
    required this.gameNames,
    required this.searchAliases,
    required this.variant,
    required this.width,
    required this.height,
    required this.bytes,
    required this.downloadUrl,
    required this.downloadMirrors,
    required this.thumbnailUrl,
    required this.thumbnailMirrors,
  });

  factory ReferenceCatalogAsset.fromJson(Map<String, dynamic> json) =>
      ReferenceCatalogAsset(
        id: json['id']?.toString() ?? '',
        game: json['game']?.toString() ?? '',
        category: json['category']?.toString() ?? '',
        roleId: json['roleId']?.toString() ?? '',
        names: _stringMap(json['names']),
        gameNames: _stringMap(json['gameNames']),
        searchAliases: (json['searchAliases'] as List<dynamic>? ?? const [])
            .map((value) => value.toString())
            .where((value) => value.isNotEmpty)
            .toList(),
        variant: json['variant']?.toString() ?? '',
        width: (json['width'] as num?)?.toInt() ?? 0,
        height: (json['height'] as num?)?.toInt() ?? 0,
        bytes: (json['bytes'] as num?)?.toInt() ?? 0,
        downloadUrl: json['downloadUrl']?.toString() ?? '',
        downloadMirrors: _stringMap(json['downloadMirrors']),
        thumbnailUrl: json['thumbnailUrl']?.toString() ?? '',
        thumbnailMirrors: _stringMap(json['thumbnailMirrors']),
      );

  String nameFor(String language) =>
      names[language] ?? names['zh-CN'] ?? roleId;

  String gameNameFor(String language) =>
      gameNames[language] ?? gameNames['zh-CN'] ?? game;

  String get searchText => <String>[
        game,
        category,
        roleId,
        variant,
        ...searchAliases,
        ...names.values,
        ...gameNames.values,
      ].join(' ').toLowerCase();

  List<String> get preciseUrls => <String>{
        if ((downloadMirrors['gitee'] ?? '').isNotEmpty)
          downloadMirrors['gitee']!,
        if (downloadUrl.isNotEmpty) downloadUrl,
        if ((downloadMirrors['github'] ?? '').isNotEmpty)
          downloadMirrors['github']!,
      }.toList();

  List<String> get thumbnailUrls => <String>{
        if ((thumbnailMirrors['gitee'] ?? '').isNotEmpty)
          thumbnailMirrors['gitee']!,
        if (thumbnailUrl.isNotEmpty) thumbnailUrl,
        if ((thumbnailMirrors['github'] ?? '').isNotEmpty)
          thumbnailMirrors['github']!,
        ...preciseUrls,
      }.toList();
}

class ReferenceCatalog {
  final String generatedAt;
  final List<ReferenceCatalogGame> games;
  final List<ReferenceCatalogAsset> assets;

  const ReferenceCatalog({
    required this.generatedAt,
    required this.games,
    required this.assets,
  });
}

Map<String, String> _stringMap(Object? value) {
  if (value is! Map) return const {};
  return {
    for (final entry in value.entries)
      if (entry.value != null && entry.value.toString().trim().isNotEmpty)
        entry.key.toString(): entry.value.toString().trim(),
  };
}

Map<String, dynamic> _jsonMap(Object? value) =>
    Map<String, dynamic>.from(value as Map);

Map<String, dynamic> unpackReferenceCatalogPayload(Object? raw) {
  final payload = _jsonMap(raw);
  if (payload['encoding'] != 'gzip-base64' || payload['payload'] is! String) {
    return payload;
  }
  final compressed = base64Decode(payload['payload'] as String);
  final decoded = GZipDecoder().decodeBytes(compressed);
  return _jsonMap(jsonDecode(utf8.decode(decoded)));
}

ReferenceCatalog parseReferenceCatalog(
  Map<String, dynamic> payload, {
  List<Map<String, dynamic>> chunks = const [],
}) {
  final sourceAssets = chunks.isEmpty
      ? (payload['assets'] as List<dynamic>? ?? const [])
      : chunks.expand((chunk) => chunk['assets'] as List<dynamic>? ?? const []);
  final games = (payload['games'] as List<dynamic>? ?? const [])
      .whereType<Map>()
      .map((value) => ReferenceCatalogGame.fromJson(_jsonMap(value)))
      .where((value) => value.id.isNotEmpty)
      .toList();
  final assets = sourceAssets
      .whereType<Map>()
      .map((value) => ReferenceCatalogAsset.fromJson(_jsonMap(value)))
      .where((value) =>
          value.id.isNotEmpty &&
          value.downloadUrl.isNotEmpty &&
          value.category.isNotEmpty)
      .toList();
  return ReferenceCatalog(
    generatedAt: payload['generatedAt']?.toString() ?? '',
    games: games,
    assets: assets,
  );
}

ReferenceCatalog? _cachedReferenceCatalog;

Future<ReferenceCatalog> loadOnlineReferenceCatalog({
  bool refresh = false,
  http.Client? client,
}) async {
  if (!refresh && _cachedReferenceCatalog != null) {
    return _cachedReferenceCatalog!;
  }
  final ownsClient = client == null;
  final httpClient = client ?? http.Client();
  Object? lastError;
  try {
    for (final source in referenceCatalogUrls) {
      try {
        final response = await httpClient
            .get(Uri.parse(source))
            .timeout(const Duration(seconds: 20));
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw StateError('HTTP ${response.statusCode}');
        }
        final payload = unpackReferenceCatalogPayload(
          jsonDecode(utf8.decode(response.bodyBytes)),
        );
        if (payload['schema'] == 'langbai-reference-catalog/federated-v1') {
          final chunkRows = (payload['chunks'] as List<dynamic>? ?? const [])
              .whereType<Map>()
              .map(_jsonMap)
              .toList();
          final chunks = await Future.wait(chunkRows.map((row) async {
            final url = Uri.parse(source).resolve(row['url'].toString());
            final chunkResponse =
                await httpClient.get(url).timeout(const Duration(seconds: 20));
            if (chunkResponse.statusCode < 200 ||
                chunkResponse.statusCode >= 300) {
              throw StateError('HTTP ${chunkResponse.statusCode}');
            }
            return unpackReferenceCatalogPayload(
              jsonDecode(utf8.decode(chunkResponse.bodyBytes)),
            );
          }));
          final catalog = parseReferenceCatalog(payload, chunks: chunks);
          if (catalog.assets.isEmpty) throw StateError('Empty catalog');
          return _cachedReferenceCatalog = catalog;
        }
        if (payload['schema'] != 'langbai-reference-catalog/v1') {
          throw StateError('Invalid catalog');
        }
        final catalog = parseReferenceCatalog(payload);
        if (catalog.assets.isEmpty) throw StateError('Empty catalog');
        return _cachedReferenceCatalog = catalog;
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    if (ownsClient) httpClient.close();
  }
  throw StateError(lastError?.toString() ?? 'Online catalog unavailable');
}

Future<Uint8List> downloadReferenceCatalogAsset(
  ReferenceCatalogAsset asset, {
  required void Function(int loaded, int total) onProgress,
  http.Client? client,
}) async {
  final ownsClient = client == null;
  final httpClient = client ?? http.Client();
  Object? lastError;
  try {
    for (final source in asset.preciseUrls) {
      try {
        final request = http.Request('GET', Uri.parse(source));
        final response =
            await httpClient.send(request).timeout(const Duration(seconds: 30));
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw StateError('HTTP ${response.statusCode}');
        }
        final total = response.contentLength ?? asset.bytes;
        final builder = BytesBuilder(copy: false);
        var loaded = 0;
        await for (final chunk in response.stream) {
          builder.add(chunk);
          loaded += chunk.length;
          onProgress(loaded, total > 0 ? total : loaded);
        }
        final bytes = builder.takeBytes();
        if (bytes.isEmpty) throw StateError('Empty image');
        onProgress(bytes.length, total > 0 ? total : bytes.length);
        return bytes;
      } catch (error) {
        lastError = error;
      }
    }
  } finally {
    if (ownsClient) httpClient.close();
  }
  throw StateError(lastError?.toString() ?? 'Download failed');
}

String formatReferenceCatalogBytes(int bytes) {
  if (bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).ceil()} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
