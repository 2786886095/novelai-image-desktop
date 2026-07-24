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
    expect(parameters['uc'], contains('custom negative'));
    expect(parameters['uc'], contains('bad anatomy'));
    expect(parameters['uc'], contains('mismatched pupils'));
    expect(parameters['skip_cfg_above_sigma'], isNull);
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
}
