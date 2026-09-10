import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/custom_artist_pool.dart';

void main() {
  test(
      'custom pool parses wrapped artist tags and preserves names',
      () => expect(
          parseCustomArtistPool(
                  '{artist:One},{artist:Two}\nartist:one，foo (bar)')
              .map((a) => a.name)
              .toList(),
          ['one', 'two', 'foo_(bar)']));
  test('empty and invalid custom pools do not fall back to ranked artists', () {
    expect(parseCustomArtistPool(' ,\n'), isEmpty);
    expect(parseCustomArtistPool('https://example.com,{{broken}tag}'), isEmpty);
  });
}
