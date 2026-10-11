import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/images/png_metadata.dart';

void main() {
  final root = '${Directory.current.parent.path}/shared/image-metadata-compat-fixtures';
  final fixtures = jsonDecode(File('$root/manifest.json').readAsStringSync()) as List;
  for (final fixture in fixtures) {
    test('shared metadata fixture ${fixture['name']}', () {
      final bytes = File('$root/${fixture['name']}').readAsBytesSync();
      final original = List<int>.from(bytes);
      final metadata = parseImageTextMetadata(bytes);
      final imported = parseImportedGenerateParams(metadata);
      final actual = <String, dynamic>{
        if (imported.positivePrompt != null) 'positivePrompt': imported.positivePrompt,
        if (imported.negativePrompt != null) 'negativePrompt': imported.negativePrompt,
        if (imported.seed != null) 'seed': imported.seed,
        if (imported.steps != null) 'steps': imported.steps,
        if (imported.model != null) 'model': imported.model,
        'characters': parseNovelAiCharacterCaptions(metadata).length,
      };
      final expected = fixture['expected'] as Map;
      for (final field in expected.entries) {
        expect(actual[field.key], field.value, reason: field.key);
      }
      if (expected.isEmpty) expect(actual.keys.where((key) => key != 'characters'), isEmpty);
      expect(bytes, original);
    });
  }
}
