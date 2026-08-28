import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  final api = NaiApi();
  final settings = AppSettings(proxyMode: 'direct');

  test('new-user defaults use Human Focus with Variety disabled', () async {
    final defaults = GenerateParams();
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        model: 'nai-diffusion-4-5-full',
        positivePrompt: '1girl',
        negativePrompt: 'custom negative',
      ),
      123,
      GenerateExtras(),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    expect(payload['input'], '1girl, very aesthetic, masterpiece, no text');
    expect(payload['input'], isNot(contains('location')));
    expect(defaults.ucPreset, 2);
    expect(defaults.variety, isFalse);
    expect(defaults.model, 'nai-diffusion-5-full');
    expect(defaults.steps, 28);
    expect(defaults.cfgScale, 6);
    expect(parameters['uc'], contains('custom negative'));
    expect(parameters['uc'], contains('bad anatomy'));
    expect(parameters['uc'], contains('mismatched pupils'));
    expect(parameters['skip_cfg_above_sigma'], isNull);
  });

  test('preserves imported unsigned 32-bit NovelAI seeds in payloads',
      () async {
    const seed = 4000000000;
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(positivePrompt: '1girl', seed: seed, seedMode: 'fixed'),
      seed,
      GenerateExtras(),
    );
    expect((payload['parameters'] as Map<String, dynamic>)['seed'], seed);
  });

  test('Human Focus appends the official character-focused UC preset',
      () async {
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        model: 'nai-diffusion-4-5-curated',
        positivePrompt: '1girl',
        negativePrompt: 'custom negative',
        ucPreset: 2,
      ),
      123,
      GenerateExtras(),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    expect(parameters['uc'], contains('custom negative'));
    expect(parameters['uc'], contains('bad anatomy'));
    expect(parameters['uc'], contains('bad hands'));
    expect(parameters['uc'], contains('mismatched pupils'));
    expect(payload['input'], contains('-0.8::feet::'));
  });

  test('Variety and Euler noise schedule use NovelAI protocol fields',
      () async {
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        model: 'nai-diffusion-4-5-full',
        positivePrompt: 'test',
        variety: true,
        sampler: 'k_euler_ancestral',
        noiseSchedule: 'karras',
        cfgScale: 99,
      ),
      123,
      GenerateExtras(),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    expect(parameters['scale'], 10);
    expect(parameters['skip_cfg_above_sigma'], 58);
    expect(parameters.containsKey('variety'), isFalse);
    expect(parameters['deliberate_euler_ancestral_bug'], isFalse);
    expect(parameters['prefer_brownian'], isTrue);
  });

  test('V5 payload mirrors current model capabilities', () async {
    final extras = GenerateExtras(
      charCaptions: List.generate(
        40,
        (index) => CharCaptionItem(prompt: 'character ${index + 1}'),
      ),
    );
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        positivePrompt: 'group',
        cfgRescale: 0.5,
        noiseSchedule: 'exponential',
        variety: true,
      ),
      123,
      extras,
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    final prompt = (parameters['v4_prompt'] as Map)['caption'] as Map;

    expect(payload['model'], 'nai-diffusion-5-full');
    expect(parameters['params_version'], 4);
    expect(parameters['noise_schedule'], 'karras');
    expect(parameters['dynamic_thresholding'], isFalse);
    expect(parameters['skip_cfg_above_sigma'], isNull);
    expect(parameters.containsKey('director_reference_images'), isFalse);
    expect((parameters['v4_negative_prompt'] as Map)['legacy_uc'], isFalse);
    expect(prompt['char_captions'], hasLength(32));
  });

  test('V5 rejects Precise Reference before any request can be sent', () async {
    final extras = GenerateExtras(
      preciseReferences: const [
        PreciseReferenceItem(
          base64:
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          type: 'character',
        ),
      ],
    );
    expect(
      () => api.buildPayload(
        'unused',
        settings,
        GenerateParams(model: 'nai-diffusion-5-full'),
        123,
        extras,
      ),
      throwsA(isA<NaiHttpException>()),
    );
  });

  test('Furry mode keeps V5 Full and prefixes the official dataset tag once',
      () async {
    final furrySettings = AppSettings(proxyMode: 'direct', modelMode: 'furry');
    final payload = await api.buildPayload(
      'unused',
      furrySettings,
      GenerateParams(
        model: 'nai-diffusion-5-full',
        positivePrompt: 'anthro wolf',
        qualityPreset: 'none',
        qualityToggle: false,
      ),
      123,
      GenerateExtras(),
    );
    expect(payload['model'], 'nai-diffusion-5-full');
    expect(payload['input'], 'fur dataset, anthro wolf');
    final parameters = payload['parameters'] as Map<String, dynamic>;
    final caption = (parameters['v4_prompt'] as Map)['caption'] as Map;
    expect(caption['base_caption'], 'fur dataset, anthro wolf');

    final alreadyTagged = await api.buildPayload(
      'unused',
      furrySettings,
      GenerateParams(
        model: 'nai-diffusion-5-full',
        positivePrompt: 'fur dataset, anthro fox',
        qualityPreset: 'none',
        qualityToggle: false,
      ),
      123,
      GenerateExtras(),
    );
    expect(
        'fur dataset'.allMatches(alreadyTagged['input'] as String).length, 1);
  });

  test('V5 rejects legacy Vibe Transfer state instead of silently ignoring it',
      () async {
    expect(
      () => api.buildPayload(
        'unused',
        settings,
        GenerateParams(positivePrompt: '1girl'),
        123,
        GenerateExtras(vibeImages: const [
          VibeTransferItem(base64: 'dmliZQ=='),
        ]),
      ),
      throwsA(isA<NaiHttpException>()),
    );
  });

  test('character prompt can safely downgrade from structured to pipe form',
      () async {
    final extras = GenerateExtras(charCaptions: [
      CharCaptionItem(
          prompt: 'blue-haired girl', useCoords: true, x: 0.2, y: 0.3),
    ]);
    final structured = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(positivePrompt: 'two people'),
      123,
      extras,
    );
    final structuredParameters =
        structured['parameters'] as Map<String, dynamic>;
    final structuredCaption =
        (structuredParameters['v4_prompt'] as Map)['caption'] as Map;
    expect(structuredParameters['use_coords'], isTrue);
    expect(structuredCaption['char_captions'], hasLength(1));
    expect((structuredCaption['char_captions'] as List).single['centers'], [
      {'x': 0.2, 'y': 0.3}
    ]);

    final pipe = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(positivePrompt: 'two people'),
      123,
      extras,
      structuredCharacters: false,
    );
    final pipeParameters = pipe['parameters'] as Map<String, dynamic>;
    final pipeCaption = (pipeParameters['v4_prompt'] as Map)['caption'] as Map;
    expect(pipe['input'], startsWith('two people'));
    expect(pipe['input'], contains('| blue-haired girl'));
    expect(pipeParameters['use_coords'], isFalse);
    expect(pipeCaption['char_captions'], isEmpty);
  });

  test('V4 payload includes restored per-character negative prompt', () async {
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        positivePrompt: 'forest',
        qualityPreset: 'none',
        qualityToggle: false,
        ucPreset: 3,
      ),
      123,
      GenerateExtras(charCaptions: [
        CharCaptionItem(
          prompt: 'girl, blue hair',
          negativePrompt: 'short hair, smiling',
        ),
      ]),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    final negative =
        (parameters['v4_negative_prompt'] as Map)['caption'] as Map;
    expect(negative['char_captions'], [
      {
        'char_caption': 'short hair, smiling',
        'centers': [
          {'x': 0.5, 'y': 0.5}
        ]
      }
    ]);
  });

  test('character prompt without position uses the AI-choice center', () async {
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(positivePrompt: '2girls'),
      123,
      GenerateExtras(charCaptions: [
        CharCaptionItem(
          prompt: 'girl, blue hair',
          useCoords: false,
          x: 0.1,
          y: 0.9,
        ),
      ]),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    final caption = (parameters['v4_prompt'] as Map)['caption'] as Map;
    final character = (caption['char_captions'] as List).single as Map;

    expect(parameters['use_coords'], isFalse);
    expect(character['centers'], [
      {'x': 0.5, 'y': 0.5}
    ]);
  });

  test('V5 Light quality uses the lighter official tags', () async {
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        positivePrompt: '1girl',
        qualityPreset: 'light',
        qualityToggle: true,
      ),
      123,
      GenerateExtras(),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    expect(payload['input'], '1girl, very aesthetic, amazing quality, no text');
    expect(payload['input'], isNot(contains('masterpiece')));
    expect(parameters['qualityPresetId'], 'light');
    expect(parameters['tag_hint_qt'], 3);
  });

  test('V5 Transparent BG requests straight alpha output', () async {
    final payload = await api.buildPayload(
      'unused',
      settings,
      GenerateParams(
        positivePrompt: 'sticker',
        qualityPreset: 'none',
        qualityToggle: false,
        transparentBackground: true,
      ),
      123,
      GenerateExtras(),
    );
    final parameters = payload['parameters'] as Map<String, dynamic>;
    expect(payload['input'], 'sticker, transparent background');
    expect(parameters['tag_hint_transparent_background'], isTrue);
    expect(parameters['straight_alpha'], isTrue);
  });
}
