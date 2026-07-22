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
}
