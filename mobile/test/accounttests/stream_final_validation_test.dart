import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/services/nai_stream.dart';

void main() {
  for (final name in ['novelai-stream-final-fixture.json', 'novelai-stream-final-additional-fixture.json']) {
    final fixture = jsonDecode(File('test/accounttests/fixtures/$name').readAsStringSync()) as Map;
    final allowed = fixture['allowedPreviewImages'] as List? ??
        (fixture['cases'] as List).expand((row) => row['expectedImages'] as List).toList();
    for (final row in fixture['cases'] as List) {
      test('NovelAI stream validates final image: ${row['id']}', () async {
        final body = base64Decode(row['body'] as String);
        Stream<List<int>> chunks() async* {
          for (var i = 0; i < body.length; i += 17) {
            yield body.sublist(i, (i + 17).clamp(0, body.length));
          }
        }
        final previews = <NaiGenerationPreview>[];
        Object? error;
        var images = <List<int>>[];
        try {
          images = (await consumeNaiGenerationStream(chunks(), totalSteps: 10,
              onPreview: previews.add, contentType: row['contentType'] as String? ?? 'text/event-stream')).images;
        } catch (caught) {
          error = caught;
        }
        expect(images.map(base64Encode).toList(), row['expectedImages']);
        expect(images.length, row['expectedCount']);
        expect(error != null, row['expectedCount'] == 0);
        expect(previews.where((p) => p.finalImage).length, row['expectedCount']);
        expect(previews.every((p) => allowed.contains(base64Encode(p.image))), true);
      });
    }
  }
}
