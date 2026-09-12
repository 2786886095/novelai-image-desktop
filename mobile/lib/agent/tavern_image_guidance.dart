import 'tavern_models.dart';

final _assignment = RegExp(
    r'\{\{setvar::([^{}:]+)::((?:\{\{getvar::[^{}:]+\}\}|(?!\}\})[\s\S])*?)\}\}');
final _reference = RegExp(r'\{\{getvar::([^{}:]+)\}\}');

bool isOriginalImageGuidance(TavernLorebookEntry entry) {
  final config = entry.extensions['langbai_image_guidance'];
  return config is Map && config.containsKey('source');
}

/// Request-local, book-local macro rendering. Stored content is never rewritten.
Map<TavernLorebookEntry, String> renderOriginalImageGuidance(
    List<(TavernLorebook, TavernLorebookEntry)> items) {
  final variables = <String, Map<String, String>>{};
  final result = <TavernLorebookEntry, String>{};
  for (final (book, entry) in items) {
    if (!isOriginalImageGuidance(entry)) continue;
    final scope = variables.putIfAbsent(
        book.id,
        () => {
              for (final key in [
                '解析格式',
                'SD',
                '图片总数',
                'male',
                '尺寸',
                '尺寸格式',
                '尺寸竖图',
                '尺寸方图',
                '尺寸横图',
                'NAI',
                'Danbooru',
                '叙事'
              ])
                key: ''
            });
    for (final match in _assignment.allMatches(entry.content)) {
      scope[match[1]!] = match[2]!;
    }
  }
  for (final (book, entry) in items) {
    if (!isOriginalImageGuidance(entry)) continue;
    final scope = variables[book.id]!;
    String resolve(String text, Set<String> seen) =>
        text.replaceAllMapped(_reference, (match) {
          final key = match[1]!;
          if (seen.contains(key)) {
            throw StateError('Worldbook variable cycle: $key');
          }
          if (!scope.containsKey(key)) {
            throw StateError('Worldbook variable is not defined: $key');
          }
          return resolve(scope[key]!, {...seen, key});
        });
    result[entry] = resolve(entry.content.replaceAll(_assignment, ''), {});
  }
  return result;
}
