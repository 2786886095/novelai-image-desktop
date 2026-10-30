import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/screens/prompt/prompt_chip_tokenizer.dart';

void main() {
  test('chip spans round-trip every original separator and whitespace', () {
    for (final text in [
      '',
      'cat',
      ' cat,  blue eyes,\n stars, ',
      '猫, red\\, blue',
      '{red, blue}, [low detail], 0.8::night, stars::',
      '"red, blue", cat'
    ]) {
      final result = tokenizePromptChips(text);
      expect(result, isNotNull, reason: text);
      expect(joinPromptChips(result!), text);
      for (final token in result) {
        expect(text.substring(token.rawStart, token.rawEnd), token.raw);
        expect(text.substring(token.start, token.end), token.text);
      }
    }
  });
  test('grouped, escaped and numeric-weight commas do not split chips', () {
    final chips = tokenizePromptChips(
        'cat, {red, blue}, 0.8::night, stars::, red\\, blue')!;
    expect(chips.map((t) => t.text),
        ['cat', '{red, blue}', '0.8::night, stars::', r'red\, blue']);
  });
  test('ambiguous or unfinished grammar conservatively uses text mode', () {
    for (final text in [
      '{cat',
      '[cat}',
      '0.8::cat',
      'cat :: blue::',
      '"cat',
      'cat\\'
    ]) {
      expect(tokenizePromptChips(text), isNull, reason: text);
    }
  });
  test('explicit chip removal preserves all unrelated text', () {
    const source = 'cat,  blue eyes, stars';
    final tokens = tokenizePromptChips(source)!;
    expect(deletePromptChip(source, tokens[0]), '  blue eyes, stars');
    expect(deletePromptChip(source, tokens[1]), 'cat, stars');
    expect(deletePromptChip(source, tokens[2]), 'cat,  blue eyes');
    expect(deletePromptChip('different', tokens[0]), 'different');
  });
}
