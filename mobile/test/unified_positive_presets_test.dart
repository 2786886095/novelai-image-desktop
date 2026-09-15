import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/positive_prompt_preset_sheet.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'legacy roles migrate into positive presets once, deletion does not resurrect them',
      () {
    final settings = AppSettings.fromJson({
      'characterPromptPresets': [
        {
          'id': 'old',
          'name': 'Team',
          'createdAt': 'then',
          'captions': [
            {
              'prompt': 'alice',
              'negativePrompt': 'hat',
              'x': 0,
              'y': 1,
              'useCoords': true
            },
            {
              'prompt': '',
              'negativePrompt': '',
              'x': .5,
              'y': 0,
              'useCoords': false
            }
          ]
        }
      ]
    });
    expect(settings.characterPromptPresets, isEmpty);
    final item = settings.positivePromptPresets.single;
    expect(item.captions.length, 2);
    expect(item.captions[0].x, 0);
    expect(item.captions[0].negativePrompt, 'hat');
    expect(item.captions[1].prompt, '');
    final restored = AppSettings.fromJson(settings.toJson());
    expect(restored.positivePromptPresets.length, 1);
    restored.positivePromptPresets.clear();
    expect(
        AppSettings.fromJson(restored.toJson()).positivePromptPresets, isEmpty);
  });
  testWidgets(
      'applying a saved role restores its fields without replacing global text',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1000, 1400);
    addTearDown(tester.view.reset);
    final s = AppState();
    addTearDown(s.dispose);
    s.settings.language = 'en-US';
    s.settings.positivePromptPresets = [
      PositivePromptPreset(
          id: 'role',
          name: 'Alice',
          prompt: 'alice',
          createdAt: 'now',
          captions: [
            CharCaptionItem(
                prompt: 'alice',
                negativePrompt: 'hat',
                x: 0,
                y: 1,
                useCoords: true)
          ])
    ];
    var text = 'unchanged';
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s,
        child: MaterialApp(
            home: Scaffold(
                body: PositivePromptPresetButton(
                    currentPrompt: text, onApply: (v) => text = v)))));
    await tester.tap(find.text('Prompt presets'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Alice').first);
    await tester.pumpAndSettle();
    final apply = find.text('Apply · 1');
    await tester.ensureVisible(apply);
    await tester.tap(apply);
    await tester.pumpAndSettle();
    expect(s.extras.charCaptions.single.prompt, 'alice');
    expect(s.extras.charCaptions.single.negativePrompt, 'hat');
    expect(s.extras.charCaptions.single.x, 0);
    expect(text, 'unchanged');
  });
}
