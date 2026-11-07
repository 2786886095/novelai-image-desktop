import 'package:novelai_mobile/services/artist_catalog_service.dart';
import 'dart:convert';
import 'dart:math';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/artist_lookup_screen.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Artists extends ArtistTagService {
  @override
  Future<ArtistCatalogSelection> localCatalog({int count = 1000, bool random = false, int seed = 0}) async {
    final rows = await popular(AppSettings(), limit: count);
    return ArtistCatalogSelection(rows, ArtistCatalogInfo(rows.length, DateTime(2026, 9, 9)));
  }

  // All pool modes are fixture-backed: no filesystem or real HTTP in layout tests.
  @override
  Future<ArtistPoolSample> randomWholePool(AppSettings settings,
      {int sampleSize=32, Random? random, bool force=false,
       ArtistPoolSource source=ArtistPoolSource.online}) async {
    final items=await popular(settings);
    return ArtistPoolSample(items,items.length,source:source,requestedSource:source);
  }

  @override
  Future<List<ArtistTagRecord>> popular(AppSettings settings,
          {int limit = 1000,
          bool force = false,
          bool includeCurated = true}) async =>
      List.generate(40, (i) => ArtistTagRecord(i + 1, 'artist_$i', 100));
  @override
  Future<List<ArtistIdentity>> lookup(
          AppSettings settings, String input) async =>
      [
        const ArtistIdentity(15, 'fixture_artist',
            ['https://www.pixiv.net/users/123'], ['Fixture Alias']),
        const ArtistIdentity(16, 'fixture_artist_(another)',
            ['https://twitter.com/fixture'], ['Ambiguous name'])
      ];
}

List<Map<String, dynamic>> _rows(int count) => List.generate(
    count,
    (i) => {
          'recipe': {
            'id': 'saved-$i',
            'prompt': '1.0::artist:fixture_$i ::',
            'artists': ['fixture_$i'],
            'mutations': []
          },
          'sequence': i + 1,
          'seed': i + 1,
          'status': 'done',
          'liked': true,
          'shortlisted': i == 20,
          'generationModel': 'nai-diffusion-5-full',
        });
Future<void> _mount(WidgetTester tester, AppState app, Widget page,
    {Size size = const Size(360, 800)}) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  await tester.pumpWidget(ChangeNotifierProvider.value(
      value: app,
      child: MaterialApp(
          theme: StudioTheme.light(),
          home: RepaintBoundary(key: const ValueKey('capture'), child: page))));
  await tester.pumpAndSettle();
}

