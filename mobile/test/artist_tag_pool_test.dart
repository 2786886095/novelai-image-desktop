import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/artist/curated_artists.dart';
import 'package:novelai_mobile/services/artist_tag_service.dart';

void main() {
  test('curated artist candidates are unique and established', () {
    expect(kCuratedArtistTags.length, 33);
    expect(kCuratedArtistTags.map((item) => item.name).toSet().length, 33);
    expect(kCuratedArtistTags.every((item) => !item.deprecated), isTrue);
    expect(kCuratedArtistTags.every((item) => item.postCount >= 200), isTrue);
  });

  test('merge removes duplicates and excludes no curated item', () {
    final merged = mergeCuratedArtistTags([
      const ArtistTagRecord(1, 'beijuu', 1000),
      const ArtistTagRecord(1452150, 'BEIJUU', 900),
      const ArtistTagRecord(2, 'channel_(_caststation)', 300),
      const ArtistTagRecord(3, 'channel_(caststation)', 300),
      const ArtistTagRecord(4, 'deprecated_artist', 1000, deprecated: true),
    ]);
    expect(merged.where((item) => item.name == 'beijuu').length, 1);
    expect(
        merged.where((item) => item.name == 'channel_(caststation)').length, 1);
    expect(merged.any((item) => item.name == 'deprecated_artist'), isFalse);
    expect(merged.map((item) => item.name).toSet().length, merged.length);
  });

  test('normalizes known aliases in copied artist prompts', () {
    expect(canonicalArtistTagName(' Channel_(_Caststation) '),
        'channel_(caststation)');
    expect(canonicalArtistTagName('machi_(7769)'), 'machi_(machi0910)');
    expect(canonicalArtistTagName('Ｃｈａｎｎｅｌ＿（Ｃａｓｔｓｔａｔｉｏｎ）'),
        'channel_(caststation)');
  });

  test('reads deprecation status from Danbooru rows', () {
    final tag = ArtistTagRecord.fromJson({
      'id': 9,
      'name': 'old_artist',
      'post_count': 999,
      'is_deprecated': true,
    });
    expect(tag.deprecated, isTrue);
  });
}
