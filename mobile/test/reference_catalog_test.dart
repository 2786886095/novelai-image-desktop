import 'dart:convert';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/references/reference_catalog.dart';

Map<String, dynamic> _asset() => {
      'id': 'genshin/amber/default',
      'game': '原神',
      'category': '游戏内角色图',
      'roleId': 'amber',
      'variant': 'default',
      'names': {
        'zh-CN': '安柏',
        'zh-TW': '安柏',
        'ja-JP': 'アンバー',
        'ko-KR': '엠버',
        'en-US': 'Amber',
      },
      'gameNames': {
        'zh-CN': '原神',
        'zh-TW': '原神',
        'ja-JP': '原神',
        'ko-KR': '원신',
        'en-US': 'Genshin Impact',
      },
      'searchAliases': ['Outrider', '侦察骑士'],
      'width': 1024,
      'height': 1536,
      'bytes': 4096,
      'downloadUrl': 'https://example.test/amber.png',
      'downloadMirrors': {
        'gitee': 'https://gitee.test/amber.png',
        'github': 'https://github.test/amber.png',
      },
      'thumbnailUrl': 'https://example.test/amber-thumb.webp',
      'thumbnailMirrors': {
        'gitee': 'https://gitee.test/amber-thumb.webp',
      },
    };

void main() {
  test('catalog keeps every locale available for display and search', () {
    final catalog = parseReferenceCatalog({
      'generatedAt': '2026-08-21T00:00:00Z',
      'games': [
        {
          'id': '原神',
          'names': {
            'zh-CN': '原神',
            'zh-TW': '原神',
            'ja-JP': '原神',
            'ko-KR': '원신',
            'en-US': 'Genshin Impact',
          },
          'categories': ['游戏内角色图', '角色立绘'],
        },
      ],
      'assets': [_asset()],
    });

    expect(catalog.games.single.categories, hasLength(2));
    final asset = catalog.assets.single;
    expect(asset.nameFor('zh-CN'), '安柏');
    expect(asset.nameFor('ja-JP'), 'アンバー');
    expect(asset.nameFor('ko-KR'), '엠버');
    expect(asset.nameFor('en-US'), 'Amber');
    expect(asset.searchText, contains('侦察骑士'));
    expect(asset.searchText, contains('amber'));
    expect(asset.searchText, contains('원신'));
    expect(asset.preciseUrls.first, 'https://gitee.test/amber.png');
    expect(asset.thumbnailUrls.first, 'https://gitee.test/amber-thumb.webp');
  });

  test('gzip-base64 catalog chunk is unpacked before parsing', () {
    final chunk = jsonEncode({
      'schema': 'langbai-reference-catalog/v1',
      'assets': [_asset()],
    });
    final compressed = GZipEncoder().encode(utf8.encode(chunk));
    final unpacked = unpackReferenceCatalogPayload({
      'encoding': 'gzip-base64',
      'payload': base64Encode(compressed!),
    });

    expect(unpacked['schema'], 'langbai-reference-catalog/v1');
    expect((unpacked['assets'] as List), hasLength(1));
  });

  test('byte formatter reports catalog download sizes', () {
    expect(formatReferenceCatalogBytes(0), '—');
    expect(formatReferenceCatalogBytes(1024), '1 KB');
    expect(formatReferenceCatalogBytes(1536 * 1024), '1.5 MB');
  });
}
