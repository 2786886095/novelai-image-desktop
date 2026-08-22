import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('style prompt preset persists at most three preview images', () {
    final preset = StylePromptPreset.fromJson({
      'id': 'style-1',
      'name': 'Blue night',
      'prompt': 'blue theme, moonlight',
      'createdAt': '2026-08-08T00:00:00Z',
      'previewImages': List.generate(
        5,
        (index) => {
          'id': 'image-$index',
          'name': '$index.png',
          'filePath': '/persistent/$index.png',
          'createdAt': '2026-08-08T00:00:00Z',
        },
      ),
    });

    expect(preset.previewImages, hasLength(3));
    expect(preset.toJson()['previewImages'], hasLength(3));
  });

  test('legacy style prompt preset loads with an empty image collection', () {
    final preset = StylePromptPreset.fromJson({
      'id': 'legacy',
      'name': 'Legacy',
      'prompt': 'watercolor',
      'createdAt': '',
    });
    expect(preset.previewImages, isEmpty);
    expect(preset.group, 'Default');
  });

  test('style groups and empty groups persist independently', () {
    final settings = AppSettings.fromJson({
      'stylePromptPresetGroups': ['Default', 'Lighting', 'Painting'],
      'stylePromptPresets': [
        {
          'id': 'style-2',
          'name': 'Sunset',
          'prompt': 'sunset lighting',
          'group': 'Lighting',
          'createdAt': '2026-08-22T00:00:00Z',
        },
      ],
    });
    expect(
        settings.stylePromptPresetGroups, ['Default', 'Lighting', 'Painting']);
    expect(settings.stylePromptPresets.single.group, 'Lighting');
    expect(settings.toJson()['stylePromptPresetGroups'], contains('Painting'));
  });

  test('style group CRUD survives a storage reload', () async {
    SharedPreferences.setMockInitialValues({});
    final first = AppState();
    expect(await first.addStylePromptPresetGroup('Lighting'), isTrue);
    final preset = await first.addStylePromptPreset(
      name: 'Sunset',
      prompt: 'sunset lighting',
    );
    await first.moveStylePromptPreset(preset.id, 'Lighting');

    final reloaded = await first.storage.getSettings();
    expect(reloaded.stylePromptPresetGroups, contains('Lighting'));
    expect(reloaded.stylePromptPresets.single.group, 'Lighting');

    final second = AppState()..settings = reloaded;
    expect(await second.removeStylePromptPresetGroup('Lighting'), isTrue);
    final afterDelete = await second.storage.getSettings();
    expect(afterDelete.stylePromptPresetGroups, isNot(contains('Lighting')));
    expect(afterDelete.stylePromptPresets.single.group, 'Default');
    first.dispose();
    second.dispose();
  });
}
