import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/quicktag_ui.dart';

class QuickTagNavigation extends StatefulWidget {
  final Map<String, dynamic>? navigation;
  final String collectionId;
  final bool searchAll, loading;
  final int pageSize;
  final Object? language;
  final void Function(String, List<String>) onSelect;
  final ValueChanged<bool> onScope;
  final ValueChanged<int> onPageSize;
  final ValueChanged<String>? onGroup;
  const QuickTagNavigation(
      {super.key,
      required this.navigation,
      required this.collectionId,
      required this.searchAll,
      required this.loading,
      required this.language,
      required this.onSelect,
      required this.onScope,
      required this.pageSize,
      required this.onPageSize,
      this.onGroup});
  @override
  State<QuickTagNavigation> createState() => _QuickTagNavigationState();
}

class _QuickTagNavigationState extends State<QuickTagNavigation> {
  final expanded = <String>{};
  final filter = TextEditingController();
  @override
  void didUpdateWidget(QuickTagNavigation oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.collectionId != widget.collectionId) {
      expanded.clear();
      filter.clear();
    }
  }

  @override
  void dispose() {
    filter.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ui = quickTagUi(widget.language), nav = widget.navigation;
    final active = List<String>.from(nav?['categoryPath'] ?? []);
    final type = nav?['collectionType'] ?? '';
    final collections =
        List<Map<String, dynamic>>.from(nav?['collections'] ?? [])
            .where((c) => type == '' || c['type'] == type)
            .toList();
    final groups = List<Map<String, dynamic>>.from(nav?['groups'] ?? []);
    final categories =
        List<Map<String, dynamic>>.from(nav?['categories'] ?? []);
    bool prefix(List a, List b) =>
        a.length <= b.length && a.indexed.every((p) => b[p.$1] == p.$2);
    bool isOpen(List path) =>
        expanded.contains(jsonEncode(path)) ||
        (path.length < active.length && prefix(path, active));
    final query = filter.text.trim().toLowerCase();
    final matches = categories.where(
        (c) => (c['path'] as List).join(' › ').toLowerCase().contains(query));
    final visible = categories.where((c) {
      final path = c['path'] as List;
      return query.isNotEmpty
          ? matches.any((m) => prefix(path, m['path'] as List))
          : List.generate(path.length - 1, (i) => path.take(i + 1).toList())
              .every(isOpen);
    }).toList();
    String fill(String key, Map<String, Object> values) => values.entries
        .fold(ui[key]!, (s, e) => s.replaceAll('{${e.key}}', '${e.value}'));
    final failures = List<String>.from(nav?['failedCollections'] ?? []);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 6, runSpacing: 6, children: [
        ChoiceChip(
            label: Text(ui['sections']!),
            selected: type == '',
            onSelected:
                widget.loading ? null : (_) => widget.onGroup?.call('')),
        ...groups.map((g) => ChoiceChip(
            label: Text(
                '${ui[g['id']] ?? g['id']} ${g['visible'] == g['count'] ? g['count'] : "${g['visible']}/${g['count']}"}'),
            selected: type == g['id'],
            onSelected: widget.loading
                ? null
                : (_) => widget.onGroup?.call(g['id'] as String))),
      ]),
      if (nav?['catalogTotal'] != null)
        Text(
            fill('inventory', {
              'books': nav!['catalogTotal'],
              'entries': nav['catalogEntries']
            }),
            style: Theme.of(context).textTheme.bodySmall),
      if ((nav?['hiddenCollections'] as int? ?? 0) > 0)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(fill('hidden', {'count': nav!['hiddenCollections']}))),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(
          value: collections.any((c) => c['id'] == widget.collectionId)
              ? widget.collectionId
              : '',
          isExpanded: true,
          decoration: InputDecoration(labelText: ui['catalog']),
          items: [
            DropdownMenuItem(value: '', child: Text(ui['catalog']!)),
            ...collections.map((c) => DropdownMenuItem(
                value: c['id'] as String,
                child: Text('${c['title']} (${c['count']})',
                    maxLines: 1, overflow: TextOverflow.ellipsis)))
          ],
          onChanged:
              widget.loading ? null : (id) => widget.onSelect(id ?? '', [])),
      if (widget.collectionId.isNotEmpty) ...[
        const SizedBox(height: 8),
        Wrap(spacing: 4, children: [
          TextButton(
              onPressed: widget.loading
                  ? null
                  : () => widget.onSelect(widget.collectionId, []),
              child: Text(ui['all']!)),
          ...active.indexed.map((p) => TextButton(
              onPressed: widget.loading
                  ? null
                  : () => widget.onSelect(
                      widget.collectionId, active.take(p.$1 + 1).toList()),
              child: Text(p.$2))),
        ]),
        if (nav?['loadedCount'] != null)
          Text(
              fill('loaded', {
                'declared': nav!['declaredCount'],
                'loaded': nav['loadedCount']
              }),
              style: Theme.of(context).textTheme.bodySmall),
        TextField(
            controller: filter,
            decoration: InputDecoration(
                labelText: ui['findCategory'],
                prefixIcon: const Icon(Icons.search)),
            onChanged: (_) => setState(() {})),
        ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: ListView.builder(
                primary: false,
                shrinkWrap: true,
                itemCount: visible.length,
                itemBuilder: (context, index) {
                  final c = visible[index],
                      path = List<String>.from(c['path']),
                      key = jsonEncode(path);
                  final hasChildren = categories.any((n) =>
                      (n['path'] as List).length == path.length + 1 &&
                      prefix(path, n['path'] as List));
                  return Padding(
                      padding: EdgeInsetsDirectional.only(
                          start:
                              ((path.length - 1).clamp(0, 8) * 12).toDouble()),
                      child: Row(children: [
                        if (hasChildren)
                          IconButton(
                              tooltip: path.join(' › '),
                              constraints: const BoxConstraints(
                                  minWidth: 36, minHeight: 40),
                              icon: Icon(isOpen(path) || query.isNotEmpty
                                  ? Icons.expand_more
                                  : Icons.chevron_right),
                              onPressed: () => setState(() {
                                    expanded.contains(key)
                                        ? expanded.remove(key)
                                        : expanded.add(key);
                                  }))
                        else
                          const SizedBox(width: 36),
                        Expanded(
                            child: TextButton(
                                style: key == jsonEncode(active)
                                    ? TextButton.styleFrom(
                                        backgroundColor: Theme.of(context)
                                            .colorScheme
                                            .secondaryContainer)
                                    : null,
                                onPressed: widget.loading
                                    ? null
                                    : () => widget.onSelect(
                                        widget.collectionId, path),
                                child: Row(children: [
                                  Expanded(child: Text(path.last)),
                                  const SizedBox(width: 8),
                                  Text('${c['count']}')
                                ]))),
                      ]));
                })),
        if (visible.isEmpty) Text(ui['emptyCategory']!),
      ],
      CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(ui['scope']!),
          value: widget.searchAll,
          onChanged: widget.loading ? null : (v) => widget.onScope(v ?? false)),
      Text(ui['hint']!, style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: 8),
      DropdownButtonFormField<int>(
          value: widget.pageSize,
          isExpanded: true,
          decoration: InputDecoration(labelText: ui['perPage']),
          items: [12, 24, 48, 60]
              .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
              .toList(),
          onChanged: widget.loading ? null : (n) => widget.onPageSize(n ?? 12)),
      if (failures.isNotEmpty)
        Text('${ui['partial']}${failures.join(' · ')}',
            style: TextStyle(color: Theme.of(context).colorScheme.error)),
      const SizedBox(height: 8),
    ]);
  }
}
