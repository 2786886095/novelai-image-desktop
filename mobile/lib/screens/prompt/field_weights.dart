import 'dart:math' as math;
import '../../prompts/prompt_tools.dart';
import 'prompt_chip_tokenizer.dart';

/// Localized edits preserve surrounding whitespace, quotes and manual Text: blocks.
class FieldWeight {
  final String core;
  final double weight;
  final bool minus, plus;
  final String Function(int) move;
  const FieldWeight(this.core, this.weight, this.minus, this.plus, this.move);
}

List<FieldWeight> fieldWeights(String input) {
  final textAt = RegExp(r'(?:^|[\r\n,])\s*Text:', caseSensitive: false)
          .firstMatch(input)
          ?.start ??
      input.length;
  final prefix = input.substring(0, textAt);
  final spans = tokenizePromptChips(prefix, smartQuotes: true);
  if (spans == null) return [];
  bool simple(String v) =>
      v.isNotEmpty &&
      !RegExp(r'[\[\]{}"“”\r\n]').hasMatch(v) &&
      !v.contains('::');
  final units = <FieldWeight>[];
  for (final span in spans.where((s) => s.text.isNotEmpty)) {
    String write(String v) => input.replaceRange(span.start, span.end, v);
    final n = RegExp(r'^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*::([\s\S]+)::$')
        .firstMatch(span.text);
    if (n != null) {
      final old = double.tryParse(n[1]!);
      final members = tokenizePromptChips(n[2]!, smartQuotes: true);
      if (old == null ||
          !old.isFinite ||
          old.abs() > 1e8 ||
          members == null ||
          !members.every((m) => simple(m.text))) continue;
      double next(int dir) => ((old + dir * .1) * 100).round() / 100;
      for (var i = 0; i < members.length; i++) {
        final member = i;
        final canLess = next(-1) >= math.min(-5, old),
            canMore = next(1) <= math.max(5, old);
        units.add(
            FieldWeight(members[i].text, old, canLess, canMore, (direction) {
          if (direction > 0 ? !canMore : !canLess) return input;
          return write([
            for (var j = 0; j < members.length; j++)
              j != member
                  ? n[1]! + '::' + members[j].text + '::'
                  : next(direction) == 1
                      ? members[j].text
                      : next(direction).toString() +
                          '::' +
                          members[j].text +
                          '::'
          ].join(', '));
        }));
      }
      continue;
    }
    final parsed = parseWeightedTag(span.text);
    if (!simple(parsed.core) || parsed.core.contains(',')) continue;
    final canLess = parsed.level > -5, canMore = parsed.level < 5;
    units.add(FieldWeight(
        parsed.core,
        weightMultiplier(parsed.level),
        canLess,
        canMore,
        (dir) => (dir > 0 ? !canMore : !canLess)
            ? input
            : write(serializeWeightedTag(parsed.core, parsed.level + dir))));
  }
  return units;
}
