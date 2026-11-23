import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/positive_prompt_preset_sheet.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
      'old group with no flattened prompt is searchable by second character negative',
      (t) async {
    SharedPreferences.setMockInitialValues({});
    final app = AppState();
    app.settings.language = 'en-US';
    app.settings.positivePromptPresets = [
      PositivePromptPreset(
          id: 'old',
          name: 'Duo',
          prompt: '',
          createdAt: 'now',
          captions: [
            CharCaptionItem(prompt: 'scarf'),
            CharCaptionItem(
                name: 'Luna', prompt: 'coat', negativePrompt: 'qa-sunhat')
          ])
    ];
    await t.pumpWidget(ChangeNotifierProvider.value(
        value: app,
        child: MaterialApp(
            home: Scaffold(
                body: PositivePromptPresetButton(
                    currentPrompt: '', onApply: (_) {})))));
    await t.tap(find.text('Prompt presets'));
    await t.pumpAndSettle();
    final search = find.byWidgetPredicate((w) =>
        w is TextField &&
        (w.decoration?.hintText ?? '').toLowerCase().contains('search'));
    await t.enterText(search, 'QA-SUNHAT');
    await t.pumpAndSettle();
    final count =
        find.byKey(const ValueKey('positive-preset-row-old')).evaluate().length;
    print('matched groups by role negative: ' + count.toString());
    expect(count, 1);
    await t.pumpWidget(const SizedBox());
    app.dispose();
  });
}
