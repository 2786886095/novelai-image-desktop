import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/v5_artist_weight_repair.dart';

const malformedMixedPrompt =
    r'xiaoluo\_xl ，beijuu，yd\_(orange\_maru，2::ohisashiburi:: ，2::nonco :: ，no halo，::,yutokamizu,,1::mx2j:: ,doremi (doremi4704),impasto ，， ,{{extremely detailed CG}}, {{{best quality}}}, {{ultra-detailed}}, {{illustration}}';

void main() {
  group('V4.5 to V5 repair', () {
    test('downweights every tag and classifies only reviewed artists', () {
      final result = repairV45ArtistWeightsForV5(
        malformedMixedPrompt,
        random: () => 0,
      );
      expect(
        result.output,
        '0.33::artist:xiaoluo_xl ::, 0.33::artist:beijuu ::, 0.33::artist:yd_(orange_maru) ::, 0.67::artist:ohisashiburi ::, 0.67::artist:nonco ::, 0.33::no halo ::, 0.33::artist:yutokamizu ::, 0.33::artist:mx2j ::, 0.33::artist:doremi_(doremi4704) ::, 0.33::impasto ::, 0.37::extremely detailed CG ::, 0.39::best quality ::, 0.37::ultra-detailed ::, 0.37::illustration ::',
      );
      expect(result.totalAdjusted, 14);
      expect(result.artistTagCount, 8);
      expect(result.qualityTagCount, 3);
      expect(result.otherTagCount, 3);
      expect(result.output, isNot(contains('artist:illustration')));
      expect(minV5ArtistRepairMultiplier, closeTo(1 / 3, .000001));
      expect(maxV5ArtistRepairMultiplier, .5);
    });

    test('samples all tag categories independently', () {
      final values = <double>[0, .5, 1];
      var cursor = 0;
      final result = repairV45ArtistWeightsForV5(
        '1.94::artist:xiujia_yihuizi ::, {{{best quality}}}, 2::official art ::',
        random: () => values[cursor++],
      );
      expect(
        result.output,
        '0.65::artist:xiujia_yihuizi ::, 0.48::best quality ::, 1::official art ::',
      );
      expect(result.totalAdjusted, 3);
      expect(cursor, 3);
    });

    test('normalizes every valid tag without migration downweighting', () {
      final result = normalizeV45ArtistSyntax(
        '(artist:foo:1.5), {artist:bar}, artist:baz, year 2025, {{illustration}}',
      );
      expect(
        result.output,
        '1.5::artist:foo ::, 1.05::artist:bar ::, 1::artist:baz ::, 1::year 2025 ::, 1.1::illustration ::',
      );
      expect(result.totalAdjusted, 5);
    });

    test('repairs every tag in a shared numeric scope independently', () {
      final values = <double>[0, 1, .5];
      var cursor = 0;
      final result = repairV45ArtistWeightsForV5(
        '1.2::artist:foo, artist:bar, masterpiece ::',
        random: () => values[cursor++],
      );
      expect(
        result.output,
        '0.4::artist:foo ::, 0.6::artist:bar ::, 0.5::masterpiece ::',
      );
      expect(cursor, 3);
    });

    test('carries brace emphasis across comma-separated tags', () {
      final result =
          normalizeV45ArtistSyntax('{{masterpiece, best quality}}, [no text]');
      expect(
        result.output,
        '1.1::masterpiece ::, 1.1::best quality ::, 0.95::no text ::',
      );
    });

    test('keeps unknown bare names as ordinary tags', () {
      final result = repairV45ArtistWeightsForV5(
        'unknown_creator, illustration',
        random: () => 0,
      );
      expect(
        result.output,
        '0.33::unknown_creator ::, 0.33::illustration ::',
      );
      expect(result.artistTagCount, 0);
      expect(result.totalAdjusted, 2);
    });

    test('creates multiple complete repair candidates', () {
      final recipes = repairV45ArtistCandidatesForV5(
        input: 'artist:foo, {{best quality}}',
        count: 4,
        drawSeed: 19,
      );
      expect(recipes, hasLength(4));
      for (final recipe in recipes) {
        expect(RegExp(r'::[^,]+ ::').allMatches(recipe.prompt), hasLength(2));
      }
    });
  });

  group('all-tag weight draw', () {
    test('rerolls all tags and retains the complete set', () {
      final recipes = drawAllV5ArtistWeights(
        input: 'artist:foo, {{best quality}}, impasto, no halo',
        count: 3,
        minWeight: .2,
        maxWeight: 1.2,
        drawSeed: 7,
      );
      expect(recipes, hasLength(3));
      expect(recipes.map((recipe) => recipe.prompt).toSet(), hasLength(3));
      for (final recipe in recipes) {
        expect(recipe.artists, ['foo']);
        expect(RegExp(r'::[^,]+ ::').allMatches(recipe.prompt), hasLength(4));
        final weights = RegExp(r'([0-9.]+)::')
            .allMatches(recipe.prompt)
            .map((match) => double.parse(match.group(1)!));
        expect(
            weights.every((weight) => weight >= .2 && weight <= 1.2), isTrue);
      }
    });

    test('allows a complete prompt with no artist tag', () {
      final recipes = drawAllV5ArtistWeights(
        input: '{{best quality}}, illustration, 1girl',
        count: 2,
        minWeight: .2,
        maxWeight: .2,
        drawSeed: 11,
      );
      expect(recipes, hasLength(2));
      expect(recipes.first.artists, isEmpty);
      expect(
        recipes.first.prompt,
        '0.2::best quality ::, 0.2::illustration ::, 0.2::1girl ::',
      );
    });

    test('uses repair migration before applying final draw bounds', () {
      final recipes = drawAllV5ArtistWeights(
        input: '2::artist:foo ::, 0.1::best quality ::, 10::impasto ::',
        count: 1,
        minWeight: .2,
        maxWeight: 1.2,
        drawSeed: 3,
      );
      final weights = RegExp(r'([0-9.]+)::')
          .allMatches(recipes.single.prompt)
          .map((match) => double.parse(match.group(1)!))
          .toList();
      expect(weights[0], inInclusiveRange(2 / 3, 1));
      expect(weights[1], .2);
      expect(weights[2], 1.2);
    });

    test('reports the retained tag count', () {
      expect(countV5PromptTags(malformedMixedPrompt), 14);
      expect(countV5PromptTags('，，, ::, ;'), 0);
    });
  });
}
