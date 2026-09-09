import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/online_gallery_service.dart';
import 'package:novelai_mobile/services/quicktag.dart';
import 'package:novelai_mobile/screens/quicktag_navigation.dart';

void main() {
  final fixture =
      jsonDecode(File('../shared/quicktag-fixtures.json').readAsStringSync())
          as Map<String, dynamic>;
  OnlineGalleryService createService() {
    final books = (fixture['books'] as Map).map(
        (id, book) => MapEntry(id as String, utf8.encode(jsonEncode(book))));
    return OnlineGalleryService(client: MockClient((req) async {
      final path = req.url.path;
      Object? value;
      if (path.endsWith('/data-source.json')) {
        value = {
          'baseUrl': 'https://assets.quicktagcloud.com/data',
          'pointer': 'current.json'
        };
      } else if (path.endsWith('/current.json')) {
        value = {
          'release': 'r-test',
          'manifest': 'releases/r-test/manifest.json'
        };
      } else if (path.endsWith('/codexes.json')) {
        value = fixture['codexes'];
      } else if (path.endsWith('/media.json')) {
        value = {'baseUrl': 'https://assets.quicktagcloud.com'};
      } else if (path.endsWith('/manifest.json')) {
        value = {
          'files': books.map((id, b) => MapEntry('$id.json',
              {'size': b.length, 'sha256': sha256.convert(b).toString()}))
        };
      } else {
        final id = path.split('/').last.replaceAll('.json', '');
        if (books.containsKey(id)) return http.Response.bytes(books[id]!, 200);
        return http.Response('fixture unavailable', 503);
      }
      return http.Response.bytes(utf8.encode(jsonEncode(value)), 200);
    }));
  }

  test('shared short codes, directory counts and exact tags', () {
    expect(quickPathCode(['画风组词典', '梦神NAI5F画风合集']), 'zuud7l');
    final entries = List<Map<String, dynamic>>.from(
            fixture['books']['artist_nai5_personal']['entries'])
        .where(quickSafe)
        .toList();
    expect(entries.length, 2);
    expect(quickCategories(entries).first['count'], 1);
    expect(quickMatch(entries.first, 'watercolor "blue sky" -pencil'), isTrue);
    expect(quickMatch(entries.first, 'watercolor pencil'), isFalse);
    expect(
        () => quickLink('https://example.com/?c=demo'), throwsFormatException);
  });
  test('keeps character blocks independent and searches their tags', () {
    final entry = {
      'characterPrompts': [
        {'label': 'A', 'prompt': '  blue coat  '},
        {'label': 'B', 'prompt': 'red scarf'},
        {'prompt': 0}
      ]
    };
    expect(quickCharacters(entry).first['prompt'], '  blue coat  ');
    expect(quickCharacters(entry), hasLength(2));
    expect(quickMatch(entry, '"blue coat" "red scarf"'), isTrue);
  });
  test('public GET retry is bounded and does not retry authorization errors',
      () async {
    for (final status in [503, 401]) {
      var attempts = 0;
      final service = OnlineGalleryService(client: MockClient((req) async {
        attempts++;
        return http.Response('failure', status);
      }));
      addTearDown(service.close);
      await expectLater(service.search(source: OnlineGallerySource.quicktag),
          throwsA(isA<http.ClientException>()));
      expect(attempts, status == 503 ? 2 : 1);
    }
  });
  test('complete catalog, supplied link and original detail', () async {
    final service = createService();
    addTearDown(service.close);
    final root = await service.search(source: OnlineGallerySource.quicktag);
    expect(root.navigation!['collections'], hasLength(3));
    final page = await service.search(
        source: OnlineGallerySource.quicktag,
        query:
            'https://novelai.quicktagcloud.com/?c=artist_nai5_personal&p=zuud7l',
        pageSize: 12);
    expect(page.total, 1);
    expect(page.navigation!['categoryPath'], ['画风组词典', '梦神NAI5F画风合集']);
    final detail = await service.detail(page.items.first);
    expect(detail.prompt, 'watercolor, blue sky');
    expect(detail.media.first.downloadUrl,
        contains('/originals/artist_nai5_personal/1.png'));
  });
  test('global search reports partial failure and preserves rating filtering',
      () async {
    final service = createService();
    addTearDown(service.close);
    final page = await service.search(
        source: OnlineGallerySource.quicktag,
        query: 'watercolor',
        searchAll: true);
    expect(page.items.map((i) => i.collectionId),
        ['artist_nai5_personal', 'clothes']);
    expect(page.navigation!['failedCollections'], ['Unavailable']);
    final all = await service.search(
        source: OnlineGallerySource.quicktag,
        collectionId: 'artist_nai5_personal',
        safeOnly: false);
    expect(all.total, 3);
    final safe = await service.search(
        source: OnlineGallerySource.quicktag,
        collectionId: 'artist_nai5_personal',
        page: 900);
    expect(safe.total, 2);
    expect(safe.page, 1);
  });
  for (final dark in [false, true]) {
    testWidgets('native catalog fits 320px dark=$dark', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(MaterialApp(
          theme:
              ThemeData(brightness: dark ? Brightness.dark : Brightness.light),
          home: Scaffold(
              body: SingleChildScrollView(
                  child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: QuickTagNavigation(
                          navigation: const {
                            'collections': [
                              {
                                'id': 'book',
                                'title':
                                    'Very long collection title / 一个很长的图鉴名称',
                                'count': 1313
                              }
                            ],
                            'categories': [
                              {
                                'path': ['画风组词典'],
                                'count': 330
                              }
                            ],
                            'categoryPath': <String>[],
                            'failedCollections': <String>[]
                          },
                          collectionId: 'book',
                          searchAll: false,
                          loading: false,
                          language: 'zh-CN',
                          onSelect: (_, __) {},
                          onScope: (_) {},
                          pageSize: 12,
                          onPageSize: (_) {}))))));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('全站词条搜索'), findsOneWidget);
    });
  }
}
