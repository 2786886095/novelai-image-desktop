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
    final v5 = GenerateParams(model: 'nai-diffusion-5-full');
    expect(v5.isV5, isTrue);
    expect(v5.isV4Plus, isTrue);
    expect(v5.supportsPreciseReference, isFalse);
    expect(v5.supportsVibeTransfer, isFalse);
    expect(v5.maxCharacterPrompts, 32);
    final v45 = GenerateParams(model: 'nai-diffusion-4-5-full');
    expect(v45.isV45, isTrue);
    expect(v45.supportsPreciseReference, isTrue);
    expect(GenerateParams(model: 'nai-diffusion-4-full').isV4Plus, isTrue);
    expect(GenerateParams(model: 'nai-diffusion-3').isV4Plus, isFalse);
  });

  test('custom dimensions snap after commit and respect the official area', () {
    expect(snapNaiDimension(1000), 1024);
    expect(snapNaiDimension(1057), 1088);
    expect(snapNaiDimensionWithinArea(1920, 1088), 1920);
    expect(snapNaiDimensionWithinArea(4096, 768), 4096);
    final adaptive = adaptiveNaiImageSize(1000, 1300);
    expect(adaptive, (1024, 1280));
    final oversized = fitNaiImageSize(4000, 3000);
    expect(oversized.$1 % 64, 0);
    expect(oversized.$2 % 64, 0);
    expect(oversized.$1 * oversized.$2, lessThanOrEqualTo(naiMaxPixelArea));
  });

  test('Enhance 2x is blocked before exceeding the official pixel area', () {
    final boundary = resolveNaiEnhanceOutputSize(1024, 768, 2);
    expect(boundary, (width: 2048, height: 1536, exceedsLimit: false));
    expect(boundary.width * boundary.height, naiMaxPixelArea);

    final oversized = resolveNaiEnhanceOutputSize(832, 1216, 2);
    expect(oversized, (width: 1664, height: 2432, exceedsLimit: true));
  });

  test('Light and transparent background are normalized to V5 only', () {
    final legacy = GenerateParams(
      model: 'nai-diffusion-4-5-full',
      qualityPreset: 'light',
      transparentBackground: true,
    ).normalized();
    expect(legacy.qualityPreset, 'standard');
    expect(legacy.transparentBackground, isFalse);
  });
}
