import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeArtistService extends ArtistTagService {
  @override
  Future<List<ArtistTagRecord>> popular(
    AppSettings settings, {
    int limit = 1000,
    bool force = false,
  }) async =>
      List.generate(
        60,
        (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
      );
}

class _FakeGenerationAppState extends AppState {
  final Completer<HistoryItem> generation = Completer<HistoryItem>();
  GenerateParams? lastParams;

  @override
  Future<HistoryItem> generateArtistLabTemporary({
    required GenerateParams panelParams,
    required GenerateExtras panelExtras,
  }) {
    lastParams = panelParams.copy();
    return generation.future;
  }
}

Future<void> _scrollUntilBuilt(
  WidgetTester tester,
  Finder scrollable,
  Finder target,
) async {
  final state = tester.state<ScrollableState>(scrollable);
  for (var attempt = 0; attempt < 100 && target.evaluate().isEmpty; attempt++) {
    final position = state.position;
    final next = (position.pixels + 420)
        .clamp(position.minScrollExtent, position.maxScrollExtent)
        .toDouble();
    if (next == position.pixels) break;
    position.jumpTo(next);
    await tester.pumpAndSettle();
  }
  expect(target, findsWidgets);
  await tester.ensureVisible(target.first);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final viewport in <(String, Size)>[
    ('phone portrait', const Size(360, 800)),
    ('phone landscape', const Size(800, 360)),
    ('tablet landscape', const Size(1280, 800)),
  ]) {
    testWidgets('random artist lab fits ${viewport.$1}', (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = viewport.$2;
      addTearDown(tester.view.reset);
      final state = AppState();
      addTearDown(state.dispose);
      await tester.pumpWidget(
        ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
            theme: StudioTheme.light(),
            home: RandomArtistLabScreen(
              onBack: () {},
              artistService: _FakeArtistService(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('随机画师串抽卡'), findsOneWidget);
      expect(find.text('当前候选库共 60 名画师'), findsOneWidget);
      expect(find.text('画师 Tag 来源：Danbooru'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('independent NovelAI generation parameters are directly editable',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 900);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final minArtistCountField = tester.widget<TextField>(
      find.byWidgetPredicate((widget) =>
          widget is TextField &&
          widget.decoration?.labelText == '每串最少画师（1～20）'),
    );
    final maxArtistCountField = tester.widget<TextField>(
      find.byWidgetPredicate((widget) =>
          widget is TextField &&
          widget.decoration?.labelText == '每串最多画师（1～20）'),
    );
    expect(minArtistCountField.controller?.text, '3');
    expect(maxArtistCountField.controller?.text, '7');
    expect(find.text('NovelAI 生成参数'), findsOneWidget);
    await tester.tap(find.text('NovelAI 生成参数'));
    await tester.pumpAndSettle();
    expect(find.textContaining('NAI Diffusion V5 Full'), findsWidgets);
    expect(find.text('竖图 832×1216'), findsOneWidget);
    expect(find.text('方形 1024×1024'), findsOneWidget);
    expect(find.text('大方图 1472×1472'), findsOneWidget);
    expect(find.text('宽度'), findsOneWidget);
    expect(find.text('高度'), findsOneWidget);
  });

  testWidgets('failed result exposes a manual retry action', (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(360, 800);
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_results': jsonEncode([
        {
          'recipe': {
            'id': 'failed-1',
            'prompt': '1.2::artist:test_artist ::',
            'artists': ['test_artist'],
            'mutations': [],
          },
          'status': 'failed',
          'error': 'network error',
          'liked': false,
        }
      ]),
    });
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    await _scrollUntilBuilt(
      tester,
      find.descendant(of: bodyList, matching: find.byType(Scrollable)).first,
      find.byTooltip('重试'),
    );
    expect(find.byTooltip('重试'), findsOneWidget);
  });

  testWidgets('style toggle previews clearly labelled A-B pairs',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(800, 900);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SwitchListTile, '抽卡时额外加入随机风格词'));
    await tester.pumpAndSettle();
    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    final scrollable =
        find.descendant(of: bodyList, matching: find.byType(Scrollable)).first;
    await _scrollUntilBuilt(
      tester,
      scrollable,
      find.textContaining('8 组 · 16 张'),
    );
    await tester.pumpAndSettle();
    expect(find.text('A｜仅画师串'), findsWidgets);
    expect(find.text('B｜画师串＋随机风格词'), findsWidgets);
    expect(find.textContaining('8 组 · 16 张'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('result completion keeps the current page scroll position',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 800);
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_results': jsonEncode(List.generate(
        12,
        (index) => {
          'recipe': {
            'id': 'failed-$index',
            'prompt': '1.2::artist:test_artist_$index ::',
            'artists': ['test_artist_$index'],
            'mutations': [],
          },
          'sequence': index + 1,
          'status': 'failed',
          'error': 'network error',
          'liked': false,
        },
      )),
    });
    final state = _FakeGenerationAppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    await tester.drag(bodyList, const Offset(0, -2600));
    await tester.pumpAndSettle();
    final scrollable = tester.state<ScrollableState>(
      find.descendant(of: bodyList, matching: find.byType(Scrollable)).first,
    );
    final before = scrollable.position.pixels;
    expect(before, greaterThan(0));

    await tester.tap(find.byTooltip('重试').hitTestable().first);
    await tester.pump();
    expect(scrollable.position.pixels, closeTo(before, 0.5));

    state.generation.complete(HistoryItem(
      id: 'generated-1',
      filePath: 'missing-test-image.png',
      date: '2026-07-23',
      createdAt: '2026-07-23T00:00:00',
      seed: 246813579,
      model: 'nai-diffusion-4-5-full',
      width: 512,
      height: 512,
      prompt: 'test',
      feature: 'artist-lab',
    ));
    await tester.pumpAndSettle();
    expect(scrollable.position.pixels, closeTo(before, 0.5));
    expect(tester.takeException(), isNull);
  });

  testWidgets('switching result folders preserves the page scroll position',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 800);
    addTearDown(tester.view.reset);
    final rows = List.generate(
      10,
      (index) => {
        'recipe': {
          'id': 'saved-$index',
          'prompt': '1.2::artist:saved_artist_$index ::',
          'artists': ['saved_artist_$index'],
          'mutations': [],
        },
        'sequence': index + 1,
        'status': 'done',
        'liked': true,
      },
    );
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_results': jsonEncode(rows),
      'artist_lab_random_v1_favorites': jsonEncode(rows),
    });
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    final bodyScrollable =
        find.descendant(of: bodyList, matching: find.byType(Scrollable)).first;
    final favoritesTab = find.textContaining('收藏夹 (10)');
    await _scrollUntilBuilt(tester, bodyScrollable, favoritesTab);
    final scrollable = tester.state<ScrollableState>(bodyScrollable);
    expect(scrollable.position.pixels, greaterThan(0));
    final before = scrollable.position.pixels;

    await tester.tap(favoritesTab);
    await tester.pumpAndSettle();
    expect(scrollable.position.pixels, closeTo(before, 0.5));
    expect(tester.takeException(), isNull);
  });

  testWidgets('favorites are classified by the model used for generation',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 900);
    addTearDown(tester.view.reset);
    final rows = <Map<String, dynamic>>[
      {
        'recipe': {
          'id': 'v5-favorite',
          'prompt': '1.2::artist:v5_artist ::',
          'artists': ['v5_artist'],
          'mutations': [],
        },
        'status': 'done',
        'liked': true,
        'generationModel': 'nai-diffusion-5-full',
      },
      {
        'recipe': {
          'id': 'v45-favorite',
          'prompt': '1.2::artist:v45_artist ::',
          'artists': ['v45_artist'],
          'mutations': [],
        },
        'status': 'done',
        'liked': true,
        'generationModel': 'nai-diffusion-4-5-full',
      },
    ];
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_favorites': jsonEncode(rows),
    });
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    await _scrollUntilBuilt(
      tester,
      find.descendant(of: bodyList, matching: find.byType(Scrollable)).first,
      find.textContaining('收藏夹 (2)'),
    );
    await tester.tap(find.textContaining('收藏夹 (2)'));
    await tester.pumpAndSettle();

    expect(find.text('NAI Diffusion V5 Full（最新完整模型）'), findsWidgets);
    expect(find.text('NAI Diffusion 4.5 Full（完整模型）'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('retry records the model used by the retry request',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 800);
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_results': jsonEncode([
        {
          'recipe': {
            'id': 'retry-model',
            'prompt': '1.2::artist:test_artist ::',
            'artists': ['test_artist'],
            'mutations': [],
          },
          'status': 'failed',
          'error': 'network error',
          'generationModel': 'nai-diffusion-4-5-full',
          'liked': false,
        }
      ]),
    });
    final state = _FakeGenerationAppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    await _scrollUntilBuilt(
      tester,
      find.descendant(of: bodyList, matching: find.byType(Scrollable)).first,
      find.byTooltip('重试'),
    );
    await tester.tap(find.byTooltip('重试').hitTestable());
    await tester.pump();

    expect(state.lastParams?.model, 'nai-diffusion-5-full');
    expect(
      find.textContaining('NAI Diffusion V5 Full（最新完整模型）'),
      findsWidgets,
    );
    state.generation.complete(HistoryItem(
      id: 'retry-v5',
      filePath: 'missing-retry-v5.png',
      date: '2026-08-22',
      createdAt: '2026-08-22T00:00:00',
      seed: 2058326448,
      model: 'nai-diffusion-5-full',
      width: 832,
      height: 1216,
      prompt: 'test',
      feature: 'artist-lab',
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('apply favorite restores the model recorded by that card',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(420, 800);
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'artist_lab_random_v1_results': jsonEncode([
        {
          'recipe': {
            'id': 'apply-model',
            'prompt': '1.2::artist:test_artist ::',
            'artists': ['test_artist'],
            'mutations': [],
          },
          'status': 'done',
          'generationModel': 'nai-diffusion-4-5-full',
          'liked': false,
        }
      ]),
    });
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: state,
        child: MaterialApp(
          theme: StudioTheme.light(),
          home: RandomArtistLabScreen(
            onBack: () {},
            artistService: _FakeArtistService(),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final bodyList =
        find.byKey(const PageStorageKey<String>('random-artist-lab-scroll'));
    await _scrollUntilBuilt(
      tester,
      find.descendant(of: bodyList, matching: find.byType(Scrollable)).first,
      find.byTooltip('应用到生成'),
    );
    await tester.tap(find.byTooltip('应用到生成').hitTestable());
    await tester.pump();

    expect(state.params.model, 'nai-diffusion-4-5-full');
    expect(tester.takeException(), isNull);
  });
}
