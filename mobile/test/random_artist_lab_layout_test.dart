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

  @override
  Future<HistoryItem> generateArtistLabTemporary({
    required GenerateParams panelParams,
    required GenerateExtras panelExtras,
  }) =>
      generation.future;
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
      expect(tester.takeException(), isNull);
    });
  }

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
    await tester.drag(find.byType(ListView).first, const Offset(0, -1200));
    await tester.pumpAndSettle();
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
    await tester.tap(find.byType(Switch));
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

  testWidgets('switching result folders returns to the top controls',
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
    await tester.scrollUntilVisible(
      favoritesTab,
      500,
      scrollable: bodyScrollable,
    );
    final scrollable = tester.state<ScrollableState>(bodyScrollable);
    expect(scrollable.position.pixels, greaterThan(0));

    await tester.tap(favoritesTab);
    await tester.pumpAndSettle();
    expect(scrollable.position.pixels, 0);
    expect(tester.takeException(), isNull);
  });
}
