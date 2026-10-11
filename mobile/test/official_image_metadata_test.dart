import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/png_metadata.dart';

void main() {
  final root = Directory('../shared/official-image-metadata-fixtures');
  final fixtures = jsonDecode(File('${root.path}/manifest.json').readAsStringSync()) as List;
  for (final fixture in fixtures) {
    test('official metadata: ${fixture['name']}', () {
      final bytes = File('${root.path}/${fixture['name']}').readAsBytesSync();
      final before = Uint8List.fromList(bytes);
      final metadata = parseImageTextMetadata(bytes);
      final imported = parseImportedGenerateParams(metadata);
      final actual = <String, Object?>{
        'positivePrompt': imported.positivePrompt,
        'negativePrompt': imported.negativePrompt,
        'seed': imported.seed,
        'steps': imported.steps,
        'model': imported.model,
        'characters': parseNovelAiCharacterCaptions(metadata).length,
      };
      final expected = fixture['expected'] as Map;
      for (final entry in expected.entries) {
        expect(actual[entry.key], entry.value, reason: '${fixture['name']}: ${entry.key}');
      }
      expect(bytes, orderedEquals(before));
    });
  }
  test('oversized PNG pixels are not allocated', () {
    final bytes = File('${root.path}/rgba-16-plain.png').readAsBytesSync();
    ByteData.sublistView(bytes).setUint32(16, 16 * 1024 * 1024, Endian.big);
    expect(parseImportedGenerateParams(parseImageTextMetadata(bytes)).positivePrompt, isNull);
  });
  test('truncated WebP metadata does not throw', () {
    final bytes = File('${root.path}/webp-lossless-alpha.webp').readAsBytesSync();
    expect(() => parseImageTextMetadata(Uint8List.sublistView(bytes, 0, 36)), returnsNormally);
    expect(parseImageTextMetadata(Uint8List(8)), isEmpty);
  });
}
