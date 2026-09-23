/// Exact saved prefixes only. Unknown prompts and edited tag strings stay intact.
({String style, String positive})? restoreSavedStyle(String prompt, Iterable<String> presets) {
  final styles = presets.map((s) => s.trim()).where((s) => s.isNotEmpty).toSet().toList()
    ..sort((a,b) => b.length.compareTo(a.length));
  for (final style in styles) {
    if (prompt == style) return (style: style, positive: '');
    if (!prompt.startsWith(style)) continue;
    final rest = prompt.substring(style.length);
    final delimiter = RegExp(r'^\s*,\s*').firstMatch(rest);
    if (delimiter != null) return (style: style, positive: rest.substring(delimiter.end));
  }
  return null;
}
