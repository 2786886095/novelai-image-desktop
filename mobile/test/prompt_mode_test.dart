import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('normal mode returns one cleaned prompt without variants', () {
    final result = parsePromptVariantResponse(
      '```text\nPrompt: 1girl,  solo, blue hair\n```',
      false,
    );
    expect(result.primary, '1girl, solo, blue hair');
    expect(result.variants, isNull);
  });

  test('known character mode parses strict JSON variants', () {
    final result = parsePromptVariantResponse(
      '{"namePrompt":"1girl, solo, furina (genshin impact)",'
      '"featurePrompt":"1girl, solo, white hair, blue eyes, blue coat"}',
      true,
    );
    expect(result.primary, contains('furina'));
    expect(result.variants?.namePrompt, contains('furina (genshin impact)'));
    expect(result.variants?.featurePrompt, isNot(contains('furina')));
    expect(result.variants?.isComplete, isTrue);
  });

  test('known character mode accepts labeled fallback output', () {
    final result = parsePromptVariantResponse(
      '角色名版：1girl, solo, furina (genshin impact)\n'
      '特征版：1girl, solo, white hair, blue eyes, blue coat',
      true,
    );
    expect(result.variants?.isComplete, isTrue);
  });

  test('runtime rule keeps known and unknown character behavior distinct', () {
    final known = knownCharacterRuntimeInstruction(
      ReversePromptMode.tags,
      'convert',
      true,
    );
    final unknown = knownCharacterRuntimeInstruction(
      ReversePromptMode.tags,
      'convert',
      false,
    );
    expect(known, contains('namePrompt and featurePrompt'));
    expect(known, contains('furina (genshin impact)'));
    expect(unknown, contains('Do not rely on character name tags'));
  });

  test('desktop templates are bundled for all modes', () async {
    final library = await PromptTemplateLibrary.load();
    for (final mode in ReversePromptMode.values) {
      expect(library.get('reverse', mode).length, greaterThan(500));
      expect(library.get('convert', mode).length, greaterThan(500));
      expect(library.get('scopedReverse', mode).length, greaterThan(300));
      expect(library.get('comic', mode).length, greaterThan(300));
    }
  });

  test('custom prompt template settings survive JSON persistence', () {
    final settings = AppSettings(
      reversePromptTemplates: {'tags': 'custom reverse'},
      convertPromptTemplates: {'mixed': 'custom convert'},
      comicPromptTemplate: 'custom comic',
    );
    final restored = AppSettings.fromJson(settings.toJson());
    expect(restored.reversePromptTemplates['tags'], 'custom reverse');
    expect(restored.convertPromptTemplates['mixed'], 'custom convert');
    expect(restored.comicPromptTemplate, 'custom comic');
  });
}
