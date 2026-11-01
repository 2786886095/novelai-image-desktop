import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as image_lib;
import 'package:novelai_mobile/images/png_metadata.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';

// Issue #76: a NovelAI PNG that also carries an A1111-style `parameters` text
// chunk was classified as Stable Diffusion (no character prompts). Issue #78:
// mobile never imported or sent skip_cfg_below_sigma.
Uint8List _png(Map<String, String> text) {
  final image = image_lib.Image(width: 16, height: 16, numChannels: 4);
  final png = image_lib.encodePng(image);
  final ihdrEnd = 8 + 12 + ByteData.sublistView(png).getUint32(8);
  final out = BytesBuilder()..add(png.sublist(0, ihdrEnd));
  for (final entry in text.entries) {
    final data = [...latin1.encode(entry.key), 0, ...utf8.encode(entry.value)];
    final chunk = BytesBuilder()
      ..add((ByteData(4)..setUint32(0, data.length)).buffer.asUint8List())
      ..add(ascii.encode('tEXt'))
      ..add(data);
    final bytes = chunk.toBytes();
    out
      ..add(bytes)
      ..add((ByteData(4)..setUint32(0, _crc(bytes.sublist(4)))).buffer.asUint8List());
  }
  out.add(png.sublist(ihdrEnd));
  return out.toBytes();
}

int _crc(List<int> bytes) {
  var c = 0xffffffff;
  for (final b in bytes) {
    c ^= b;
    for (var k = 0; k < 8; k++) {
      c = (c & 1) != 0 ? 0xedb88320 ^ (c >> 1) : c >> 1;
    }
  }
  return (c ^ 0xffffffff) & 0xffffffff;
}

const _sd = '2girls\nNegative prompt: lowres\nSteps: 28, Sampler: Euler a, CFG scale: 5.5, Seed: 1234567890, Size: 832x1216';

Map<String, String> _novelAi({num? skip, bool sd = false}) => {
      'Software': 'NovelAI',
      'Source': 'NovelAI Diffusion V4.5 4BDE2A90',
      'Description': '2girls',
      'Comment': jsonEncode({
        'prompt': '2girls', 'uc': 'lowres', 'steps': 28, 'scale': 5.5, 'seed': 1234567890,
        'sampler': 'k_euler_ancestral', 'width': 832, 'height': 1216,
        'v4_prompt': {
          'caption': {'base_caption': '2girls', 'char_captions': [
            {'char_caption': 'girl, red hair', 'centers': [{'x': 0.3, 'y': 0.5}]},
            {'char_caption': 'girl, glasses', 'centers': [{'x': 0.7, 'y': 0.5}]},
          ]},
          'use_coords': true,
        },
        'v4_negative_prompt': {
          'caption': {'base_caption': 'lowres', 'char_captions': [
            {'char_caption': 'bad hands', 'centers': [{'x': 0.3, 'y': 0.5}]},
            {'char_caption': '', 'centers': [{'x': 0.7, 'y': 0.5}]},
          ]},
        },
        if (skip != null) 'skip_cfg_below_sigma': skip,
      }),
      if (sd) 'parameters': _sd,
    };

Future<Map<String, dynamic>> _payload(GenerateParams params, [List<CharCaptionItem> chars = const []]) async =>
    (await NaiApi().buildPayload('unused', AppSettings(proxyMode: 'direct'), params, 1, GenerateExtras(charCaptions: chars)))['parameters']
        as Map<String, dynamic>;

void main() {
  group('issue #76', () {
    test('NovelAI PNG with a coexisting SD parameters chunk stays NovelAI with characters', () {
      final report = inspectImageMetadata(parseImageTextMetadata(_png(_novelAi(skip: 0, sd: true))));
      expect(report.kind, ImageMetadataKind.novelAi);
      expect(report.characterCaptions.map((c) => [c.prompt, c.negativePrompt, c.x, c.y]).toList(), [
        ['girl, red hair', 'bad hands', 0.3, 0.5],
        ['girl, glasses', '', 0.7, 0.5],
      ]);
      expect(report.entries.where((e) => e.key == 'parameters' && e.value == _sd && e.group == 'raw'), hasLength(1));
      expect(report.rawMetadata['parameters'], _sd);
    });
    test('a genuine SD WebUI image is still Stable Diffusion', () {
      final report = inspectImageMetadata(parseImageTextMetadata(_png({'parameters': _sd})));
      expect(report.kind, ImageMetadataKind.stableDiffusion);
      expect(report.imported.steps, 28);
    });
  });

  group('issue #78 skip_cfg_below_sigma', () {
    for (final skip in <num?>[null, 0, 1.5]) {
      test('import -> persisted params -> payload (skip=${skip ?? 'absent'})', () async {
        final report = inspectImageMetadata(parseImageTextMetadata(_png(_novelAi(skip: skip, sd: true))));
        expect(report.imported.skipCfgBelowSigma, skip);
        if (skip != null) expect(report.imported.compatibleValuesByKey['skipCfgBelowSigma'], skip);
        var params = GenerateParams();
        report.imported.applyTo(params);
        // Persistence round trip (SharedPreferences stores this JSON).
        params = GenerateParams.fromJson(jsonDecode(jsonEncode(params.normalized().toJson())) as Map<String, dynamic>);
        final parameters = await _payload(params);
        if (skip == null) {
          expect(parameters.containsKey('skip_cfg_below_sigma'), isFalse);
        } else {
          expect(parameters['skip_cfg_below_sigma'], skip);
        }
      });
    }
    test('replay is bound to the imported model and full effort', () async {
      final report = inspectImageMetadata(parseImageTextMetadata(_png(_novelAi(skip: 2))));
      final params = GenerateParams();
      report.imported.applyTo(params);
      params.model = 'nai-diffusion-4-full';
      expect((await _payload(params)).containsKey('skip_cfg_below_sigma'), isFalse);
      final medium = GenerateParams(model: 'nai-diffusion-5-full', effort: 'medium',
          metadataReplay: {'model': 'nai-diffusion-5-full', 'parameters': {'skip_cfg_below_sigma': 2}});
      expect((await _payload(medium)).containsKey('skip_cfg_below_sigma'), isFalse);
      final full = GenerateParams(model: 'nai-diffusion-5-full',
          metadataReplay: {'model': 'nai-diffusion-5-full', 'parameters': {'skip_cfg_below_sigma': 2}});
      expect((await _payload(full))['skip_cfg_below_sigma'], 2);
    });
    test('out-of-range or non-numeric values are dropped, never clamped or defaulted', () {
      expect(normalizeMetadataReplay({'model': 'nai-diffusion-4-5-full', 'parameters': {'skip_cfg_below_sigma': -1}})?['parameters'], isEmpty);
      expect(normalizeMetadataReplay({'model': 'nai-diffusion-4-5-full', 'parameters': {'skip_cfg_below_sigma': '1'}})?['parameters'], isEmpty);
      expect(normalizeMetadataReplay({'model': 'bad model', 'parameters': {'skip_cfg_below_sigma': 1}}), isNull);
    });
    test('selective import excludes the value unless chosen', () {
      final imported = inspectImageMetadata(parseImageTextMetadata(_png(_novelAi(skip: 0)))).imported;
      expect(imported.selecting({'steps'}).metadataReplay, isNull);
      expect(imported.selecting({'skipCfgBelowSigma'}).skipCfgBelowSigma, 0);
    });
  });
}
