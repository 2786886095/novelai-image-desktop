import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/gallery_favorites_screen.dart';
import 'package:novelai_mobile/services/gallery_favorites.dart';
import 'package:novelai_mobile/services/unified_storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

List<String> drainErrors(WidgetTester tester) {
  final errors = <String>[];
  Object? error;
  while ((error = tester.takeException()) != null) {
    errors.add(error.toString());
  }
  return errors;
}

void main() {
  for (final fixture in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800)),
  ]) {
    for (final action in ['confirm', 'submit', 'barrier', 'reopen']) {
      testWidgets('online favorites page dialog ${fixture.$1.name} ${fixture.$2} $action', (tester) async {
        final directory = Directory.systemTemp.createTempSync('online-favorite-dialog-');
        final state = AppState();
        state.settings.language = 'zh-CN';
        debugDefaultTargetPlatformOverride = fixture.$1;
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = fixture.$2;
        SharedPreferences.setMockInitialValues({});
        UnifiedStorage.active = directory;
        GalleryFavoritesStore.instance.items = [];
        GalleryFavoritesStore.instance.error = null;
        final observed = <String>[];
        var completedRounds = 0;
        try {
          await tester.pumpWidget(ChangeNotifierProvider<AppState>.value(
              value: state, child: const MaterialApp(home: GalleryFavoritesScreen())));
          await tester.pumpAndSettle();
          observed.addAll(drainErrors(tester));
          for (var round = 0; round < (action == 'reopen' ? 2 : 1); round++) {
            await tester.tap(find.text('1 / 1 · 0'));
            await tester.pumpAndSettle();
            final field = find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField));
            await tester.showKeyboard(field);
            await tester.enterText(field, '1');
            await tester.pump();
            if (action == 'submit') {
              await tester.testTextInput.receiveAction(TextInputAction.done);
            } else if (action == 'barrier') {
              await tester.tapAt(const Offset(5, 5));
            } else {
              await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextButton)));
            }
            await tester.pump();
            await tester.pump(const Duration(milliseconds: 60));
            await tester.pump(const Duration(milliseconds: 400));
            await tester.pumpAndSettle();
            observed.addAll(drainErrors(tester));
            completedRounds++;
            if (observed.isNotEmpty) break;
            expect(find.byType(AlertDialog), findsNothing);
            expect(find.text('1 / 1 · 0'), findsOneWidget);
            // The returned screen's search field must accept focus and input.
            await tester.enterText(find.byType(TextField), 'QA_PAGE_DIALOG_RECOVERY');
            await tester.pump();
            await tester.enterText(find.byType(TextField), '');
            await tester.pump();
            observed.addAll(drainErrors(tester));
          }
          debugPrint('ONLINE_FAVORITES_DIALOG=${fixture.$1.name}/${fixture.$2}/$action/errors=${observed.length}/rounds=$completedRounds');
          expect(observed, isEmpty, reason: 'The page controller must survive focused reverse transition and search must remain usable.');
          expect(completedRounds, action == 'reopen' ? 2 : 1);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pumpAndSettle();
          drainErrors(tester);
          tester.view.reset();
          debugDefaultTargetPlatformOverride = null;
          UnifiedStorage.active = null;
          state.dispose();
          if (directory.existsSync()) directory.deleteSync(recursive: true);
        }
      });
    }
  }
}
