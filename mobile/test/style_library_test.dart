import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/models/style_library.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

StylePromptPreset p(String id,
        {double rating = 0, int uses = 0, String date = '2026-09-01'}) =>
    StylePromptPreset(
        id: id,
        name: id,
        prompt: 'artist:$id',
        createdAt: date,
        rating: rating,
        usageCount: uses);
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('old presets, free decimal rating, persistence', () {
    final old = StylePromptPreset.fromJson(
        {'id': 'a', 'name': 'a', 'prompt': 'artist:a', 'createdAt': ''});
    expect(old.rating, 0);
    expect(old.usageCount, 0);
    expect(old.sortOrder, 9007199254740991);
    final value = StylePromptPreset.fromJson(
        {...old.toJson(), 'rating': 4.26, 'usageCount': 3.9, 'sortOrder': 2});
    expect(value.rating, 4.26);
    expect(value.usageCount, 3);
    expect(StylePromptPreset.fromJson(value.toJson()).sortOrder, 2);
    expect(
        StylePromptPreset.fromJson({...old.toJson(), 'rating': 99}).rating, 5);
  });
  test('cover persistence, legacy fallback, removed cover and empty list', () {
    final value = p('a');
    value.previewImages = List.generate(3, (i) => StylePromptPreviewImage(id: 'im$i', name: '$i', filePath: '/$i', createdAt: ''));
    expect(value.coverIndex, 0);
    value.coverImageId = 'im2';
    final restored = StylePromptPreset.fromJson(value.toJson());
    expect(restored.coverImageId, 'im2');
    expect(restored.coverIndex, 2);
    expect(restored.previewImages.map((im) => im.id).join(','), 'im0,im1,im2');
    restored.previewImages.removeAt(2);
    expect(restored.coverIndex, 0);
    expect(StylePromptPreset.fromJson(restored.toJson()).coverImageId, 'im0');
    restored.previewImages.clear();
    expect(restored.coverIndex, -1);
    expect(restored.toJson()['coverImageId'], isNull);
  });
  test('all sorting modes and stable ties', () {
    final items = [
      p('b', rating: 1, uses: 2),
      p('a', rating: 5, date: '2026-09-03'),
      p('c', rating: 1, uses: 3, date: '2026-09-02')
    ];
    final expected = {
      'default': 'bac',
      'custom': 'bac',
      'rating-desc': 'abc',
      'rating-asc': 'bca',
      'uses-desc': 'cba',
      'uses-asc': 'abc',
      'created-desc': 'acb',
      'created-asc': 'bca',
      'name': 'abc'
    };
    for (final mode in styleSorts) {
      expect(sortStyles(items, mode).map((p) => p.id).join(), expected[mode],
          reason: mode);
    }
    expect(items.map((p) => p.id).join(), 'bac');
  });
  test('custom order preserves default sequence', () {
    final items = ['a', 'b', 'c'].map(p).toList();
    moveStyle(items, 'a', 'c');
    expect(sortStyles(items, 'custom').map((p) => p.id).join(), 'bca');
    expect(items.map((p) => p.id).join(), 'abc');
    moveStyle(items, 'a', 'b');
    expect(sortStyles(items, 'custom').map((p) => p.id).join(), 'abc');
  });
  test('batch prompt and image matching', () {
    final rows =
        parseStyleLines('\uFEFF1.2::artist:a::\r\n\nDream\t0.8::artist:b::');
    expect(rows.length, 2);
    expect(rows[1], (name: 'Dream', prompt: '0.8::artist:b::'));
    expect(
        matchStyleImages(
            ['10.png', '2.png', 'Dream.jpg'], ['dream', 'missing'], 'name'),
        [
          ['Dream.jpg'],
          []
        ]);
    expect(matchStyleImages(['10.png', '2.png'], ['a', 'b'], 'order'), [
      ['2.png'],
      ['10.png']
    ]);
    expect(() => matchStyleImages(['a.png', 'a.png'], ['a'], 'name'),
        throwsFormatException);
  });
  test('queued updates preserve both rating and usage, persist after reload',
      () async {
    SharedPreferences.setMockInitialValues({});
    final app = AppState();
    try {
      app.settings.stylePromptPresets = [p('a')];
      await Future.wait([
        app.updateStyleLibrary((s) => s.stylePromptPresets[0].rating = 4.5),
        app.updateStyleLibrary((s) => s.stylePromptPresets[0].usageCount++)
      ]);
      expect(app.settings.stylePromptPresets.single.rating, 4.5);
      expect(app.settings.stylePromptPresets.single.usageCount, 1);
      final saved = await app.storage.getSettings();
      expect(saved.stylePromptPresets.single.rating, 4.5);
      expect(saved.stylePromptPresets.single.usageCount, 1);
    } finally {
      app.dispose();
    }
  });
}
