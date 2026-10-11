// Mirrors src/google-prompt-translation.ts; shared fixtures guard parity.
// Translate ordinary text by default. Protect only explicit/qualified names or
// local categories 1/3/4; a missing optional index must not suppress descriptors.
String _key(String s) =>
    s.toLowerCase().replaceAll('_', ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

final _protectedAtom = RegExp(
    r'^(?:(?:artist|character|copyright):[^,，{}\[\]|\r\n]+|[^\s(),，{}\[\]|]+\([^()]*\)|https?://[^\s,，{}|]+|[^\s,，{}|]+\.(?:png|webp|jpe?g|gif|avif|bmp|vibe|json)|[+-]?(?:\d+(?:\.\d+)?|\.\d+))$',
    caseSensitive: false);
final _resourceAtom = RegExp(
    r'^(?:https?://[^\s,，{}|]+|[^\s,，{}|]+\.(?:png|webp|jpe?g|gif|avif|bmp|vibe|json))(?=$|[\s,，{}|])',
    caseSensitive: false);

class _Piece {
  final String? literal;
  final String tag, prefix, suffix;
  int? term;
  _Piece.literal(this.literal)
      : tag = '',
        prefix = '',
        suffix = '';
  _Piece.tag(this.tag, this.prefix, this.suffix) : literal = null;
}

class GooglePromptTranslationPlan {
  final List<String> queries;
  final String Function(List<String>) restore;
  GooglePromptTranslationPlan(this.queries, this.restore);
}

List<_Piece> _piecesOf(String text) {
  final pieces = <_Piece>[];
  var start = 0, depth = 0;
  void push(int end) {
    final m = RegExp(r'^(\s*)([\s\S]*?)(\s*)$')
        .firstMatch(text.substring(start, end))!;
    var tag = m[2]!, prefix = m[1]!, suffix = m[3]!;
    while (tag.startsWith('(') && tag.endsWith(')')) {
      final inner = tag.substring(1, tag.length - 1),
          weight = RegExp(r'^(.*?)(:[+-]?\d+(?:\.\d+)?)$').firstMatch(inner);
      prefix += '(';
      tag = weight?[1] ?? inner;
      suffix = '${weight?[2] ?? ''})$suffix';
    }
    final innerSpace = RegExp(r'^(\s*)([\s\S]*?)(\s*)$').firstMatch(tag)!;
    prefix += innerSpace[1]!;
    tag = innerSpace[2]!;
    suffix = innerSpace[3]! + suffix;
    pieces.add(_Piece.tag(tag, prefix, suffix));
  }

  final delimiter =
      RegExp(r'^(?:[+-]?(?:\d+(?:\.\d+)?|\.\d+)::|::|[{},，\[\]|\r\n])');
  for (var i = 0; i < text.length; i++) {
    if (i == start || RegExp(r'\s').hasMatch(text[i - 1])) {
      final resource = _resourceAtom.firstMatch(text.substring(i));
      if (resource != null) {
        i += resource[0]!.length - 1;
        continue;
      }
    }
    if (text[i] == '(') {
      depth++;
    } else if (text[i] == ')' && depth > 0) {
      depth--;
    }
    if (depth > 0) continue;
    final m = delimiter.firstMatch(text.substring(i));
    if (m == null) continue;
    push(i);
    // Normalize only a parsed separator, not protected names or resource bytes.
    pieces.add(_Piece.literal(m[0] == '，' ? ',' : m[0]!));
    i += m[0]!.length - 1;
    start = i + 1;
  }
  push(text.length);
  return pieces;
}

Future<GooglePromptTranslationPlan> prepareGooglePromptTranslation(String text,
    {Future<int?> Function(String)? lookupCategory}) async {
  if (_protectedAtom.hasMatch(text.trim())) {
    return GooglePromptTranslationPlan([], (_) => text);
  }
  if (!RegExp(
          r'[_{}()\[\]|,，]|::|\b(?:artist|character|copyright):|(?:^|[,，\s])\d+(?:girls?|boys?)\b')
      .hasMatch(text)) {
    return GooglePromptTranslationPlan([text], (values) => values[0].trim());
  }
  if (text.length > 20000) throw const FormatException('提示词过长，请分段翻译。');
  final pieces = _piecesOf(text),
      terms = <String>[],
      indexes = <String, int>{},
      categories = <String, int?>{};
  for (final piece in pieces) {
    if (piece.literal != null || piece.tag.isEmpty) continue;
    final tag = piece.tag, normalized = _key(tag);
    if (_protectedAtom.hasMatch(tag)) continue;
    if (!categories.containsKey(normalized)) {
      int? category;
      try {
        category = await lookupCategory?.call(tag);
      } catch (_) {/* optional local index */}
      categories[normalized] = category;
    }
    final category = categories[normalized];
    if (category == 1 || category == 3 || category == 4) continue;
    final term = tag.replaceAll('_', ' ').replaceFirstMapped(
        RegExp(r'^(\d+)(girls?|boys?)\b'), (m) => '${m[1]} ${m[2]}');
    if (term.length > 1200) {
      throw const FormatException('单段提示词过长，请分段翻译。');
    }
    if (!indexes.containsKey(term)) {
      indexes[term] = terms.length;
      terms.add(term);
    }
    piece.term = indexes[term];
  }
  final batches = <List<String>>[];
  var batch = <String>[];
  for (final term in terms) {
    if (batch.isNotEmpty && batch.join('\n').length + term.length + 1 > 1200) {
      batches.add(batch);
      batch = <String>[];
    }
    batch.add(term);
  }
  if (batch.isNotEmpty) batches.add(batch);
  return GooglePromptTranslationPlan(batches.map((b) => b.join('\n')).toList(),
      (values) {
    if (values.length != batches.length) {
      throw const FormatException('谷歌翻译标签结果不完整，未应用译文。');
    }
    final translated = <String>[];
    for (var i = 0; i < values.length; i++) {
      final lines = values[i]
          .trim()
          .split(RegExp(r'\r?\n'))
          .map((s) => s.trim())
          .toList();
      if (lines.length != batches[i].length ||
          lines
              .any((s) => s.isEmpty || RegExp(r'::|[{},，\[\]|]').hasMatch(s))) {
        throw const FormatException('谷歌翻译标签结果错位，未应用译文。');
      }
      translated.addAll(lines);
    }
    return pieces
        .map((p) =>
            p.literal ??
            '${p.prefix}${p.term == null ? p.tag : translated[p.term!]}${p.suffix}')
        .join();
  });
}
