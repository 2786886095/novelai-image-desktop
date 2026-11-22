import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
      'save-only artist string, append and existing replace remain separate',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final app = AppState();
    app.settings.language = 'zh-CN';
    app.settings.autoComplete = false;
    app.settings.stylePromptPresets = [];
    app.params.stylePrompt = 'original,';
    app.params.positivePrompt = 'keep positive';
    app.params.negativePrompt = 'keep negative';
    tester.view.physicalSize = const Size(430, 980);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final old = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    Future<void> tap(Finder f) async {
      await tester.ensureVisible(f);
      await tester.tap(f);
      await tester.pumpAndSettle();
    }

    try {
      await tester.pumpWidget(ChangeNotifierProvider.value(
          value: app, child: const MaterialApp(home: GenerateScreen())));
      await tester.pumpAndSettle();
      await tap(find.text('风格与预设'));
      final picker = find.byKey(const ValueKey('style-preset-library-trigger'));
      await tap(picker);
      final create = find.text('新建画师串');
      expect(create, findsOneWidget);
      await tap(create);
      final dialog = find.byType(AlertDialog),
          fields =
              find.descendant(of: dialog, matching: find.byType(TextField));
      FilledButton save() => tester.widget(
          find.descendant(of: dialog, matching: find.byType(FilledButton)));
      expect(save().onPressed, isNull);
      await tester.enterText(fields.first, 'QA artist');
      await tester.pump();
      expect(save().onPressed, isNull);
      await tester.enterText(fields.last, '1.2::artist:demo::');
      await tester.pump();
      await tap(find.text('保存').last);
      expect(app.params.stylePrompt, 'original,');
      expect(app.settings.stylePromptPresets.single.name, 'QA artist');
      await tap(find.text('追加'));
      expect(app.params.stylePrompt, 'original, 1.2::artist:demo::');
      await tap(picker);
      await tap(find.text('QA artist').last);
      expect(app.params.stylePrompt, '1.2::artist:demo::');
      expect(app.params.positivePrompt, 'keep positive');
      expect(app.params.negativePrompt, 'keep negative');
    } finally {
      debugDefaultTargetPlatformOverride = old;
    }
  });
}
