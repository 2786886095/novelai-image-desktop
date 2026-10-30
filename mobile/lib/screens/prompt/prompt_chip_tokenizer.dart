/// Lossless, conservative prompt-chip spans. Never normalizes the prompt.
class PromptChipToken {
  final int rawStart;
  final int rawEnd;
  final int start;
  final int end;
  final String raw;
  final String separator;

  const PromptChipToken(
      {required this.rawStart,
      required this.rawEnd,
      required this.start,
      required this.end,
      required this.raw,
      required this.separator});

  String get text => raw.trim();
}

/// A null result means that text mode must be used: grouping is incomplete or
/// ambiguous. Commas inside escaped/bracketed/numeric-weight groups stay whole.
List<PromptChipToken>? tokenizePromptChips(String source) {
  final stack = <String>[];
  final spans = <PromptChipToken>[];
  var begin = 0;
  var quoted = false;
  var weighted = false;
  void append(int end, String separator) {
    final raw = source.substring(begin, end);
    var left = 0, right = raw.length;
    while (left < right && raw[left].trim().isEmpty) {
      left++;
    }
    while (right > left && raw[right - 1].trim().isEmpty) {
      right--;
    }
    spans.add(PromptChipToken(
        rawStart: begin,
        rawEnd: end,
        start: begin + left,
        end: begin + right,
        raw: raw,
        separator: separator));
  }

  for (var i = 0; i < source.length; i++) {
    final c = source[i];
    if (c == r'\') {
      if (i + 1 >= source.length) return null;
      i++;
      continue;
    }
    if (c == '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (c == ':' && i + 1 < source.length && source[i + 1] == ':') {
      if (!weighted &&
          !RegExp(r'[-+]?(?:\d+(?:\.\d+)?|\.\d+)$')
              .hasMatch(source.substring(begin, i).trimRight())) return null;
      weighted = !weighted;
      i++;
      continue;
    }
    if ('{[('.contains(c)) {
      stack.add(c);
      continue;
    }
    if ('}])'.contains(c)) {
      if (stack.isEmpty ||
          '{[('.indexOf(stack.removeLast()) != '}])'.indexOf(c)) return null;
      continue;
    }
    if (c == ',' && stack.isEmpty && !weighted) {
      append(i, ',');
      begin = i + 1;
    }
  }
  if (stack.isNotEmpty || quoted || weighted) return null;
  append(source.length, '');
  if (joinPromptChips(spans) != source) return null;
  return List.unmodifiable(spans);
}

String joinPromptChips(Iterable<PromptChipToken> tokens) =>
    tokens.map((token) => '${token.raw}${token.separator}').join();

String deletePromptChip(String source, PromptChipToken token) {
  if (token.rawStart < 0 ||
      token.rawEnd > source.length ||
      source.substring(token.rawStart, token.rawEnd) != token.raw) {
    return source;
  }
  final start = token.separator.isEmpty &&
          token.rawStart > 0 &&
          source[token.rawStart - 1] == ','
      ? token.rawStart - 1
      : token.rawStart;
  final end = token.rawEnd + token.separator.length;
  return source.replaceRange(start, end, '');
}
