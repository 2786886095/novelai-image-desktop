import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';

void main() {
  test('draws more than one hundred unique weighted strings', () {
    final pool = List.generate(
      80,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 10000 - index),
    );
    final recipes = drawArtistRecipes(
      pool: pool,
      count: 137,
      minArtists: 4,
      maxArtists: 10,
      drawSeed: 42,
    );
    expect(recipes.length, 137);
    expect(recipes.map((item) => item.prompt).toSet().length, 137);
  });

  test('different draw seeds change the batch', () {
    final pool = List.generate(
      30,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    final first = drawArtistRecipes(
        pool: pool, count: 8, minArtists: 3, maxArtists: 6, drawSeed: 1);
    final second = drawArtistRecipes(
        pool: pool, count: 8, minArtists: 3, maxArtists: 6, drawSeed: 2);
    expect(first.map((item) => item.prompt).toList(),
        isNot(second.map((item) => item.prompt).toList()));
  });

  test('qualified Danbooru names and artist prefixes are normalized uniformly',
      () {
    final recipes = drawArtistRecipes(
      pool: const [
        ArtistTagRecord(1, 'gochisousama (tanin050)', 200),
        ArtistTagRecord(2, 'asanagi', 100),
      ],
      count: 1,
      minArtists: 2,
      maxArtists: 2,
      drawSeed: 7,
    );
    expect(canonicalArtistTagName('gochisousama (tanin050)'),
        'gochisousama_(tanin050)');
    expect(recipes.single.artistPrompt,
        contains('artist:gochisousama_(tanin050)'));
    expect(recipes.single.artistPrompt, contains('artist:asanagi'));
  });

  test('defaults to three-to-seven artists and configurable .3-to-2 weights',
      () {
    final pool = List.generate(
      30,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    final recipes = drawArtistRecipes(
      pool: pool,
      count: 30,
      drawSeed: 23,
      minArtistWeight: 2,
      maxArtistWeight: .3,
    );
    expect(
        recipes.every(
            (item) => item.artists.length >= 3 && item.artists.length <= 7),
        isTrue);
    final weights = recipes.expand((item) => RegExp(r'(\d+(?:\.\d+)?)::artist:')
        .allMatches(item.artistPrompt)
        .map((match) => double.parse(match.group(1)!)));
    expect(weights.every((weight) => weight >= .3 && weight <= 2), isTrue);
  });

  test('optional franchise tags are distinct, bounded, and survive A-B', () {
    final pool = List.generate(
      30,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    final recipes = drawArtistRecipes(
      pool: pool,
      count: 30,
      drawSeed: 39,
      includeFranchiseStyles: true,
      minFranchiseStyles: 0,
      maxFranchiseStyles: 2,
      minFranchiseWeight: 1.5,
      maxFranchiseWeight: .5,
      mutateAuxiliary: true,
    );
    expect(recipes.any((item) => item.franchiseStyles.isNotEmpty), isTrue);
    expect(recipes.every((item) => item.franchiseStyles.length <= 2), isTrue);
    expect(
        recipes.every((item) =>
            item.franchiseStyles.map((tag) => tag.value).toSet().length ==
            item.franchiseStyles.length),
        isTrue);
    expect(
        recipes
            .expand((item) => item.franchiseStyles)
            .every((tag) => tag.weight >= .5 && tag.weight <= 1.5),
        isTrue);
    final pair = expandArtistRecipeComparisons([recipes.first], true);
    expect(pair.first.franchiseStyles, pair.last.franchiseStyles);
  });

  test('seed planning shares random seeds within A-B pairs', () {
    final randomSeeds = artistGenerationSeeds(
      groupCount: 3,
      variantsPerGroup: 2,
      fixed: false,
      fixedSeed: 123,
      entropySeed: 99,
    );
    expect(randomSeeds, hasLength(6));
    expect(randomSeeds[0], randomSeeds[1]);
    expect(randomSeeds[2], randomSeeds[3]);
    expect(randomSeeds[4], randomSeeds[5]);
    expect({randomSeeds[0], randomSeeds[2], randomSeeds[4]}, hasLength(3));
    expect(
      artistGenerationSeeds(
        groupCount: 2,
        variantsPerGroup: 2,
        fixed: true,
        fixedSeed: 456,
        entropySeed: 1,
      ),
      [456, 456, 456, 456],
    );
  });

  test('style mutation adds two to six labelled weighted terms', () {
    final pool = List.generate(
      30,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    final recipes = drawArtistRecipes(
      pool: pool,
      count: 12,
      minArtists: 4,
      maxArtists: 8,
      drawSeed: 88,
      auxiliary: 'year 2025, masterpiece',
      mutateAuxiliary: true,
    );
    expect(
        recipes.every(
            (item) => item.mutations.length >= 2 && item.mutations.length <= 6),
        isTrue);
    expect(
        recipes
            .expand((item) => item.mutations)
            .every((item) => item.weight >= .3 && item.weight <= 1.5),
        isTrue);
    expect(
        recipes.every((item) => item.prompt.contains('year 2025, masterpiece')),
        isTrue);
    expect(
        recipes.every((item) =>
            item.basePrompt.contains('year 2025, masterpiece') &&
            !item.basePrompt.contains(item.mutations.first.value)),
        isTrue);
  });

  test('style mode expands every artist string into a fair A-B pair', () {
    final pool = List.generate(
      30,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    final recipe = drawArtistRecipes(
      pool: pool,
      count: 1,
      minArtists: 5,
      maxArtists: 5,
      drawSeed: 18,
      auxiliary: 'year 2025',
      mutateAuxiliary: true,
    ).single;
    final pair = expandArtistRecipeComparisons([recipe], true);
    expect(pair.length, 2);
    expect(pair.map((item) => item.variant), ['plain', 'mutated']);
    expect(pair.first.pairId, pair.last.pairId);
    expect(pair.first.artists, pair.last.artists);
    expect(pair.first.prompt, recipe.basePrompt);
    expect(pair.first.mutations, isEmpty);
    expect(pair.last.prompt, recipe.prompt);
    expect(pair.last.mutations, recipe.mutations);
  });

  test('favorite style category and weight can guide later style draws', () {
    final pool = List.generate(
      30,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    const favorite = StyleMutationTerm('lighting', 'cinematic lighting', 1.4);
    final recipes = drawArtistRecipes(
      pool: pool,
      count: 40,
      minArtists: 5,
      maxArtists: 5,
      drawSeed: 91,
      mutateAuxiliary: true,
      favoriteMutations: const [favorite],
    );
    expect(
        recipes.expand((item) => item.mutations).any((item) =>
            item.category == favorite.category &&
            item.value == favorite.value &&
            item.weight == favorite.weight),
        isTrue);
  });

  test('artist count is capped at twenty', () {
    final pool = List.generate(
      40,
      (index) => ArtistTagRecord(index + 1, 'artist_$index', 1000 - index),
    );
    final recipe = drawArtistRecipes(
      pool: pool,
      count: 1,
      minArtists: 99,
      maxArtists: 99,
      drawSeed: 9,
    ).single;
    expect(recipe.artists.length, 20);
  });

  test('artist copy ends with comma and full prompt uses the requested order',
      () {
    const recipe = ArtistRecipe(
      'one',
      '1::artist:foo ::, year 2025, 1.2::cinematic lighting ::',
      ['foo'],
      artistPrompt: '1::artist:foo ::',
      basePrompt: '1::artist:foo ::, year 2025',
      mutations: [StyleMutationTerm('lighting', 'cinematic lighting', 1.2)],
    );
    expect(artistPromptWithTrailingComma(recipe.artistPrompt),
        '1::artist:foo ::,');
    expect(
      fullArtistRecipePrompt(recipe, '1girl, smile'),
      '1::artist:foo ::, 1.2::cinematic lighting ::, year 2025, 1girl, smile',
    );
  });

  test('card copy includes every displayed weighted tag', () {
    const prompt =
        '1.94::artist:xiujia_yihuizi ::, 1.01::artist:asteroid_ill ::, 1.17::zenless_zone_zero ::, 1.36::arknights ::, 0.8::cinematic lighting ::';
    const recipe = ArtistRecipe(
      'card',
      prompt,
      ['xiujia_yihuizi', 'asteroid_ill'],
      artistPrompt:
          '1.94::artist:xiujia_yihuizi ::, 1.01::artist:asteroid_ill ::',
      franchiseStyles: [
        StyleMutationTerm('franchiseStyle', 'zenless_zone_zero', 1.17),
        StyleMutationTerm('franchiseStyle', 'arknights', 1.36),
      ],
      mutations: [StyleMutationTerm('lighting', 'cinematic lighting', 0.8)],
    );
    final copied = artistRecipeCardTagsWithTrailingComma(recipe);
    expect(copied, '$prompt,');
    expect(copied, contains('zenless_zone_zero'));
    expect(copied, contains('arknights'));
    expect(copied, contains('cinematic lighting'));
  });

  test('weight tuning preserves artist order and changes only weights', () {
    final recipes = randomizeArtistWeights(
      artistPrompt: '1::artist:foo ::, 2::artist:bar ::,',
      count: 4,
      variationPercent: 20,
      drawSeed: 42,
    );
    expect(recipes, hasLength(4));
    expect(
        recipes.every((item) => item.artists.join(',') == 'foo,bar'), isTrue);
    expect(
        recipes.every((item) =>
            item.prompt.contains('artist:foo') &&
            item.prompt.contains('artist:bar')),
        isTrue);
    expect(
      randomizeArtistWeights(
        artistPrompt: 'masterpiece, 1girl',
        count: 2,
        drawSeed: 1,
      ),
      isEmpty,
    );
  });
}
