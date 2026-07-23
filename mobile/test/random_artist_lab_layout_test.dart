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
}
