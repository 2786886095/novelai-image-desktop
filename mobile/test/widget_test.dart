import 'package:flutter_test/flutter_test.dart';

import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('GenerateParams round-trips through JSON', () {
    final p = GenerateParams(positivePrompt: '1girl', seed: 42, steps: 30);
    final restored = GenerateParams.fromJson(p.toJson());
    expect(restored.positivePrompt, '1girl');
    expect(restored.seed, 42);
    expect(restored.steps, 30);
  });

  test('model tier detection', () {
    expect(GenerateParams(model: 'nai-diffusion-4-5-full').isV45, isTrue);
    expect(GenerateParams(model: 'nai-diffusion-4-full').isV4Plus, isTrue);
    expect(GenerateParams(model: 'nai-diffusion-3').isV4Plus, isFalse);
  });
}
