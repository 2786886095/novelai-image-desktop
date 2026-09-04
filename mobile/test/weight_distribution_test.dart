import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/artist/artist_recipe.dart';
import 'package:novelai_mobile/artist/weight_distribution.dart';
import 'package:novelai_mobile/prompts/v5_artist_weight_repair.dart';

void main() {
  test('normalizes mode and dispersions into their valid ranges', () {
    final value = normalizeWeightDistribution(
      const WeightDistributionConfig(
        mode: 9,
        leftDispersion: -1,
        rightDispersion: 2,
      ),
      .2,
      1.2,
    );
    expect(value.mode, 1.2);
    expect(value.leftDispersion, 0);
    expect(value.rightDispersion, 1);
    expect(value.softBalance, 0);
  });

  test('seeded samples are deterministic and stay within bounds', () {
    final first = Random(42);
    final second = Random(42);
    const config = WeightDistributionConfig(
      mode: .5,
      leftDispersion: .3,
      rightDispersion: .7,
      softBalance: 0,
    );
    final a =
        List.generate(100, (_) => sampleControlledWeight(first, .1, 2, config));
    final b = List.generate(
        100, (_) => sampleControlledWeight(second, .1, 2, config));
    expect(a, b);
    expect(a.every((value) => value >= .1 && value <= 2), isTrue);
  });

  test('lower dispersion clusters more tightly around the mode', () {
    double averageDistance(double dispersion) {
      final random = Random(7);
      const mode = .7;
      final values = List.generate(
        2000,
        (_) => sampleControlledWeight(
          random,
          .1,
          2,
          WeightDistributionConfig(
            mode: mode,
            leftDispersion: dispersion,
            rightDispersion: dispersion,
            softBalance: 0,
          ),
        ),
      );
      return values
              .map((value) => (value - mode).abs())
              .reduce((a, b) => a + b) /
          values.length;
    }

    expect(averageDistance(.05), lessThan(averageDistance(.95)));
  });

  test('advanced distribution is wired into random and input artist draws', () {
    const fixed = WeightDistributionConfig(
      mode: .7,
      leftDispersion: 0,
      rightDispersion: 0,
      softBalance: 0,
    );
    final randomRecipes = drawArtistRecipes(
      pool: const [
        ArtistTagRecord(1, 'alpha', 100),
        ArtistTagRecord(2, 'beta', 90),
      ],
      count: 1,
      minArtists: 2,
      maxArtists: 2,
      drawSeed: 42,
      minArtistWeight: .7,
      maxArtistWeight: .7,
      artistWeightDistribution: fixed,
    );
    expect(randomRecipes.single.prompt, contains('0.7::artist:'));

    final inputRecipes = drawAllV5ArtistWeights(
      input: 'artist:alpha, masterpiece',
      count: 2,
      minWeight: .7,
      maxWeight: .7,
      drawSeed: 42,
      weightDistribution: fixed,
    );
    expect(inputRecipes, hasLength(2));
    expect(inputRecipes.every((item) => item.prompt.contains('0.7::')), isTrue);
  });

  test('soft balance translates the complete string towards the mode', () {
    const config = WeightDistributionConfig(
      mode: .8,
      leftDispersion: .4,
      rightDispersion: .4,
      softBalance: .5,
    );
    final balanced = softBalanceWeights([.2, .4, .8], .1, 2, config);
    expect(balanced, [.4, .6, 1.0]);
  });

  test('exact preview probabilities sum to one', () {
    const config = WeightDistributionConfig(
      mode: .8,
      leftDispersion: .4,
      rightDispersion: .7,
      softBalance: .5,
    );
    final bins = buildWeightDistributionPreview(.2, 1.2, config, binCount: 40);
    expect(bins, hasLength(40));
    expect(bins.reduce((a, b) => a + b), closeTo(1, 1e-10));
  });
}
