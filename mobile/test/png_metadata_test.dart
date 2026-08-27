import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('reads PNG tEXt chunks and maps NovelAI parameters', () {
    final comment = jsonEncode({
      'uc': 'lowres, bad anatomy',
      'steps': 28,
      'scale': 6,
      'cfg_rescale': 0.2,
      'seed': 12345,
      'width': 832,
      'height': 1216,
      'sampler': 'k_euler_ancestral',
      'noise_schedule': 'karras',
      'model': 'nai-diffusion-4-5-full',
      'sm': false,
      'sm_dyn': false,
    });
    final bytes = _makePng({
      'Description': '1girl, masterpiece',
      'Comment': comment,
    });
    final metadata = parsePngTextMetadata(bytes);
    final imported = parseImportedGenerateParams(metadata);
    final target = GenerateParams();
    imported.applyTo(target);

    expect(metadata['Description'], '1girl, masterpiece');
    expect(target.positivePrompt, '1girl, masterpiece');
    expect(target.negativePrompt, 'lowres, bad anatomy');
    expect(target.model, 'nai-diffusion-4-5-full');
    expect((target.width, target.height), (832, 1216));
    expect(target.cfgRescale, 0.2);
    expect(target.seed, 12345);
    expect(target.seedMode, 'fixed');
    expect(target.noiseSchedule, 'karras');
  });

  test('ignores malformed metadata and unknown options', () {
    final imported = parseImportedGenerateParams({
      'Description': 'test',
      'Comment': '{broken',
      'Source': 'unknown-model',
    });
    expect(imported.positivePrompt, 'test');
    expect(imported.model, isNull);
    expect(parsePngTextMetadata(Uint8List.fromList([1, 2, 3])), isEmpty);
  });

  test('preserves NovelAI unsigned 32-bit seeds exactly', () {
    final imported = parseImportedGenerateParams({
      'Description': '1girl',
      'Comment': jsonEncode({'seed': 4000000000}),
    });
    final target = GenerateParams();
    imported.applyTo(target);
    final normalized = target.normalized();
    expect(normalized.seed, 4000000000);
    expect(normalized.seedMode, 'fixed');
  });

  test('recognizes V5 Full and Curated metadata names', () {
    expect(
      parseImportedGenerateParams({'Source': 'NovelAI Diffusion V5 Full'})
          .model,
      'nai-diffusion-5-full',
    );
    expect(
      parseImportedGenerateParams({'Source': 'NovelAI Diffusion V5 Curated'})
          .model,
      'nai-diffusion-5-curated',
    );
  });

  test('restores V4.5 character prompts, negatives, model and effective flags',
      () {
    final comment = jsonEncode({
      'steps': 28,
      'width': 1024,
      'height': 1024,
      'scale': 6,
      'cfg_rescale': 0,
      'seed': 2058326448,
      'sampler': 'k_euler_ancestral',
      'noise_schedule': 'karras',
      'skip_cfg_above_sigma': null,
      'v4_prompt': {
        'caption': {
          'base_caption': 'best quality, forest',
          'char_captions': [
            {
              'char_caption': 'girl, akiyama rinko, blue hair, katana',
              'centers': [
                {'x': 0.5, 'y': 0.5}
              ]
            }
          ]
        },
        'use_coords': false,
        'use_order': true,
      },
      'v4_negative_prompt': {
        'caption': {
          'base_caption': 'lowres, bad anatomy',
          'char_captions': [
            {
              'char_caption': 'casual wear, short hair, smiling',
              'centers': [
                {'x': 0.5, 'y': 0.5}
              ]
            }
          ]
        },
        'use_coords': false,
      },
    });
    final report = inspectImageMetadata({
      'Software': 'NovelAI',
      'Source': 'NovelAI Diffusion V4.5 4BDE2A90',
      'Description': 'fallback description',
      'Comment': comment,
    });
    expect(report.imported.model, 'nai-diffusion-4-5-full');
    expect(report.imported.positivePrompt, 'best quality, forest');
    expect(report.imported.negativePrompt, 'lowres, bad anatomy');
    expect(report.imported.stylePrompt, '');
    expect(report.imported.qualityToggle, isFalse);
    expect(report.imported.ucPreset, 3);
    expect(report.imported.variety, isFalse);
    expect(report.characterCaptions, hasLength(1));
    expect(report.characterCaptions.single.prompt,
        'girl, akiyama rinko, blue hair, katana');
    expect(report.characterCaptions.single.negativePrompt,
        'casual wear, short hair, smiling');
  });

  test('applies only the globally selected compatible metadata fields', () {
    const imported = ImportedGenerateParams(
      positivePrompt: 'selected prompt',
      negativePrompt: 'should stay unchanged',
      steps: 31,
      seed: 99,
    );
    final selected = imported.selecting({'positivePrompt', 'steps'});
    final target = GenerateParams()
      ..negativePrompt = 'locked value'
      ..seed = 7;
    selected.applyTo(target);

    expect(target.positivePrompt, 'selected prompt');
    expect(target.steps, 31);
    expect(target.negativePrompt, 'locked value');
    expect(target.seed, 7);
    expect(selected.compatibleValuesByKey.keys,
        containsAll(<String>['positivePrompt', 'steps']));
  });

  test('strips textual PNG metadata without changing non-PNG input', () {
    final bytes = _makePng({
      'Description': 'private prompt',
      'Comment': '{"seed":123}',
    });
    final stripped = stripPngMetadata(bytes);

    expect(parsePngTextMetadata(stripped), isEmpty);
    expect(stripped.sublist(0, 8), bytes.sublist(0, 8));
    final plain = Uint8List.fromList([1, 2, 3]);
    expect(identical(stripPngMetadata(plain), plain), isTrue);
  });

  test('reads A1111 / Forge metadata and maps NovelAI-compatible values', () {
    final parameters = [
      '1girl, blue hair, city',
      'Negative prompt: lowres, bad hands',
      'Steps: 24, Sampler: Euler a, Schedule type: Karras, CFG scale: 7, Seed: 42, Size: 768x1152, Model hash: abc123, Model: animeXL_v1',
    ].join('\n');
    final report = inspectImageMetadata({'parameters': parameters});

    expect(report.kind, ImageMetadataKind.stableDiffusion);
    expect(report.imported.positivePrompt, contains('blue hair'));
    expect(report.imported.negativePrompt, 'lowres, bad hands');
    expect(report.imported.sampler, 'k_euler_ancestral');
    expect(report.imported.noiseSchedule, 'karras');
    expect(report.imported.steps, 24);
    expect(report.imported.cfgScale, 7);
    expect(report.imported.seed, 42);
    expect((report.imported.width, report.imported.height), (768, 1152));
    expect(
        report.entries.any(
            (entry) => entry.key == 'Model' && entry.value == 'animeXL_v1'),
        isTrue);
  });

  test('reads A1111 generation parameters from JPEG EXIF UserComment', () {
    final parameters = [
      '1girl, blue hair',
      'Negative prompt: lowres',
      'Steps: 24, Sampler: Euler a, CFG scale: 7, Seed: 42, Size: 768x1152',
    ].join('\n');
    final metadata = parseImageTextMetadata(_makeExifJpeg(parameters));
    expect(metadata['parameters'], contains('Sampler: Euler a'));
    expect(inspectImageMetadata(metadata).imported.seed, 42);
  });

  test('reads ComfyUI prompt and workflow metadata', () {
    final prompt = {
      '1': {
        'class_type': 'CheckpointLoaderSimple',
        'inputs': {'ckpt_name': 'sdxl.safetensors'}
      },
      '2': {
        'class_type': 'CLIPTextEncode',
        'inputs': {
          'text': '1girl, silver hair',
          'clip': ['1', 1]
        }
      },
      '3': {
        'class_type': 'CLIPTextEncode',
        'inputs': {
          'text': 'lowres',
          'clip': ['1', 1]
        }
      },
      '4': {
        'class_type': 'EmptyLatentImage',
        'inputs': {'width': 832, 'height': 1216, 'batch_size': 1}
      },
      '5': {
        'class_type': 'KSampler',
        'inputs': {
          'seed': 99,
          'steps': 28,
          'cfg': 6,
          'sampler_name': 'dpmpp_2m',
          'scheduler': 'karras',
          'denoise': 1,
          'model': ['1', 0],
          'positive': ['2', 0],
          'negative': ['3', 0],
          'latent_image': ['4', 0],
        }
      },
    };
    final report = inspectImageMetadata({
      'prompt': jsonEncode(prompt),
      'workflow': jsonEncode({
        'nodes': [
          {'id': 5, 'type': 'KSampler'}
        ]
      }),
    });

    expect(report.kind, ImageMetadataKind.comfyUi);
    expect(report.imported.positivePrompt, '1girl, silver hair');
    expect(report.imported.negativePrompt, 'lowres');
    expect(report.imported.sampler, 'k_dpmpp_2m');
    expect((report.imported.width, report.imported.height), (832, 1216));
    expect(report.rawText, contains('workflow'));
  });

  test('extracts structured values from ComfyUI workflow node arrays', () {
    final workflow = jsonEncode([
      {
        'id': 59,
        'type': 'VAELoader',
        'mode': 0,
        'widgets_values': ['qwen_vae.safetensors']
      },
      {
        'id': 60,
        'type': 'UNETLoader',
        'mode': 0,
        'widgets_values': ['anima-base.safetensors', 'default']
      },
      {
        'id': 61,
        'type': 'CLIPLoader',
        'mode': 0,
        'widgets_values': ['qwen_clip.safetensors', 'qwen_image', 'default']
      },
      {
        'id': 52,
        'type': 'CLIPTextEncode',
        'mode': 0,
        'widgets_values': ['1girl, silver hair']
      },
      {
        'id': 40,
        'type': 'EmptyLatentImage',
        'mode': 0,
        'widgets_values': [832, 1216, 1]
      },
      {
        'id': 90,
        'type': 'KSampler',
        'mode': 0,
        'widgets_values': [
          99,
          'randomize',
          20,
          5,
          'euler_ancestral',
          'simple',
          0.55
        ]
      },
      {
        'id': 48,
        'type': 'LatentUpscaleBy',
        'mode': 0,
        'widgets_values': ['nearest-exact', 1.5]
      },
    ]);
    final report = inspectImageMetadata({'workflow': workflow});
    expect(report.kind, ImageMetadataKind.comfyUi);
    expect(report.imported.steps, 20);
    expect((report.imported.width, report.imported.height), (832, 1216));
    expect(
        report.entries.any(
            (entry) => entry.key == 'VAE' && entry.value.contains('qwen_vae')),
        isTrue);
    expect(
        report.entries.any((entry) =>
            entry.key == 'CLIP model' && entry.value.contains('qwen_clip')),
        isTrue);
    expect(
        report.entries.any((entry) =>
            entry.key == 'Upscale scale' && entry.value.contains('1.5')),
        isTrue);
  });
}

