import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/positive_prompt_presets.dart';

void main() {
  test('positive preset names use prompt text and increment conflicts', () {
    expect(
      defaultPositivePromptPresetName('1girl, cinematic lighting, masterpiece'),
      '1girl, cinematic lighting',
    );
    final presets = [
      PositivePromptPreset(
        id: 'a',
        name: '夜景',
        prompt: 'night',
        createdAt: '',
      ),
      PositivePromptPreset(
        id: 'b',
        name: '夜景 (1)',
        prompt: 'night city',
        createdAt: '',
      ),
    ];
    expect(uniquePositivePromptPresetName(presets, '夜景'), '夜景 (2)');
    expect(
      uniquePositivePromptPresetName(presets, '夜景', excludeId: 'a'),
      '夜景',
    );
    expect(positivePromptPresetStorageId('abc'), 'positive-prompt-abc');
  });
}
