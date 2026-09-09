import 'dart:convert';

String quickPathCode(List<String> path) {
  if (path.isEmpty) return '';
  var hash = 0x811c9dc5;
  for (final unit in path.join('\u001f').codeUnits) {
    hash = ((hash ^ (unit & 255)) * 0x01000193) & 0xffffffff;
    hash = ((hash ^ (unit >> 8)) * 0x01000193) & 0xffffffff;
  }
  return hash.toRadixString(36);
}

List<Map<String, dynamic>> quickCategories(List<Map<String, dynamic>> entries,
    {Object? tree, Object? empty}) {
  final nodes = <String, Map<String, dynamic>>{};
  void add(List<String> path) {
    for (var i = 1; i <= path.length; i++) {
      final prefix = path.take(i).toList();
      nodes.putIfAbsent(jsonEncode(prefix),
          () => {'path': prefix, 'code': quickPathCode(prefix), 'count': 0});
    }
  }

  void walk(Object? tree, List<String> parent) {
    if (tree is! List) return;
    for (final node in tree.whereType<Map>()) {
      if (node['name'] is! String || (node['name'] as String).isEmpty) continue;
      final path = [...parent, node['name'] as String];
      add(path);
      walk(node['children'], path);
    }
  }

  walk(tree, []);
  if (empty is List) {
    for (final path in empty.whereType<List>()) {
      if (path.every((p) => p is String && p.isNotEmpty)) {
        add(List<String>.from(path));
      }
    }
  }
  for (final entry in entries) {
    final path = (entry['path'] is List ? entry['path'] as List : [])
        .whereType<String>()
        .where((s) => s.isNotEmpty)
        .toList();
    for (var i = 1; i <= path.length; i++) {
      final prefix = path.take(i).toList(),
          key = jsonEncode(path.take(i).toList());
      final node = nodes.putIfAbsent(key,
          () => {'path': prefix, 'code': quickPathCode(prefix), 'count': 0});
      node['count'] = (node['count'] as int) + 1;
    }
  }
  return nodes.values.toList();
}

bool quickSafe(Map<String, dynamic> entry) =>
    ![true, 1, '1', 'true'].contains(entry['nsfw']) &&
    !RegExp(r'^(r18|r18g|nsfw|explicit|questionable|sensitive|adult)$',
            caseSensitive: false)
        .hasMatch('${entry['rating'] ?? ''}');
bool quickMatch(Map<String, dynamic> entry, String query) {
  final haystack = [
    entry['title'],
    entry['tags'],
    entry['prompt'],
    entry['note'],
    entry['author'],
    entry['credit'],
    ...quickCharacters(entry).map((c) => '${c['label']} ${c['prompt']}'),
    jsonEncode(entry['path'] ?? [])
  ].join(' ').toLowerCase();
  return RegExp(r'-?"[^"]+"|\S+').allMatches(query).every((m) {
    final token = m[0]!, exclude = token.startsWith('-');
    final term = (exclude ? token.substring(1) : token)
        .replaceAll(RegExp(r'^"|"$'), '')
        .toLowerCase();
    return term.isEmpty ||
        (exclude ? !haystack.contains(term) : haystack.contains(term));
  });
}

List<Map<String, String>> quickCharacters(Object? entry) {
  if (entry is! Map || entry['characterPrompts'] is! List) return [];
  return (entry['characterPrompts'] as List)
      .whereType<Map>()
      .where((c) => c['prompt'] is String && (c['prompt'] as String).isNotEmpty)
      .map((c) => {
            'label': c['label'] is String ? c['label'] as String : '',
            'prompt': c['prompt'] as String
          })
      .toList();
}

Map<String, dynamic>? quickLink(String value) {
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(value)) return null;
  final url = Uri.parse(value);
  if (url.scheme != 'https' ||
      url.host != 'novelai.quicktagcloud.com' ||
      url.userInfo.isNotEmpty) {
    throw const FormatException('Invalid QuickTagCloud link');
  }
  return {
    'collectionId':
        url.queryParameters['c'] ?? url.queryParameters['codex'] ?? '',
    'path': url.queryParametersAll['path'] ?? <String>[],
    'code': url.queryParameters['p'] ?? '',
    'entry': url.queryParameters['entry'] ??
        Uri.splitQueryString(url.fragment)['entry'] ??
        '',
    'query': url.queryParameters['q'] ?? ''
  };
}

String quickSourceUrl(String collectionId,
        {String entry = '', List<String> path = const []}) =>
    Uri.https('novelai.quicktagcloud.com', '/', {
      'c': collectionId,
      if (entry.isNotEmpty) 'entry': entry,
      if (path.isNotEmpty) 'p': quickPathCode(path)
    }).toString();

String quickCollectionType(Object? type) =>
    type is String && type.isNotEmpty ? type : 'other';
String quickResolveCollection(List<Map<String, dynamic>> catalog, String id) {
  if (id.isEmpty || catalog.any((c) => c['id'] == id)) return id;
  final matches = catalog
      .where((c) => c['aliases'] is List && (c['aliases'] as List).contains(id))
      .toList();
  if (matches.length != 1) {
    throw const FormatException(
        'QuickTagCloud collection alias is unknown or ambiguous');
  }
  return matches.single['id'] as String;
}

Map<String, dynamic> quickCatalogNavigation(
    List<Map<String, dynamic>> catalog, bool safeOnly) {
  final available =
      catalog.where((c) => !safeOnly || c['nsfw'] != true).toList();
  final types = {
    'codex',
    'string',
    'composition',
    'pack',
    ...catalog.map((c) => quickCollectionType(c['type']))
  };
  int entries(Iterable<Map<String, dynamic>> items) => items.fold(
      0, (sum, c) => sum + ((c['entryCount'] as num?)?.toInt() ?? 0));
  return {
    'collections': available
        .map((c) => {
              'id': c['id'],
              'title': c['title'],
              'count': c['entryCount'] ?? 0,
              'type': quickCollectionType(c['type']),
              'version': c['version'] ?? ''
            })
        .toList(),
    'groups': types
        .map((id) => {
              'id': id,
              'count': catalog
                  .where((c) => quickCollectionType(c['type']) == id)
                  .length,
              'visible': available
                  .where((c) => quickCollectionType(c['type']) == id)
                  .length,
              'entries': entries(
                  catalog.where((c) => quickCollectionType(c['type']) == id))
            })
        .where((g) => (g['count'] as int) > 0)
        .toList(),
    'catalogTotal': catalog.length,
    'catalogEntries': entries(catalog),
    'hiddenCollections': catalog.length - available.length,
  };
}
