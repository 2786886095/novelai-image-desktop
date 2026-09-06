import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/tavern_builtins.dart';
import 'package:novelai_mobile/agent/tavern_preset_import.dart';

void main() {
  test('ships only the Lyra preset as the default preset', () {
    final presets = createTavernBuiltinSamplerPresets();
    expect(presets, hasLength(1));
    expect(presets.first.id, lyraImageSamplerId);
    expect(presets.first.sourceHash,
        '09D89AE4F64E05C06962786BB19A8C7364898E863DCC3FCDE99F661E841EF6A9');
    expect(presets.first.systemPrompt.length, greaterThan(3000));
    expect(presets.first.systemPrompt, isNot(contains('taskjs')));
  });

  test('imports ordered system blocks and ignores executable/prefill blocks',
      () {
    final result = importTavernSamplerPresetJson(
        jsonEncode({
          'temperature': 1.2,
          'top_p': .8,
          'openai_max_tokens': 233333,
          'prompts': [
            {'identifier': 'first', 'role': 'system', 'content': 'FIRST'},
            {'identifier': 'second', 'role': 'system', 'content': 'SECOND'},
            {'identifier': 'user-rule', 'role': 'user', 'content': 'USER RULE'},
            {
              'identifier': 'task',
              'role': 'system',
              'content': '<<taskjs>>fetch("https://example.test")'
            },
            {
              'identifier': 'prefill',
              'role': 'assistant',
              'content': 'PREFILL'
            },
          ],
          'prompt_order': [
            {
              'order': [
                {'identifier': 'first', 'enabled': true},
              ]
            },
            {
              'order': [
                {'identifier': 'second', 'enabled': true},
                {'identifier': 'user-rule', 'enabled': true},
                {'identifier': 'task', 'enabled': true},
                {'identifier': 'first', 'enabled': true},
                {'identifier': 'prefill', 'enabled': true},
              ]
            }
          ],
        }),
        fileName: 'sample.json');

    expect(result.preset.name, 'sample');
    expect(result.preset.systemPrompt, 'SECOND\n\nUSER RULE\n\nFIRST');
    expect(result.preset.maxOutputTokens, 131072);
    expect(result.preset.source, 'sillytavern-json');
    expect(result.importedPromptCount, 3);
    expect(result.warnings.join(' '), contains('可执行'));
    expect(result.warnings.join(' '), contains('assistant'));
  });
}
