import 'dart:convert';
import 'prompt_mode.dart';

const promptSkillV3Runtime =
    '本次为普通转换/视觉模型调用，不提供模板中提到的MCP或任何生图工具；不得声称已检索、核验工具或出图。只按照所选原稿与实际输入生成提示词，不推断收费/能力。信息不足时明确说明，不用固定单元数量杜撰。';

/// V3 retains the source template's own rules: never apply v2's fixed density.
({String prompt, PromptVariants? variants, List<String> warnings})
    parsePromptSkillV3Response(String raw, {bool knownCharacter = false}) {
  final input = raw.trim();
  final fence = RegExp(r'^```(?:json|text|txt)?[ \t]*\r?\n([\s\S]*?)\r?\n```$',
          caseSensitive: false)
      .firstMatch(input);
  if (input.startsWith('```') && fence == null) {
    throw const FormatException('提示词代码围栏未完整闭合');
  }
  final text = fence?.group(1)?.trim() ?? input;
  String validate(Object? value) {
    if (value is! String || value.trim().isEmpty) {
      throw const FormatException('提示词为空');
    }
    if (RegExp(r'^(?:信息不足|模式能力不足|无法完成|我无法|抱歉)').hasMatch(value.trim())) {
      throw FormatException(value.trim());
    }
    final body = value
        .split(RegExp(r'\r?\n'))
        .where((line) => !RegExp(r'^\s*#').hasMatch(line))
        .join('\n')
        .trim();
    if (body.isEmpty) throw const FormatException('结果只有元信息，没有提示词');
    return body;
  }

  if (!knownCharacter) {
    return (prompt: validate(text), variants: null, warnings: const []);
  }
  final value = jsonDecode(text);
  if (value is! Map) throw const FormatException('双版本结果须为JSON对象');
  final namePrompt = validate(value['namePrompt']),
      featurePrompt = validate(value['featurePrompt']);
  return (
    prompt: namePrompt,
    variants:
        PromptVariants(namePrompt: namePrompt, featurePrompt: featurePrompt),
    warnings: const []
  );
}
