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

  test('detects the failed natural-mode tag-list shape', () {
    expect(
      isLikelyTagListPrompt(
          '2boys, black hair, white shirt, sitting, drawing, blue hair, blue hoodie, standing, throwing, ball'),
      isTrue,
    );
  });

  test('does not flag the expected natural multi-character prompt', () {
    const prompt =
        'Two boys are in a classroom with desks, chairs, a sketchbook, and colored balls, shown from the front in a full-body view | A boy with short black hair and a white shirt is sitting on the left at the desk and drawing in the sketchbook with a pencil | A boy with blue hair and a dark blue hoodie is standing on the right and juggling three colored balls';
    expect(isLikelyTagListPrompt(prompt), isFalse);
    expect(isLikelyNaturalLanguagePrompt(prompt), isTrue);
  });

  test('repairs tags mode when the model returns pure prose', () {
    const prose =
        'Two boys are in a classroom while one boy is drawing and another boy is juggling balls.';
    expect(modeNeedsRepair(ReversePromptMode.tags, prose), isTrue);
    expect(modeRepairSystemPrompt(ReversePromptMode.tags),
        contains('comma-separated tags'));
  });

  test('does not repair tags mode when the model returns tag-style output', () {
    const tags =
        '2boys, classroom, desks, chairs, sketchbook, colored balls, full body, from front | boy, short black hair, white shirt, sitting, drawing | boy, blue hair, dark blue hoodie, standing, juggling balls';
    expect(modeNeedsRepair(ReversePromptMode.tags, tags), isFalse);
  });

  test('repairs mixed mode when the model returns pure prose only', () {
    const prose =
        'Two boys are in a classroom while one boy is drawing and another boy is juggling balls.';
    expect(modeNeedsRepair(ReversePromptMode.mixed, prose), isTrue);
    expect(modeRepairSystemPrompt(ReversePromptMode.mixed),
        contains('mostly Danbooru tags'));
  });

  test('builds a repair prompt anchored to the target example style', () {
    expect(naturalRepairSystemPrompt(), contains('Two boys are in a classroom'));
    expect(
      buildModeRepairUserText(
          ReversePromptMode.natural, '一个黑发男孩', '1boy, black hair, sitting'),
      contains('Incorrect output:'),
    );
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
