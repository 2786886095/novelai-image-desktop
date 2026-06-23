import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/models/nai_models.dart';

const paidAccount = AccountSummary(
  hasToken: true,
  tierLevel: 1,
  tierName: 'Tablet',
  hasActiveSubscription: true,
  anlasBalance: 1000,
);

const opusAccount = AccountSummary(
  hasToken: true,
  tierLevel: 3,
  tierName: 'Opus',
  hasActiveSubscription: true,
  anlasBalance: 1000,
);

void main() {
  test('default 832x1216 28-step image costs 20 Anlas', () {
    final quote = calculateImageGenerationAnlas(
      params: GenerateParams(),
      account: paidAccount,
    );
    expect(quote.amount, 20);
  });

  test('eligible Opus text generation is free', () {
    final quote = calculateImageGenerationAnlas(
      params: GenerateParams(),
      account: opusAccount,
    );
    expect(quote.amount, 0);
  });

  test('image-to-image strength scales the base price', () {
    final quote = calculateImageGenerationAnlas(
      params: GenerateParams(),
      account: paidAccount,
      imageToImage: true,
      strength: 0.7,
    );
    expect(quote.amount, 14);
  });

  test('Vibe encoding is one-time rather than multiplied by batch', () {
    final quote = calculateImageGenerationAnlas(
      params: GenerateParams(),
      account: opusAccount,
      batchCount: 3,
      extras: GenerateExtras(vibeImages: const [
        VibeTransferItem(base64: ''),
        VibeTransferItem(base64: ''),
      ]),
    );
    expect(quote.amount, 4);
  });

  test('precise reference is a flat 5 Anlas per generated image', () {
    final quote = calculateImageGenerationAnlas(
      params: GenerateParams(),
      account: opusAccount,
      batchCount: 2,
      preciseReferenceCount: 2,
    );
    expect(quote.amount, 10);
  });

  test('official price parser accepts direct and nested response shapes', () {
    expect(extractOfficialAnlasPrice({'price': 12.2}), 13);
    expect(
      extractOfficialAnlasPrice({
        'data': {
          'result': {'requestPrice': '7'}
        }
      }),
      7,
    );
    expect(extractOfficialAnlasPrice({'message': 'none'}), isNull);
  });

  test('upscale and director use official fixed tiers', () {
    expect(
      calculateUpscaleAnlas(
        image: const WorkingImage(filePath: '', width: 1024, height: 1024),
        account: opusAccount,
      ).amount,
      7,
    );
    expect(
      calculateDirectorAnlas(tool: 'bg-removal', account: paidAccount).amount,
      65,
    );
    expect(
      calculateDirectorAnlas(tool: 'lineart', account: paidAccount).amount,
      0,
    );
  });

  test('inpaint quote pads dimensions to 64 and applies strength', () {
    final quote = calculateInpaintAnlas(
      params: GenerateParams(),
      account: paidAccount,
      image: const WorkingImage(filePath: '', width: 739, height: 1078),
      inpaintModel: 'nai-diffusion-4-5-curated-inpainting',
      strength: 1,
    );
    expect(quote.ok, isTrue);
    expect(quote.amount, greaterThan(0));
  });
}
