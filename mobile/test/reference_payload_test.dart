import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/state/app_state.dart';

String _imageBase64(int width, int height) =>
    base64Encode(img.encodePng(img.Image(width: width, height: height)));

void main() {
  test('precise reference payload matches NovelAI director fields', () async {
    final api = NaiApi();
    final params = GenerateParams()
      ..model = 'nai-diffusion-4-5-full'
      ..positivePrompt = '1girl';
    final payload = await api.buildPayload(
      'unused-token',
      AppSettings(proxyMode: 'direct'),
      params,
      123,
      GenerateExtras(
        preciseReferences: [
          PreciseReferenceItem(
            base64: _imageBase64(96, 128),
            type: 'character&style',
            strength: 0.8,
            fidelity: 0.75,
          ),
        ],
      ),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;

    // base_caption carries the TYPE (the official client's multipart format).
    expect(
      parameters['director_reference_descriptions'],
      [
        {
          'caption': {
            'base_caption': 'character&style',
            'char_captions': <Object>[],
          },
          'legacy_uc': false,
        }
      ],
    );
    expect(parameters['director_reference_strength_values'], [0.8]);
    expect(parameters['director_reference_secondary_strength_values'], [0.25]);
    // Information extracted is fixed at 1.0 (matches the reference tool).
    expect(parameters['director_reference_information_extracted'], [1.0]);

    // The image rides as a multipart binary part (director_ref_0); the JSON
    // references it via director_reference_images_cached, not raw base64.
    final cached = parameters['director_reference_images_cached'] as List;
    expect(cached.length, 1);
    expect((cached.first as Map)['data'], 'director_ref_0');
    expect(((cached.first as Map)['cache_secret_key'] as String).length, 64);

    // The image is preprocessed to an official director size (portrait here),
    // which is what prevents the screentone/halftone artifact.
    final images = parameters['director_reference_images'] as List;
    expect(images.length, 1);
    final decoded = img.decodePng(base64Decode(images.first as String))!;
    expect(decoded.width, 1024);
    expect(decoded.height, 1536);
  });

  test('precise reference adds one flat fee per generated image', () {
    final quote = calculateImageGenerationAnlas(
      params: GenerateParams()
        ..model = 'nai-diffusion-4-5-full'
        ..width = 832
        ..height = 1216
        ..steps = 28,
      account: const AccountSummary(
        hasToken: true,
        tierLevel: 3,
        hasActiveSubscription: true,
      ),
      batchCount: 2,
      preciseReferenceCount: 3,
      language: 'zh-CN',
    );
    expect(quote.details.join('\n'), contains('精准参考：2 张 x 5 = 10'));
  });

  test('a non-official reference size is accepted and normalized, not rejected',
      () async {
    final directory = await Directory.systemTemp.createTemp('nai-ref-test');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/wrong.png');
    await file.writeAsBytes(img.encodePng(img.Image(width: 96, height: 128)));
    final state = AppState();
    addTearDown(state.dispose);
    final error = await state.addPreciseReference(file.path);
    expect(error, isNull);
    expect(state.extras.preciseReferences, hasLength(1));
  });
}