Uint8List _makePng(Map<String, String> values) {
  final bytes = <int>[137, 80, 78, 71, 13, 10, 26, 10];
  void addChunk(String type, List<int> data) {
    final length = data.length;
    bytes.addAll([
      (length >> 24) & 255,
      (length >> 16) & 255,
      (length >> 8) & 255,
      length & 255,
      ...ascii.encode(type),
      ...data,
      0,
      0,
      0,
      0,
    ]);
  }

  for (final entry in values.entries) {
    addChunk(
        'tEXt', [...utf8.encode(entry.key), 0, ...utf8.encode(entry.value)]);
  }
  addChunk('IEND', const []);
  return Uint8List.fromList(bytes);
}

Uint8List _makeExifJpeg(String parameters) {
  final comment = <int>[
    ...ascii.encode('ASCII\u0000\u0000\u0000'),
    ...utf8.encode(parameters),
    0,
  ];
  final tiff = Uint8List(44 + comment.length);
  final view = ByteData.sublistView(tiff);
  tiff.setRange(0, 2, [0x4d, 0x4d]);
  view.setUint16(2, 42, Endian.big);
  view.setUint32(4, 8, Endian.big);
  view.setUint16(8, 1, Endian.big);
  view.setUint16(10, 0x8769, Endian.big);
  view.setUint16(12, 4, Endian.big);
  view.setUint32(14, 1, Endian.big);
  view.setUint32(18, 26, Endian.big);
  view.setUint32(22, 0, Endian.big);
  view.setUint16(26, 1, Endian.big);
  view.setUint16(28, 0x9286, Endian.big);
  view.setUint16(30, 7, Endian.big);
  view.setUint32(32, comment.length, Endian.big);
  view.setUint32(36, 44, Endian.big);
  view.setUint32(40, 0, Endian.big);
  tiff.setRange(44, 44 + comment.length, comment);
  final payload = <int>[...ascii.encode('Exif\u0000\u0000'), ...tiff];
  final length = payload.length + 2;
  return Uint8List.fromList([
    0xff,
    0xd8,
    0xff,
    0xe1,
    (length >> 8) & 255,
    length & 255,
    ...payload,
    0xff,
    0xd9,
  ]);
}
