import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';

const randomTags = ['tag_a', 'tag_b', 'tag_c'];
const modes = {'tag_a': 'random', 'tag_b': 'random', 'tag_c': 'random'};

List<ArtistRecipe> recipes(String kind,
    {int minimum = 1,
    int maximum = 3,
    String pool = 'always_tag, tag_a, tag_b, tag_c',
    Map<String, String> tagModes = modes,
    int seed = 42}) {
  if (kind == 'weight tuning') {
    return randomizeArtistWeights(
        artistPrompt: '1::artist:fixture ::',
        count: 40,
        drawSeed: seed,
        customTagPool: pool,
        customTagModes: tagModes,
        minRandomCustomTags: minimum,
        maxRandomCustomTags: maximum);
  }
  return drawArtistRecipes(
      pool: List.generate(30, (i) => ArtistTagRecord(i, 'fixture_$i', 100)),
      count: 40,
      minArtists: 1,
      maxArtists: 3,
      drawSeed: seed,
      customTagPool: pool,
      customTagModes: tagModes,
      minRandomCustomTags: minimum,
      maxRandomCustomTags: maximum);
}

List<String> selected(ArtistRecipe recipe) => randomTags
    .where((tag) => recipe.prompt.toLowerCase().contains('::$tag ::'))
    .toList();

void main() {
  test('desktop editor semantics preserve zero and bound finite drafts', () {
    expect(normalizeRandomCustomTagCount('0'), 0);
    expect(normalizeRandomCustomTagCount(''), 0);
    expect(normalizeRandomCustomTagCount('  2.9  '), 2);
    expect(normalizeRandomCustomTagCount(-4), 0);
    expect(normalizeRandomCustomTagCount(99), 20);
    expect(normalizeRandomCustomTagCount(8, availableCount: 3), 3);
    expect(normalizeRandomCustomTagCount(8, availableCount: 0), 0);
    for (final invalid in [null, 'invalid', double.nan, double.infinity]) {
      expect(normalizeRandomCustomTagCount(invalid), 1);
      expect(normalizeRandomCustomTagCount(invalid, fallback: 3), 3);
    }
  });

  test('execution swaps bounds and clamps to its actual distinct pool', () {
    expect(randomCustomTagCountBounds(3, 1, 5), (min: 1, max: 3));
    expect(randomCustomTagCountBounds(0, 0, 5), (min: 0, max: 0));
    expect(randomCustomTagCountBounds(-2, 100, 3), (min: 0, max: 3));
    expect(randomCustomTagCountBounds(1, 3, 0), (min: 0, max: 0));
    // Old imported recipe counts are not silently limited by the UI's cap20.
    expect(randomCustomTagCountBounds(25, 25, 30), (min: 25, max: 25));
  });

  for (final kind in ['draw', 'weight tuning']) {
    test('$kind: zero random tags keeps always-included tags', () {
      final output = recipes(kind, minimum: 0, maximum: 0);
      expect(output, isNotEmpty);
      expect(output.every((item) => selected(item).isEmpty), isTrue);
      expect(output.every((item) => item.prompt.contains('::always_tag ::')),
          isTrue);
    });

    test('$kind: exact count chooses distinct tags after pool deduplication',
        () {
      final output = recipes(kind,
          minimum: 2,
          maximum: 2,
          pool: 'always_tag, 1::tag_a ::, TAG_A, tag_b, tag_c, tag_b');
      expect(output, isNotEmpty);
      expect(output.every((item) => selected(item).length == 2), isTrue);
      expect(output.every((item) => item.prompt.contains('::always_tag ::')),
          isTrue);
      for (final item in output) {
        for (final tag in randomTags) {
          expect(
              RegExp('::$tag ::').allMatches(item.prompt.toLowerCase()).length,
              lessThanOrEqualTo(1));
        }
      }
    });

    test('$kind: reversed range is inclusive and cannot exceed available tags',
        () {
      final output = recipes(kind, minimum: 3, maximum: 1);
      final counts = output.map((item) => selected(item).length).toSet();
      expect(counts, containsAll([1, 2, 3]));
      expect(counts.every((value) => value >= 1 && value <= 3), isTrue);
      expect(
          recipes(kind, minimum: 100, maximum: 50)
              .every((item) => selected(item).length == 3),
          isTrue);
    });

    test('$kind: empty pool and stale modes add no phantom tags', () {
      final empty = recipes(kind, minimum: 1, maximum: 3, pool: ' ,\n ');
      expect(empty, isNotEmpty);
      expect(empty.every((item) => selected(item).isEmpty), isTrue);
      final always = recipes(kind,
          minimum: -2, maximum: -1, pool: 'always_tag', tagModes: modes);
      expect(always.every((item) => selected(item).isEmpty), isTrue);
      expect(always.every((item) => item.prompt.contains('::always_tag ::')),
          isTrue);
    });

    test('$kind: selection remains repeatable for a fixed recipe seed', () {
      final first = recipes(kind, minimum: 0, maximum: 2);
      final second = recipes(kind, minimum: 0, maximum: 2);
      expect(first.map((item) => item.prompt).toList(),
          second.map((item) => item.prompt).toList());
    });
  }
}
