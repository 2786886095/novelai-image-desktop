import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/v5_artist_weight_repair_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';

class _NoNetworkState extends AppState {
  int calls = 0;
  @override
  Future<HistoryItem> generateArtistLabTemporary(
      {required GenerateParams panelParams,
      required GenerateExtras panelExtras}) async {
    calls++;
    throw StateError('No network generation allowed in stale-batch test');
  }
}

Future<void> _reach(WidgetTester tester, Finder target) async {
  final scroll = tester.state<ScrollableState>(find.byType(Scrollable).first);
  for (var i = 0; i < 40 && target.evaluate().isEmpty; i++) {
    scroll.position.jumpTo((scroll.position.pixels + 350)
        .clamp(0, scroll.position.maxScrollExtent));
    await tester.pumpAndSettle();
  }
  expect(target, findsWidgets);
  await tester.ensureVisible(target.first);
  await tester.pumpAndSettle();
}

void main() {
  for (final mode in V5ArtistToolMode.values) {
    for (final invalid in ['', '::,,::']) {
      testWidgets(
          '$mode failed preparation blocks retained batch and recovers input "$invalid"',
          (tester) async {
        const fixture = '1.2::artist:qa_artist::,1.5::masterpiece::,night';
        SharedPreferences.setMockInitialValues({});
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = const Size(800, 900);
        addTearDown(tester.view.reset);
        final app = _NoNetworkState();
        addTearDown(app.dispose);
        await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
            value: app,
            child: MaterialApp(
                theme: StudioTheme.light(),
                home: V5ArtistWeightRepairScreen(mode: mode, onBack: () {}))));
        await tester.pumpAndSettle();
        // Resolve the actual source field by its controller/input hint, not an assumed screen position.
        Finder sourceField() => find.byWidgetPredicate((w) =>
            w is TextField &&
            (w.decoration?.hintText?.contains('artist:foo') == true ||
                w.decoration?.hintText?.contains('pottsness') == true));
        await _reach(tester, sourceField());
        await tester.enterText(sourceField().first, fixture);
        await tester.pumpAndSettle();
        final prepare =
            find.text(mode == V5ArtistToolMode.repair ? '随机修复画师权重' : '重新抽权重');
        await _reach(tester, prepare);
        await tester.tap(prepare);
        await tester.pumpAndSettle();
        final batch = find.ancestor(
            of: find.text('生成这一批'),
            matching: find.byWidgetPredicate((w) => w is FilledButton));
        await _reach(tester, batch);
        final staleCallback = tester.widget<FilledButton>(batch).onPressed;
        expect(staleCallback, isNotNull);
        final scroll =
            tester.state<ScrollableState>(find.byType(Scrollable).first);
        scroll.position.jumpTo(0);
        await tester.pumpAndSettle();
        await _reach(tester, sourceField());
        await tester.enterText(sourceField().first, invalid);
        await tester.pumpAndSettle();
        await _reach(tester, prepare);
        await tester.tap(prepare);
        await tester.pumpAndSettle();
        await _reach(tester, batch);
        expect(tester.widget<FilledButton>(batch).onPressed, isNull,
            reason: 'failed preparation leaves old batch disabled');
        staleCallback!();
        await tester.pumpAndSettle();
        expect(app.calls, 0,
            reason: 'cached event cannot bypass production handler guard');
        scroll.position.jumpTo(0);
        await tester.pumpAndSettle();
        await _reach(tester, sourceField());
        await tester.enterText(sourceField().first, fixture);
        await tester.pumpAndSettle();
        await _reach(tester, prepare);
        await tester.tap(prepare);
        await tester.pumpAndSettle();
        await _reach(tester, batch);
        expect(tester.widget<FilledButton>(batch).onPressed, isNotNull);
        expect(tester.takeException(), isNull);
        debugPrint(
            'mode=$mode invalid="$invalid" disabled=true generationCalls=${app.calls} recovered=true');
      });
    }
  }
}
