import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:novelai_mobile/ui/character_editing.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'legacy characters default on; pause survives deep copy, storage, presets and reorder',
      () async {
    final a = CharCaptionItem(
        enabled: false,
        prompt: ' exact text ',
        negativePrompt: 'red',
        useCoords: true,
        x: 0,
        y: 1);
    expect(CharCaptionItem.fromJson({'prompt': 'legacy'}).enabled, isTrue);
    expect(CharCaptionItem.fromJson({'enabled': 'false'}).enabled, isTrue);
    final b = CharCaptionItem(prompt: 'blue');
    final extras = GenerateExtras(charCaptions: [a, b]);
    final copied = extras.copy();
    expect(copied.charCaptions.first.enabled, isFalse);
    a.prompt = 'changed';
    expect(copied.charCaptions.first.prompt, ' exact text ');
    await Storage().setCharacterPrompts(copied.charCaptions);
    final restored = await Storage().getCharacterPrompts();
    expect(restored.first.toJson(), copied.charCaptions.first.toJson());
    expect(reorderCharacters(restored, 0, 1)[1].enabled, isFalse);
    expect(
        PositivePromptPreset(
                id: 'p',
                name: 'P',
                prompt: '',
                createdAt: 'now',
                captions: restored)
            .toJson()['captions'][0]['enabled'],
        isFalse);
  });
  for (final model in [
    'nai-diffusion-4-5-full',
    'nai-diffusion-4-5-curated',
    'nai-diffusion-5-full',
    'nai-diffusion-5-curated'
  ]) {
    test(
        '$model request excludes paused positive/negative/positions in both transports',
        () async {
      final a = CharCaptionItem(
          enabled: false,
          prompt: 'paused role',
          negativePrompt: 'paused negative',
          useCoords: true,
          x: 0,
          y: 1);
      final b = CharCaptionItem(
          prompt: 'active role', negativePrompt: 'active negative');
      final extras = GenerateExtras(charCaptions: [a, b]);
      final params = GenerateParams(
          model: model,
          positivePrompt: 'scene',
          qualityPreset: 'none',
          ucPreset: 3);
      final api = NaiApi(), settings = AppSettings(proxyMode: 'direct');
      final payload =
          await api.buildPayload('unused', settings, params, 123, extras);
      final p = payload['parameters'];
      expect(p['v4_prompt']['caption']['char_captions'], [
        {
          'char_caption': 'active role',
          'centers': [
            {'x': .5, 'y': .5}
          ]
        }
      ]);
      expect(p['v4_negative_prompt']['caption']['char_captions'], [
        {
          'char_caption': 'active negative',
          'centers': [
            {'x': .5, 'y': .5}
          ]
        }
      ]);
      expect(p['use_coords'], isFalse);
      expect(p.toString(), isNot(contains('paused')));
      expect(p.toString(), isNot(contains('enabled')));
      expect(
          (await api.buildPayload('unused', settings, params, 123, extras,
              structuredCharacters: false))['input'],
          'scene | active role');
      a.enabled = true;
      final restored =
          await api.buildPayload('unused', settings, params, 123, extras);
      expect(
          restored['parameters']['v4_prompt']['caption']['char_captions']
              .length,
          2);
      expect(
          restored['parameters']['v4_prompt']['caption']['char_captions'][0]
              ['centers'],
          [
            {'x': 0.0, 'y': 1.0}
          ]);
      a.enabled = false;
      b.enabled = false;
      final empty =
          await api.buildPayload('unused', settings, params, 123, extras);
      expect(empty['parameters']['v4_prompt']['caption']['char_captions'],
          isEmpty);
      expect(
          empty['parameters']['v4_negative_prompt']['caption']['char_captions'],
          isEmpty);
      expect(empty['parameters']['use_coords'], isFalse);
    });
  }
  testWidgets(
      'real switch preserves text/position, updates marker and survives storage',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2800);
    addTearDown(tester.view.reset);
    final s = AppState();
    addTearDown(s.dispose);
    s.settings.language = 'en-US';
    final a = CharCaptionItem(
        prompt: 'blue coat',
        negativePrompt: 'red coat',
        useCoords: true,
        x: .2,
        y: .3);
    s.extras.charCaptions = [a, CharCaptionItem(prompt: 'bob')];
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: s, child: const MaterialApp(home: GenerateScreen())));
    await tester.pumpAndSettle();
    final control = find.byKey(const ValueKey('character-enabled-0'));
    await tester.scrollUntilVisible(control, 400,
        scrollable: find.byType(Scrollable).first, maxScrolls: 12);
    await tester.pumpAndSettle();
    await tester.tap(control);
    await tester.pumpAndSettle();
    expect(a.enabled, isFalse);
    expect(a.prompt, 'blue coat');
    expect(a.negativePrompt, 'red coat');
    expect(a.x, .2);
    expect(a.y, .3);
    expect(s.extras.charCaptions[1].enabled, isTrue);
    expect(find.byKey(const ValueKey('character-position-marker-0')),
        findsNothing);
    expect((await Storage().getCharacterPrompts()).first.enabled, isFalse);
    await tester.tap(control);
    await tester.pumpAndSettle();
    expect(a.enabled, isTrue);
    expect(find.byKey(const ValueKey('character-position-marker-0')),
        findsOneWidget);
  });
}
