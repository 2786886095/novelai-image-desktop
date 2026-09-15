import 'dart:io';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:novelai_mobile/services/tags_gallery.dart';

void main() {
  final fixture =
      jsonDecode(File('../shared/tags-gallery-fixture.json').readAsStringSync())
          as Map<String, dynamic>;
  test(
      'shared desktop/mobile fixture preserves labels, dimensions and missing samples',
      () {
    final p = parseTagsGalleryPage(fixture['listing'], 'hair');
    expect(p.total, 2);
    expect(p.items.length, 2);
    expect(p.items.first.prompt, 'blue & white');
    expect(p.items.first.cover.width, 480);
    expect(p.items.first.cover.previewUrl,
        'https://tags.gallery/images/thumbs/blue.webp');
    expect(p.items.last.mediaCount, 0);
    expect(p.items.last.cover.downloadUrl, '');
    final d = parseTagsGalleryDetail(fixture['detail'], 'hair/blue_hair');
    expect(d.prompt, 'blue & white, solo');
    expect(d.item.prompt, 'blue & white');
    expect(d.media.length, 1);
  });
  test('empty and malformed responses are distinct', () {
    expect(parseTagsGalleryPage(fixture['empty'], 'hair').items, isEmpty);
    expect(() => parseTagsGalleryPage('<html>captcha</html>', 'hair'),
        throwsFormatException);
    expect(
        () => tagsGalleryDetailUrl('hair/../../secret'), throwsFormatException);
  });
  test(
      'pagination crosses upstream boundaries and reuses successful cached pages',
      () async {
    var calls = 0;
    String html(int start, int count) =>
        '<main>hits=152${List.generate(count, (i) => '<a aria-label="Open detail: tag ${start + i}" href="/hair/tag_${start + i}"></a>').join()}</main>';
    final httpClient = MockClient((r) async {
      calls++;
      return http.Response(
          r.url.queryParameters['p'] == '2' ? html(100, 52) : html(0, 100),
          200);
    });
    addTearDown(httpClient.close);
    final client = TagsGalleryClient(httpClient);
    final p = await client.search('hair', 9, 12, '');
    expect(p.items.map((i) => i.id),
        List.generate(12, (i) => 'hair/tag_${96 + i}'));
    expect(p.total, 152);
    expect(p.hasMore, isTrue);
    expect(calls, 2);
    await client.search('hair', 10, 12, '');
    expect(calls, 2);
    client.clear();
    await client.search('hair', 10, 12, '');
    expect(calls, 3);
  });
  test('failed responses are not cached and retry can recover', () async {
    var calls = 0;
    final h = MockClient((r) async => http.Response(
        calls++ == 0 ? 'error' : fixture['empty'], calls == 1 ? 503 : 200));
    addTearDown(h.close);
    final c = TagsGalleryClient(h);
    await expectLater(
        c.search('hair', 1, 12, ''), throwsA(isA<http.ClientException>()));
    expect((await c.search('hair', 1, 12, '')).total, 0);
  });
  test('all languages expose nine categories', () {
    for (final l in ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      expect(tagsGalleryLabels(l).length, 9);
    }
    expect(tagsGalleryCategories.length, 9);
  });
}
