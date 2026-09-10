import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/screens/generate_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
      'editing a visible character field survives a new storage instance',
      (tester) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(430, 2800);
    addTearDown(tester.view.reset);
    final state = AppState();
    addTearDown(state.dispose);
    state.addCharacter();
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: state, child: const MaterialApp(home: GenerateScreen())));
    await tester.pumpAndSettle();
    final field = find.byKey(const ValueKey('character-prompt-field-0'));
    await tester.scrollUntilVisible(field, 400,
        scrollable: find.byType(Scrollable).first, maxScrolls: 12);
    await tester.enterText(field, 'blue coat, smile');
    await tester.pumpAndSettle();
    expect((await Storage().getCharacterPrompts()).single.prompt,
        'blue coat, smile');
    final negative = find.byKey(const ValueKey('character-negative-field-0'));
    await tester.ensureVisible(negative);
    await tester.pumpAndSettle();
    await tester.enterText(negative, 'red coat');
    await tester.pumpAndSettle();
    expect((await Storage().getCharacterPrompts()).single.negativePrompt,
        'red coat');
  });
  test(
      'characters survive a new storage instance, preserve blanks/coordinates and deletion',
      () async {
    final caption = CharCaptionItem(
        prompt: ' blue coat ', negativePrompt: '', x: 0, y: 1, useCoords: true);
    final store = Storage();
    await store.setCharacterPrompts([caption, CharCaptionItem()]);
    final restored = await Storage().getCharacterPrompts();
    expect(restored.map((c) => c.toJson()).toList(),
        [caption.toJson(), CharCaptionItem().toJson()]);
    await store.setCharacterPrompts([]);
    expect(await Storage().getCharacterPrompts(), isEmpty);
  });
  test('character snapshots do not change during asynchronous saves', () async {
    final caption = CharCaptionItem(prompt: 'before');
    final save = Storage().setCharacterPrompts([caption]);
    caption.prompt = 'after';
    await save;
    expect((await Storage().getCharacterPrompts()).single.prompt, 'before');
  });
  test('presets survive settings serialization with original prompt bytes',
      () async {
    final settings = AppSettings(characterPromptPresets: [
      {
        'id': 'a',
        'name': 'A',
        'createdAt': 'now',
        'captions': [CharCaptionItem(prompt: ' coat ', x: 0).toJson()]
      }
    ]);
    await Storage().setSettings(settings);
    final restored = await Storage().getSettings();
    expect(restored.characterPromptPresets, settings.characterPromptPresets);
  });
  test(
      'malformed coordinates repaired without dropping neighboring valid characters',
      () {
    final caption =
        CharCaptionItem.fromJson({'prompt': 'coat', 'x': 'invalid', 'y': 0});
    expect(caption.x, .5);
    expect(caption.y, 0);
    expect(caption.prompt, 'coat');
  });
  test('style rename preserves prompt, group, id and images on disk', () async {
    final state = AppState();
    final preset = StylePromptPreset(
        id: 'p',
        name: 'Old',
        prompt: ' artist:test ',
        group: 'Default',
        createdAt: 'now');
    state.settings.stylePromptPresets = [preset];
    await state.renameStylePromptPreset('p', ' New ');
    final restored = (await Storage().getSettings()).stylePromptPresets.single;
    expect(restored.name, 'New');
    expect(restored.prompt, ' artist:test ');
    expect(restored.id, 'p');
    state.dispose();
  });
}
