import 'nai_models.dart';

const styleSorts = [
  'default',
  'custom',
  'rating-desc',
  'rating-asc',
  'created-desc',
  'created-asc',
  'uses-desc',
  'uses-asc',
  'name'
];
List<StylePromptPreset> sortStyles(List<StylePromptPreset> items, String mode) {
  final ranks = {for (final entry in items.indexed) entry.$2.id: entry.$1};
  final out = [...items];
  out.sort((a, b) {
    int c = 0;
    if (mode == 'custom') c = a.sortOrder.compareTo(b.sortOrder);
    if (mode == 'name') {
      c = a.name.toLowerCase().compareTo(b.name.toLowerCase());
    }
    if (mode.startsWith('rating')) c = a.rating.compareTo(b.rating);
    if (mode.startsWith('uses')) c = a.usageCount.compareTo(b.usageCount);
    if (mode.startsWith('created')) {
      c = (DateTime.tryParse(a.createdAt)?.millisecondsSinceEpoch ?? 0)
          .compareTo(
              DateTime.tryParse(b.createdAt)?.millisecondsSinceEpoch ?? 0);
    }
    if (mode.endsWith('-desc')) c = -c;
    return c != 0 ? c : ranks[a.id]!.compareTo(ranks[b.id]!);
  });
  return out;
}

void moveStyle(List<StylePromptPreset> items, String id, String target,
    [List<String>? visibleIds]) {
  final sorted = sortStyles(items, 'custom');
  if (visibleIds != null) {
    final byId = {for (final p in items) p.id: p};
    final visible = visibleIds
        .map((id) => byId[id])
        .whereType<StylePromptPreset>()
        .toList();
    var i = 0;
    for (var j = 0; j < sorted.length; j++) {
      if (visibleIds.contains(sorted[j].id)) {
        sorted[j] = visible[i++];
      }
    }
  }
  final from = sorted.indexWhere((p) => p.id == id),
      to = sorted.indexWhere((p) => p.id == target);
  if (from < 0 || to < 0 || from == to) return;
  sorted.insert(to, sorted.removeAt(from));
  for (final entry in sorted.indexed) {
    entry.$2.sortOrder = entry.$1;
  }
}

List<({String name, String prompt})> parseStyleLines(String text) => text
    .replaceFirst(RegExp(r'^\uFEFF'), '')
    .split(RegExp(r'\r?\n'))
    .map((line) {
      line = line.trim();
      final i = line.indexOf('\t');
      final prompt = (i < 0 ? line : line.substring(i + 1)).trim();
      return (
        name: i < 0
            ? prompt.substring(0, prompt.length.clamp(0, 40))
            : line.substring(0, i).trim(),
        prompt: prompt
      );
    })
    .where((r) => r.prompt.isNotEmpty)
    .map((r) => (name: r.name.isEmpty ? r.prompt : r.name, prompt: r.prompt))
    .toList();
int naturalFileCompare(String a, String b) {
  final x = RegExp(r'\d+|\D+')
          .allMatches(a.toLowerCase())
          .map((m) => m.group(0)!)
          .toList(),
      y = RegExp(r'\d+|\D+')
          .allMatches(b.toLowerCase())
          .map((m) => m.group(0)!)
          .toList();
  for (var i = 0; i < x.length && i < y.length; i++) {
    final n = int.tryParse(x[i]), m = int.tryParse(y[i]);
    final c = n != null && m != null ? n.compareTo(m) : x[i].compareTo(y[i]);
    if (c != 0) return c;
  }
  return x.length.compareTo(y.length);
}

List<List<String>> matchStyleImages(
    List<String> names, List<String> styles, String mode) {
  if (mode != 'none' && names.toSet().length != names.length) {
    throw const FormatException('Duplicate image filenames');
  }
  final sorted = [...names]..sort(naturalFileCompare);
  return List.generate(
      styles.length,
      (i) => mode == 'order'
          ? (i < sorted.length ? [sorted[i]] : [])
          : mode == 'name'
              ? sorted
                  .where((n) =>
                      n.replaceFirst(RegExp(r'\.[^.]+$'), '').toLowerCase() ==
                      styles[i].toLowerCase())
                  .take(9)
                  .toList()
              : []);
}
