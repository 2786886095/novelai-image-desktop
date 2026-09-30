import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/screens/tools_hub_screen.dart';
import 'dart:convert';
import 'dart:async';
import 'package:novelai_mobile/screens/random_artist_lab_screen.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/models/nai_models.dart';

class _DelayedArtists extends ArtistTagService {
  final reply = Completer<List<ArtistTagRecord>>();
  @override
  Future<List<ArtistTagRecord>> popular(AppSettings settings,
          {int limit = 1000, bool force = false, bool includeCurated = true}) =>
      reply.future;
}

void main() {
  testWidgets('leaving while artist pool loads does not update a disposed page',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = AppState();
    addTearDown(state.dispose);
    final service = _DelayedArtists();
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            theme: StudioTheme.light(),
            home:
                RandomArtistLabScreen(onBack: () {}, artistService: service))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    service.reply.complete([]);
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
  testWidgets('old incorrectly typed preferences leave draw page usable',
      (tester) async {
    SharedPreferences.setMockInitialValues(
        {'v5_artist_draw_v1_minWeight': 'legacy-value'});
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            theme: StudioTheme.light(),
            home: V5ArtistWeightRepairScreen(
                mode: V5ArtistToolMode.draw, onBack: () {}))));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('输入画师串抽卡'), findsOneWidget);
  });
  testWidgets('saved zero dimensions do not break restored draw cards',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'v5_artist_draw_v1_favorites': jsonEncode([
        {
          'recipe': {
            'id': 'old',
            'prompt': 'artist:test',
            'artists': ['test'],
            'mutations': []
          },
          'sequence': 1,
          'status': 'done'
        }
      ]),
      'v5_artist_draw_v1_generationParams':
          jsonEncode({'width': 0, 'height': 0}),
    });
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            theme: StudioTheme.light(),
            home: V5ArtistWeightRepairScreen(
                mode: V5ArtistToolMode.draw, onBack: () {}))));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
    for (var n = 0; n < 30; n++) {
      final p = scroll.position;
      p.jumpTo((p.pixels + 500).clamp(0, p.maxScrollExtent));
      await tester.pumpAndSettle();
      if (p.pixels == p.maxScrollExtent) break;
    }
    await tester.tap(find.textContaining('收藏夹 (').first);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets('actual tools route can open, draw, return and open again',
      (tester) async {
    SharedPreferences.setMockInitialValues(
        {'v5_artist_draw_v1_artistInput': 'artist:test_artist'});
    final state = AppState();
    addTearDown(state.dispose);
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
            theme: StudioTheme.light(), home: const ToolsHubScreen())));
    for (var n = 0; n < 2; n++) {
      await tester.ensureVisible(find.text('输入画师串抽卡'));
      await tester.tap(find.text('输入画师串抽卡'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final scroll =
          tester.state<ScrollableState>(find.byType(Scrollable).first);
      for (var j = 0; j < 30 && find.text('重新抽权重').evaluate().isEmpty; j++) {
        final p = scroll.position;
        p.jumpTo((p.pixels + 350).clamp(0, p.maxScrollExtent));
        await tester.pumpAndSettle();
      }
      await tester.ensureVisible(find.text('重新抽权重'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('重新抽权重'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (var j = 0; j < 35; j++) {
        final p = scroll.position;
        p.jumpTo((p.pixels + 500).clamp(0, p.maxScrollExtent));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        if (p.pixels == p.maxScrollExtent) break;
      }
      await tester.tap(find.byIcon(Icons.arrow_back));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    }
  });
  for (final mode in V5ArtistToolMode.values) {
    testWidgets('artist tool $mode opens, scrolls, and reopens on Android size',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(393, 852);
      addTearDown(tester.view.reset);
      final state = AppState();
      addTearDown(state.dispose);
      Widget app() => ChangeNotifierProvider.value(
          value: state,
          child: MaterialApp(
              theme: StudioTheme.light(),
              home: V5ArtistWeightRepairScreen(mode: mode, onBack: () {})));
      for (var open = 0; open < 2; open++) {
        await tester.pumpWidget(app());
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final scroll =
            tester.state<ScrollableState>(find.byType(Scrollable).first);
        for (var n = 0; n < 20; n++) {
          final p = scroll.position;
          p.jumpTo((p.pixels + 500).clamp(0, p.maxScrollExtent));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          if (p.pixels == p.maxScrollExtent) break;
        }
        await tester.pumpWidget(const SizedBox());
        await tester.pumpAndSettle();
      }
    });
  }
}
