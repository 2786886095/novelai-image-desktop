// ignore_for_file: avoid_print
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/references/reference_presets.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/ui/studio_theme.dart';

void main() {
  for (final target in [
    (TargetPlatform.android, const Size(360, 800)),
    (TargetPlatform.iOS, const Size(390, 844)),
    (TargetPlatform.iOS, const Size(1024, 768)),
    (TargetPlatform.windows, const Size(1200, 800)),
  ]) {
    for (final action in ['empty', 'cancel', 'valid']) {
      testWidgets('native group-dialog lifecycle ${target.$1.name} ${target.$2} $action', (tester) async {
        SharedPreferences.setMockInitialValues({});
        debugDefaultTargetPlatformOverride = target.$1;
        tester.view.physicalSize = target.$2;
        tester.view.devicePixelRatio = 1;
        final app = AppState();
        app.referencePresetGroups.add('ORIGINAL');
        final before = jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson());
        addTearDown(() {
          tester.view.resetPhysicalSize();
          tester.view.resetDevicePixelRatio();
          app.dispose();
        });
        try {
          await tester.pumpWidget(ChangeNotifierProvider.value(value: app, child: MaterialApp(theme: StudioTheme.light(), home: const Scaffold(body: SafeArea(child: ReferencePresetLibraryPanel(standalone: true, showClose: false))))));
          await tester.pump();
          await tester.tap(find.text('本机预设'));
          await tester.pumpAndSettle();
          final add = find.byIcon(Icons.create_new_folder_outlined);
          expect(add, findsOneWidget);
          await tester.ensureVisible(add);
          await tester.tap(add);
          await tester.pumpAndSettle();
          expect(find.text('创建分组'), findsOneWidget);
          if (action == 'valid') {
            await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'QA_LIFECYCLE_GROUP');
          }
          await tester.tap(find.text(action == 'cancel' ? '取消' : '创建'));
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 60));
          await tester.pump(const Duration(milliseconds: 400));
          final errors = <String>[];
          Object? error;
          while ((error = tester.takeException()) != null) { errors.add(error.toString()); }
          print('GROUP_DIALOG_LIFECYCLE platform=${target.$1.name} viewport=${target.$2} action=$action errors=$errors groups=${app.referencePresetGroups};0network/0credits');
          expect(errors, isEmpty, reason: 'closing dialog must retain controller until its TextField is unmounted');
          if (action != 'valid') {
            expect(jsonEncode(ReferencePresetLibrary(groups: app.referencePresetGroups, presets: app.referencePresets).toJson()), before);
          } else {
            expect(app.referencePresetGroups, ['ORIGINAL', 'QA_LIFECYCLE_GROUP']);
          }
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          debugDefaultTargetPlatformOverride = null;
        }
      });
    }
  }
}
