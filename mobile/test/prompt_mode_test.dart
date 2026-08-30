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
    expect(known, contains('namePrompt 和 featurePrompt'));
    expect(known, contains('同一完整画面'));
    expect(known, contains('规范 Danbooru 角色 Tag'));
    expect(known, contains('高置信度标志性外貌、默认服装与配饰'));
    expect(known, contains('个人法典规则'));
    expect(known, isNot(contains('Keep both prompts short')));
    expect(unknown, contains('不要使用角色名'));
  });

  test('desktop templates are bundled for all modes', () async {
    final library = await PromptTemplateLibrary.load();
    for (final mode in ReversePromptMode.values) {
      expect(library.get('reverse', mode).length, greaterThan(500));
      expect(library.get('convert', mode).length, greaterThan(500));
      expect(library.get('scopedReverse', mode).length, greaterThan(300));
      expect(
          library
              .getReverse(mode, scoped: false, templateVersion: 'v4.5')
              .length,
          greaterThan(300));
      expect(library.get('comic', mode).length, greaterThan(300));
    }
  });

  test('custom prompt template settings survive JSON persistence', () {
    final settings = AppSettings(
      reversePromptTemplates: {'tags': 'custom reverse'},
      convertPromptTemplates: {'mixed': 'custom convert'},
      comicPromptTemplate: 'custom comic',
      promptRuleAutoRepairEnabled: true,
      reversePromptTemplateVersion: 'v4.5',
    );
    final restored = AppSettings.fromJson(settings.toJson());
    expect(restored.reversePromptTemplates['tags'], 'custom reverse');
    expect(restored.convertPromptTemplates['mixed'], 'custom convert');
    expect(restored.comicPromptTemplate, 'custom comic');
    expect(restored.promptRuleAutoRepairEnabled, isTrue);
    expect(restored.reversePromptTemplateVersion, 'v4.5');
  });

  test('mature tag rules apply only to tags and mixed modes', () {
    expect(modeUserInstruction(ReversePromptMode.tags, 'convert'),
        contains('exact mature'));
    expect(modeUserInstruction(ReversePromptMode.mixed, 'reverse'),
        contains('mature Danbooru'));
    expect(modeUserInstruction(ReversePromptMode.natural, 'convert'),
        isNot(contains('mature Danbooru')));
  });

  test('known-character conversion uses a strict paired JSON contract', () {
    final instruction = modeUserInstruction(
      ReversePromptMode.mixed,
      'convert',
      knownCharacter: true,
    );
    expect(instruction, contains('exactly two string fields'));
    expect(instruction, contains('namePrompt'));
    expect(instruction, contains('featurePrompt'));
    expect(
        instruction, contains('signature appearance, outfit, and accessories'));
    expect(instruction, contains('75–85%'));
  });

  test('bundled reverse and convert templates use the concise V5 contract',
      () async {
    final library = await PromptTemplateLibrary.load();
    for (final kind in ['scopedReverse', 'convert']) {
      for (final mode in ReversePromptMode.values) {
        final template = library.get(kind, mode);
        expect(template, contains('NovelAI V5'));
        expect(template.length, inInclusiveRange(1000, 2700));
        expect(template, contains('fur dataset'));
        expect(template, contains('background dataset'));
        expect(template, contains('Text:'));
        expect(template, contains('最多 22'));
        expect(template, contains('transparent background'));
        expect(template, isNot(contains('优先使用 mcp 服务搜索')));
        expect(template, isNot(contains('不要默认全部无权重')));
        expect(template, isNot(contains('图片分析顺序')));
      }
    }
  });

  test('bundled templates preserve audited V5 prompt-quality safeguards',
      () async {
    final library = await PromptTemplateLibrary.load();
    for (final kind in ['scopedReverse', 'convert']) {
      for (final mode in [ReversePromptMode.tags, ReversePromptMode.mixed]) {
        final template = library.get(kind, mode);
        expect(template, contains('不得留下孤立锚点'));
        expect(template, contains('1.2::tag ::'));
        expect(template, contains('source#giving/target#giving'));
        expect(template, isNot(contains('source#handing item')));
        expect(template, contains('交接中的道具不算共享道具'));
        expect(template, contains('属于关键互动'));
      }
      final natural = library.get(kind, ReversePromptMode.natural);
      expect(natural, contains('text, <language> text'));
      expect(natural, contains('不复述文字内容'));
      expect(natural, isNot(contains('reads OPEN')));
      for (final mode in ReversePromptMode.values) {
        final template = library.get(kind, mode);
        expect(template, isNot(contains('base 最末、第一个 | 之前')));
        expect(template, isNot(contains('不写 portrait、landscape')));
        expect(template, contains('同一层级互斥'));
        expect(template, contains('不视为互斥'));
      }
    }
    expect(
      library.get('scopedReverse', ReversePromptMode.mixed),
      contains('无成熟 Tag 的关键可见状态或表情'),
    );
    expect(
      library.get('scopedReverse', ReversePromptMode.mixed),
      contains('其他关系短语紧跟被限定的 Tag 或动作'),
    );
    expect(
      library.get('scopedReverse', ReversePromptMode.tags),
      contains('本模式允许省略且不得混入自然语言'),
    );
    expect(
      library.get('convert', ReversePromptMode.tags),
      contains('空间关系优先由角色段顺序表达'),
    );
    expect(
      library.get('convert', ReversePromptMode.tags),
      contains('mutual#holding hands'),
    );
    expect(
      library.get('convert', ReversePromptMode.mixed),
      contains('mutual#holding hands'),
    );
    expect(
      library.get('convert', ReversePromptMode.mixed),
      contains('无成熟 Tag 的关键可见状态或表情'),
    );
    expect(
      library.get('convert', ReversePromptMode.mixed),
      allOf(contains('75–85%'), contains('15–25%'), contains('示例中文含义')),
    );
  });

  test('rule validator detects duplicate and mature tag decomposition', () {
    final issues = promptRuleViolations(
      ReversePromptMode.tags,
      '1girl, cowboy shot, upper body, smile, smile',
      ['cowboy_shot'],
    );
    expect(issues.any((item) => item.contains('重复 Tag：smile')), isTrue);
    expect(issues.any((item) => item.contains('cowboy shot / upper body')),
        isTrue);
    expect(issues.any((item) => item.contains('成熟 Tag cowboy shot')), isTrue);
    expect(
        promptRuleViolations(
            ReversePromptMode.natural, 'A girl is standing.', ['standing']),
        isEmpty);
  });

  test('mixed validator rejects pure tags but accepts tag plus relation prose',
      () {
    const tags =
        '2girls, cafe, indoors, evening, upper body, counter, cake | girl, black hair, green eyes, holding plate | girl, red hair, blue eyes, reaching';
    expect(
      promptRuleViolations(ReversePromptMode.mixed, tags),
      contains('混合模式缺少约 20% 的自然语言关系短语'),
    );
    expect(
      promptRuleViolations(
        ReversePromptMode.mixed,
        '$tags, on the right, reaching with both hands',
      ).where((item) => item.contains('混合模式')),
      isEmpty,
    );
  });
}
