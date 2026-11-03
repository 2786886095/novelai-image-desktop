import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'android_generate_layout_test.dart' show pumpCreate, withTestPlatform;

void main() {
  for (final target in ['Seed', 'batch']) {
    testWidgets('numeric parameter remains mounted with keyboard: $target', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await withTestPlatform(tester, TargetPlatform.android, () async {
        tester.view.physicalSize = const Size(393, 873);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.reset);
        final state = AppState();
        state.settings.autoComplete = false;
        state.params.seedMode = 'fixed';
        state.params.seed = 869097135;
        addTearDown(state.dispose);
        await pumpCreate(tester, state);
        await tester.pump();
        await tester.tap(find.byIcon(Icons.tune).first);
        await tester.pumpAndSettle();
        final field = find.byWidgetPredicate((w) => w is TextField &&
            (target == 'Seed' ? w.decoration?.labelText == 'Seed' : (w.decoration?.labelText?.contains('批量') ?? false)));
        expect(field, findsOneWidget);
        await tester.ensureVisible(field);
        await tester.tap(field);
        await tester.pump();
        tester.view.viewInsets = const FakeViewPadding(bottom: 330);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(field, findsOneWidget);
        await tester.enterText(field, target == 'Seed' ? '123456789' : '3');
        await tester.pump();
        expect(tester.takeException(), isNull);
        expect(target == 'Seed' ? state.params.seed : state.batchCount, target == 'Seed' ? 123456789 : 3);
        tester.view.viewInsets = FakeViewPadding.zero;
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('关闭').last);
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('android-create-workspace')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    });
  }
}
