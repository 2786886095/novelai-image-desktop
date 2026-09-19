import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/vibe_file.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main() {
  const model = 'nai-diffusion-4-5-full';
  Map<String, dynamic> entry() => {
        'identifier': 'novelai-vibe-transfer',
        'version': 1,
        'type': 'encoding',
        'encodings': {
          'v4-5full': {
            'unknown': {'encoding': 'AQIDBA=='}
          }
        },
        'importInfo': {
          'model': model,
          'information_extracted': .7,
          'strength': .31
        }
      };
  test('encoding-only import, copies and export retain model and extraction',
      () {
    final refs = parseVibeFile(jsonEncode(entry()));
    expect(refs.single.base64, '');
    expect(refs.single.infoExtracted, .7);
    expect(refs.single.strength, .31);
    expect(refs.single.matchingEncoding(model), 'AQIDBA==');
    expect(
        GenerateExtras(vibeImages: refs)
            .copy()
            .vibeImages
            .single
            .matchingEncoding(model),
        'AQIDBA==');
    expect(
        VibeTransferItem.fromJson(refs.single.copyWith(strength: .4).toJson())
            .matchingEncoding(model),
        'AQIDBA==');
    expect(parseVibeFile(exportVibeFile(refs)).single.toJson(),
        refs.single.toJson());
    expect(() => refs.single.validateModel('nai-diffusion-4-5-curated'),
        throwsStateError);
  });
  test('builds payload with imported encoding and no paid network request',
      () async {
    final api = NaiApi(),
        extras = GenerateExtras(vibeImages: parseVibeFile(jsonEncode(entry())));
    expect(api.countCachedVibes(model, extras), 1);
    final result = await api.buildPayload(
        'unused',
        AppSettings(proxyMode: 'direct'),
        GenerateParams(model: model),
        123,
        extras);
    final p = result['parameters'] as Map;
    expect(p['reference_image_multiple'], ['AQIDBA==']);
    expect(p['reference_strength_multiple'], [.31]);
  });
  test('invalid bundles fail before changing state', () {
    for (final v in [
      {},
      {...entry(), 'version': 2},
      {...entry(), 'encodings': {}},
      {
        ...entry(),
        'importInfo': {'information_extracted': 2}
      },
      {'identifier': 'novelai-vibe-transfer-bundle', 'version': 1, 'vibes': []}
    ]) {
      expect(() => parseVibeFile(jsonEncode(v)), throwsFormatException);
    }
  });
  test('provided bundle uses both encodings verbatim', () async {
    final path = Platform.environment['VIBE_FIXTURE'];
    if (path == null) return;
    final refs = parseVibeFile(await File(path).readAsString());
    expect(refs.length, 2);
    expect(refs.map((v) => v.strength), [.31, .24]);
    expect(refs.map((v) => v.infoExtracted), [.7, .44]);
    final p = await NaiApi().buildPayload(
        'unused',
        AppSettings(proxyMode: 'direct'),
        GenerateParams(model: model),
        123,
        GenerateExtras(vibeImages: refs));
    expect((p['parameters'] as Map)['reference_image_multiple'],
        refs.map((r) => r.matchingEncoding(model)).toList());
  });
}