Future<void> _capture(WidgetTester tester, String name) async {
  final dir = Platform.environment['RESULT_SCREENSHOTS'];
  if (dir == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
        find.byKey(const ValueKey('capture')));
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(dir).create(recursive: true);
    await File('$dir/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test('Pixiv and X profile normalization never fetches arbitrary URLs', () {
    expect(artistIdentityQuery('https://www.pixiv.net/users/123').value,
        'https://www.pixiv.net/users/123');
    expect(artistIdentityQuery('https://www.pixiv.net/member.php?id=123').value,
        'https://www.pixiv.net/users/123');
    expect(artistIdentityQuery('https://x.com/fixture/status/456').value,
        'https://twitter.com/fixture');
    expect(artistIdentityQuery('Some Artist').value, 'Some_Artist');
    for (final bad in [
      'https://127.0.0.1/users/1',
      'file:///etc/passwd',
      'https://pixiv.net/artworks/12',
      'https://x.com@evil.test/abc',
      'https://x.com:8443/abc',
      'https://x.com/search',
      'name*',
      'name?',
      'a\nb'
    ]) {
      expect(() => artistIdentityQuery(bad), throwsFormatException,
          reason: bad);
    }
  });
  test(
      'lookup uses fixed Danbooru origin; retains ambiguous identities and verified tags',
      () async {
    final requests = <Uri>[];
    final service = ArtistTagService(
        clientFactory: (_) => MockClient((req) async {
              requests.add(req.url);
              return http.Response(
                  jsonEncode([
                    {
                      'id': 1,
                      'name': 'verified_artist',
                      'urls': [
                        {'url': 'https://x.com/verified'}
                      ],
                      'other_names': ['alias']
                    },
                    {
                      'id': 2,
                      'name': 'verified_artist_(different)',
                      'urls': [{'url': 'https://twitter.com/verified'}]
                    },
                    {'id': 3, 'name': 'deleted', 'is_deleted': true}
                  ]),
                  200);
            }));
    final result =
        await service.lookup(AppSettings(), 'https://x.com/verified');
    expect(result.length, 2);
    expect(result.first.naiPrompt, '1.0::artist:verified_artist ::');
    expect(result.first.urls, ['https://twitter.com/verified']);
    expect(requests.single.host, 'danbooru.donmai.us');
    expect(requests.single.path, '/artists.json');
    expect(requests.single.queryParameters['search[url_matches]'],
        'https://twitter.com/verified');
  });
  test('lookup empty result is not invented; status failures propagate',
      () async {
    final empty = ArtistTagService(
        clientFactory: (_) =>
            MockClient((_) async => http.Response('[]', 200)));
    expect(await empty.lookup(AppSettings(), 'unknown'), isEmpty);
    for (final code in [403, 429, 500]) {
      final service = ArtistTagService(
          clientFactory: (_) =>
              MockClient((_) async => http.Response('{}', code)));
      await expectLater(service.lookup(AppSettings(), 'name'),
          throwsA(isA<http.ClientException>()));
    }
  });
  test('broad discovery uses bounded ID cursors, not deep rank pages', () async {
    final requests = <Uri>[];
    var call = 0;
    final service = ArtistTagService(clientFactory: (_) => MockClient((req) async {
      requests.add(req.url); call++;
      return http.Response(jsonEncode(List.generate(call == 1 ? 1 : 100,
        (i) => {'id': call == 1 ? 100000 : call * 1000 + i,
          'name': 'artist_${call}_$i', 'post_count': 10, 'category': 1})), 200);
    }));
    final result = await service.randomWholePool(AppSettings(), random: Random(81), force: true);
    expect(result.total, 401); expect(result.items.length, 32);
    expect(result.fallback, isFalse); expect(result.coverageComplete, isFalse);
    expect(requests.length, 5);
    expect(requests.first.queryParameters['page'], '1');
    for (final uri in requests.skip(1)) {
      expect(uri.queryParameters['page'], matches(r'^[ab][0-9]+$'));
      expect(int.parse(uri.queryParameters['limit']!), lessThanOrEqualTo(100));
    }
  });
  test('online failure explicitly identifies local fallback, not online success', () async {
    final service = ArtistTagService(clientFactory: (_) => MockClient((_) async => http.Response('blocked', 503)));
    final result = await service.randomWholePool(AppSettings());
    expect(result.items, isNotEmpty); expect(result.fallback, isTrue);
    expect(result.source, ArtistPoolSource.local);
    expect(result.requestedSource, ArtistPoolSource.online);
    expect(result.warning, isNotEmpty); expect(result.coverageComplete, isFalse);
  });
  for (final kind in ['random', 'draw', 'repair']) {
    testWidgets(
        '$kind favorites paginate, remember page and preserve secondary favorites across reopen',
        (tester) async {
      addTearDown(tester.view.reset);
      final prefix = kind == 'random'
          ? 'artist_lab_random_v1_'
          : kind == 'draw'
              ? 'v5_artist_draw_v1_'
              : 'v5_artist_repair_v1_';
      SharedPreferences.setMockInitialValues({
        '${prefix}favorites': jsonEncode(_rows(40)),
        '${prefix}showFavorites': true,
        '${prefix}favoriteView':
            jsonEncode({'page': 2, 'pageSize': 12, 'shown': true}),
      });
      final app = AppState();
      addTearDown(app.dispose);
      Widget screen() => kind == 'random'
          ? RandomArtistLabScreen(onBack: () {}, artistService: _Artists())
          : V5ArtistWeightRepairScreen(
              mode: kind == 'draw'
                  ? V5ArtistToolMode.draw
                  : V5ArtistToolMode.repair,
              onBack: () {});
      await _mount(tester, app, screen());
      expect(find.textContaining('第 2/4 页'), findsWidgets);
      expect(find.byTooltip('加入二次收藏').evaluate().length, lessThanOrEqualTo(12));
      expect(tester.takeException(), isNull);
      // Reopen without touching the persisted view.
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
      await _mount(tester, app, screen());
      expect(find.textContaining('第 2/4 页'), findsWidgets);
      await tester.tap(find.text('二次收藏／精选').first);
      await tester.pumpAndSettle();
      expect(find.textContaining('共 1 项'), findsWidgets);
      expect(tester.takeException(), isNull);
      // Scroll to the one retained card and remove only its secondary marker.
      final target = find.byTooltip('移出二次收藏（保留原收藏）');
      for (var n = 0; n < 12 && target.hitTestable().evaluate().isEmpty; n++) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -260));
        await tester.pumpAndSettle();
      }
      expect(target.hitTestable(), findsOneWidget);
      await tester.tap(target);
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      final stored = jsonDecode(prefs.getString('${prefix}favorites')!) as List;
      expect(stored.length, 40);
      expect(stored[20]['shortlisted'], false);
      expect(tester.takeException(), isNull);
    });
  }
  for(final kind in ['random','draw','repair']) {
    testWidgets('$kind restores the last-viewed favorite even after a filter hid it',(tester) async {
      addTearDown(tester.view.reset);
      final prefix=kind=='random'?'artist_lab_random_v1_':kind=='draw'?'v5_artist_draw_v1_':'v5_artist_repair_v1_';
      SharedPreferences.setMockInitialValues({
        '${prefix}favorites':jsonEncode(_rows(40)),
        '${prefix}showFavorites':true,
        '${prefix}favoriteView':jsonEncode({'page':1,'pageSize':12,'shown':true,'lastId':'saved-25','shortlist':true}),
      });
      final app=AppState();addTearDown(app.dispose);
      await _mount(tester,app,kind=='random'?RandomArtistLabScreen(onBack:(){},artistService:_Artists()):V5ArtistWeightRepairScreen(mode:kind=='draw'?V5ArtistToolMode.draw:V5ArtistToolMode.repair,onBack:(){}));
      expect(find.textContaining('第 3/4 页'),findsWidgets);
      expect(tester.takeException(),isNull);
    });
  }
  testWidgets(
      '500 selected style tags and long weight input stay within bounded expansion controls',
      (tester) async {
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_customTags':
          List.generate(500, (i) => 'fixture_style_$i').join(', '),
      'artist_lab_random_v1_weightTuneInput':
          List.generate(500, (i) => '1.0::artist:fixture_$i ::').join(', '),
    });
    final app = AppState();
    addTearDown(app.dispose);
    await _mount(tester, app,
        RandomArtistLabScreen(onBack: () {}, artistService: _Artists()));
    final root =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    final scroll =
        find.descendant(of: root, matching: find.byType(Scrollable)).first;
    final tuner =
        find.byKey(const PageStorageKey<String>('random-artist-weight-tuner'));
    for (var i = 0; i < 30 && tuner.evaluate().isEmpty; i++) {
      final pos = tester.state<ScrollableState>(scroll).position;
      pos.jumpTo((pos.pixels + 300).clamp(0, pos.maxScrollExtent));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(tuner);
    await tester.pumpAndSettle();
    await tester
        .tap(find.descendant(of: tuner, matching: find.text('已有画师串权重微调')));
    await tester.pumpAndSettle();
    final library = find.byKey(const PageStorageKey<String>(
        'random-artist-style-tag-library-weight-tuner'));
    for (var i = 0; i < 30 && library.evaluate().isEmpty; i++) {
      final pos = tester.state<ScrollableState>(scroll).position;
      pos.jumpTo((pos.pixels + 240).clamp(0, pos.maxScrollExtent));
      await tester.pumpAndSettle();
    }
    await tester.ensureVisible(library);
    await tester.pumpAndSettle();
    await tester
        .tap(find.descendant(of: library, matching: find.text('画风 Tag 库')));
    await tester.pumpAndSettle();
    final selection =
        find.byKey(const ValueKey('artist-selected-tags-weight-tuner'));
    expect(selection, findsOneWidget);
    expect(tester.getSize(selection).height, lessThanOrEqualTo(176));
    final visibleLabels =
        find.textContaining('fixture_style_').evaluate().length;
    expect(visibleLabels, lessThan(40));
    expect(tester.takeException(), isNull);
  });
  for (final size in [
    const Size(320, 640),
    const Size(420, 800),
    const Size(800, 360)
  ]) {
    testWidgets(
        'artist lookup fits $size and shows identities without auto-selecting',
        (tester) async {
      addTearDown(tester.view.reset);
      final app = AppState();
      addTearDown(app.dispose);
      await _mount(
          tester, app, ArtistLookupScreen(onBack: () {}, service: _Artists()),
          size: size);
      await tester.enterText(
          find.byKey(const ValueKey('artist-lookup-input')), 'fixture');
      await tester.ensureVisible(find.text('查询'));
      await tester.tap(find.text('查询'));
      await tester.pumpAndSettle();
      expect(find.text('fixture_artist'), findsOneWidget);
      expect(tester.takeException(), isNull);
      if (size.width == 420) await _capture(tester, 'artist-lookup-420');
    });
  }
}
