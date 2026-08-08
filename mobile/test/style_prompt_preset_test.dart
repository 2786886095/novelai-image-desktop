import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';

void main() {
  test('style prompt preset persists at most three preview images', () {
    final preset = StylePromptPreset.fromJson({
      'id': 'style-1',
      'name': 'Blue night',
      'prompt': 'blue theme, moonlight',
      'createdAt': '2026-08-08T00:00:00Z',
      'previewImages': List.generate(
        5,
        (index) => {
          'id': 'image-$index',
          'name': '$index.png',
          'filePath': '/persistent/$index.png',
          'createdAt': '2026-08-08T00:00:00Z',
        },
      ),
    });

    expect(preset.previewImages, hasLength(3));
    expect(preset.toJson()['previewImages'], hasLength(3));
  });

  test('legacy style prompt preset loads with an empty image collection', () {
    final preset = StylePromptPreset.fromJson({
      'id': 'legacy',
      'name': 'Legacy',
      'prompt': 'watercolor',
      'createdAt': '',
    });
    expect(preset.previewImages, isEmpty);
  });
}
