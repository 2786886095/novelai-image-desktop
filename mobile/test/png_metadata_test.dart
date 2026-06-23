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
