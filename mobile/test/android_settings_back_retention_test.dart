import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/main.dart';
import 'package:novelai_mobile/screens/settings/android_settings_hub.dart';
import 'package:novelai_mobile/screens/settings/settings_search_index.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/android/android_studio_shell.dart';
import 'package:novelai_mobile/ui/android/android_tokens.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('only active settings owns Back; hidden detail remains retained',
      (tester) async {
    final previous = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 932);
    addTearDown(tester.view.reset);
    final state = AppState()
      ..booted = true
      ..needsNetworkOnboarding = false;
    addTearDown(state.dispose);
    try {
      await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state,
        child: MaterialApp(
          theme: androidStudioTheme(StudioTheme.light()),
          home: const HomeShell(),
        ),
      ));
      await tester.pumpAndSettle();
      final shell = find.byType(AndroidStudioShell);
      AndroidSettingsHub settings() =>
          tester.widget<AndroidSettingsHub>(find.byType(AndroidSettingsHub));
      int selectedIndex() =>
          tester.widget<AndroidStudioShell>(shell).selectedIndex;
      ModalRoute<dynamic> rootRoute() => ModalRoute.of(tester.element(shell))!;

      await tester.tap(find.byKey(const ValueKey('android-group-4')));
      await tester.pumpAndSettle();
      expect(selectedIndex(), 12);
      await tester
          .tap(find.byKey(const ValueKey('android-settings-category-access')));
      await tester.pumpAndSettle();
      expect(settings().category, AndroidSettingsCategory.access);
      expect(rootRoute().popDisposition, RoutePopDisposition.doNotPop);

      await tester.tap(find.byKey(const ValueKey('android-group-0')));
      await tester.pumpAndSettle();
      expect(selectedIndex(), 0);
      expect(settings().category, AndroidSettingsCategory.access);
      // Never request system exit: inspect the root route's real registered
      // PopEntry disposition. A hidden settings scope used to return doNotPop.
      expect(rootRoute().popDisposition, RoutePopDisposition.bubble);

      await tester.tap(find.byKey(const ValueKey('android-group-4')));
      await tester.pumpAndSettle();
      expect(selectedIndex(), 12);
      expect(settings().category, AndroidSettingsCategory.access);
      final navigator = Navigator.of(tester.element(shell));
      // First Back is owned by the currently visible detail, not the shell.
      await navigator.maybePop();
      await tester.pumpAndSettle();
      expect(settings().category, isNull);
      expect(selectedIndex(), 12);
      expect(rootRoute().popDisposition, RoutePopDisposition.doNotPop);
      // At settings home, the next Back goes to the creation group.
      await navigator.maybePop();
      await tester.pumpAndSettle();
      expect(selectedIndex(), 0);
      expect(rootRoute().popDisposition, RoutePopDisposition.bubble);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      debugDefaultTargetPlatformOverride = previous;
    }
  });
}
