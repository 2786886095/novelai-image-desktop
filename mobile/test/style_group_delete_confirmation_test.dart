import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/screens/style_library_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  for (final quickPicker in [false, true]) {
    final entry = quickPicker ? 'quick picker' : 'style manager';
    testWidgets('$entry confirms before deleting a style group',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      final app = AppState();
      app.settings.language = 'zh-CN';
      app.settings.autoComplete = false;
      app.settings.stylePromptPresetGroups = ['Default', '常用', '其他'];
      app.settings.stylePromptPresets = [
        StylePromptPreset(
            id: 'keep-me',
            name: '风格 A',
            prompt: 'artist:test_a',
            group: '常用',
            createdAt: '2026-11-01'),
        StylePromptPreset(
            id: 'unrelated',
            name: '风格 B',
            prompt: 'artist:test_b',
            group: '其他',
            createdAt: '2026-11-02'),
      ];
      tester.view.physicalSize = const Size(430, 980);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      try {
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app,
          child: MaterialApp(
            home: quickPicker
                ? const GenerateScreen()
                : const StyleLibraryScreen(),
          ),
        ));
        await tester.pumpAndSettle();
        if (quickPicker) {
          final trigger =
              find.byKey(const ValueKey('style-preset-library-trigger'));
          final styleSection = find.text('风格与预设');
          await tester.ensureVisible(styleSection);
          await tester.tap(styleSection);
          await tester.pumpAndSettle();
          await tester.ensureVisible(trigger);
          await tester.tap(trigger);
          await tester.pumpAndSettle();
          final row = find.ancestor(
              of: find.text('常用'), matching: find.byType(ExpansionTile));
          expect(row, findsOneWidget);
        } else {
          await tester.tap(find.text('全部分类'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('常用').last);
          await tester.pumpAndSettle();
        }
        final trash = quickPicker
            ? find
                .descendant(
                  of: find.ancestor(
                      of: find.text('常用'),
                      matching: find.byType(ExpansionTile)),
                  matching: find.byIcon(Icons.delete_outline),
                )
                .first
            : find.byIcon(Icons.folder_delete_outlined);
        void expectIntact() {
          expect(app.settings.stylePromptPresetGroups, ['Default', '常用', '其他']);
          expect(app.settings.stylePromptPresets.first.group, '常用');
        }

        await tester.tap(trash);
        await tester.pumpAndSettle();
        // Report the real mutation even when the baseline has no dialog.
        debugPrint(
            '$entry first tap: ${app.settings.stylePromptPresetGroups.join(',')}');
        expect(find.byType(AlertDialog), findsOneWidget);
        expectIntact();
        expect(find.text('删除分组“常用”？'), findsOneWidget);
        expect(find.text('分组内的风格会移动到默认分组。'), findsOneWidget);
        await tester.tap(find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextButton),
        ));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
        expectIntact();

        await tester.tap(trash);
        await tester.pumpAndSettle();
        await tester.tapAt(const Offset(8, 8));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
        expectIntact();

        await tester.tap(trash);
        await tester.pumpAndSettle();
        await tester.tap(find.widgetWithText(FilledButton, '删除分组'));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
        expect(app.settings.stylePromptPresetGroups, ['Default', '其他']);
        expect(
            app.settings.stylePromptPresets
                .map((p) => (p.id, p.group, p.prompt)),
            [
              ('keep-me', 'Default', 'artist:test_a'),
              ('unrelated', '其他', 'artist:test_b'),
            ]);
        debugPrint('$entry confirmed: A=Default B=其他');
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
        debugDefaultTargetPlatformOverride = null;
        app.dispose();
      }
    });
  }
}
