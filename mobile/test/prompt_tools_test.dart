import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/prompt_tools.dart';

void main() {
  test('normalizes punctuation, duplicates and quality prefixes', () {
    expect(
      normalizePrompt('Masterpiece，Blue_Eyes, blue eyes\n【solo】'),
      'blue eyes, solo',
    );
  });

  test('normalization preserves wildcard groups', () {
    expect(
      normalizePrompt('masterpiece, {red_hair|blue_hair}, 1GIRL'),
      '{red_hair|blue_hair}, 1girl',
    );
  });

  test('normalization options can preserve case, quality and underscores', () {
    final result = normalizePrompt(
      'MasterPiece, Blue_Eyes, Blue_Eyes',
      options: const PromptNormalizeOptions(
        lowercase: false,
        underscoreToSpace: false,
        dedupe: false,
        stripQualityPrefix: false,
      ),
    );
    expect(result, 'MasterPiece, Blue_Eyes, Blue_Eyes');
  });

  test('wildcards expand innermost first without touching weights', () {
    expect(
      expandPromptWildcards('1girl, {red|blue} hair', random: () => 0),
      '1girl, red hair',
    );
    expect(
      expandPromptWildcards('{a|{b|c}}', random: () => 0.99),
      'c',
    );
    expect(
      expandPromptWildcards('{masterpiece}, [bad]', random: () => 0),
      '{masterpiece}, [bad]',
    );
    expect(hasPromptWildcards('{a|b}'), isTrue);
    expect(hasPromptWildcards('{weight}'), isFalse);
  });

  test('adjusts one prompt tag without changing its neighbors', () {
    expect(
        setTagLevel('1girl, {smile}, solo', 1, -2), '1girl, [[smile]], solo');
    expect(weightMultiplier(2).toStringAsFixed(2), '1.10');
  });

  test('returns related tags that are not already present', () {
    final tags = relatedPromptTags('1girl, smile');
    expect(tags.map((item) => item.tag), contains('blush'));
    expect(tags.map((item) => item.tag), isNot(contains('1girl')));
  });
}
