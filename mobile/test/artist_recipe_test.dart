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
}
