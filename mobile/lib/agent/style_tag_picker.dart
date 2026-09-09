import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import '../artist/random_custom_tag_library.dart';
import '../state/app_state.dart';
import 'image_ui.dart';
import 'style_draw.dart';

Future<String?> showTavernStyleTags(BuildContext context, AppState app) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => TavernStyleTagPicker(app: app),
    );

class TavernStyleTagPicker extends StatefulWidget {
  final AppState app;
  const TavernStyleTagPicker({super.key, required this.app});
  @override
  State<TavernStyleTagPicker> createState() => _TavernStyleTagPickerState();
}

class _TavernStyleTagPickerState extends State<TavernStyleTagPicker> {
  final selected = <String>[], pinned = <String>[];
  final search = TextEditingController(),
      count = TextEditingController(text: '3'),
      low = TextEditingController(text: '0.2'),
      high = TextEditingController(text: '1.2'),
      seed = TextEditingController(text: '1');
  String scope = 'builtin', preview = '';
  int limit = 80, total = 0, revision = 0;
  bool loading = false, failed = false;
  Timer? timer;
  List<({String tag, String label})> items = [];
  bool get dynamicScope => scope == 'style' || scope == 'copyright';
  Map<String, String> get ui => imageUi(widget.app.settings.language);
  @override
  void dispose() {
    timer?.cancel();
    for (final c in [search, count, low, high, seed]) {
      c.dispose();
    }
    super.dispose();
  }

  void load({bool reset = false}) {
    if (reset) {
      limit = 80;
      items = [];
    }
    final id = ++revision;
    timer?.cancel();
    if (!dynamicScope) {
      setState(() {
        loading = false;
        failed = false;
      });
      return;
    }
    setState(() {
      loading = true;
      failed = false;
    });
    timer = Timer(const Duration(milliseconds: 180), () async {
      try {
        final result = await widget.app.offlineTags.browseArtistStyleCatalog(
            scope: scope, query: search.text, offset: items.length, limit: 80);
        if (!mounted || id != revision) return;
        setState(() {
          items = [
            ...items,
            ...result.items
                .map((e) => (tag: e.tag, label: e.chinese.join(' / ')))
          ];
          total = result.total;
          loading = false;
        });
      } catch (_) {
        if (mounted && id == revision) {
          setState(() {
            loading = false;
            failed = true;
          });
        }
      }
    });
  }

  void toggle(String tag) => setState(() {
        selected.contains(tag) ? selected.remove(tag) : selected.add(tag);
        pinned.remove(tag);
        preview = '';
      });
  Widget number(TextEditingController c, String label) => SizedBox(
      width: 140,
      child: TextField(
          controller: c,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: label),
          onChanged: (_) => setState(() => preview = '')));
  @override
  Widget build(BuildContext context) {
    final lang = widget.app.settings.language;
    final builtin = <({String tag, String label})>[];
    for (final c in randomCustomTagLibrary) {
      if (scope != 'builtin' && scope != c.id) continue;
      for (final t in c.tags) {
        if ('${t.tag} ${t.labels.values.join(' ')}'
            .toLowerCase()
            .contains(search.text.trim().toLowerCase())) {
          builtin.add((tag: t.tag, label: t.label(lang)));
        }
      }
    }
    final visible = dynamicScope ? items : builtin.take(limit).toList();
    return SizedBox(
        height: MediaQuery.sizeOf(context).height * .85,
        child: Padding(
            padding: EdgeInsets.fromLTRB(
                16, 12, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Expanded(
                        child: Text(ui['library']!,
                            style: Theme.of(context).textTheme.titleMedium)),
                    IconButton(
                        tooltip: ui['close'],
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close))
                  ]),
                  Expanded(
                      child: ListView(children: [
                    Text(ui['hint']!,
                        style: Theme.of(context).textTheme.bodySmall),
                    DropdownButtonFormField<String>(
                        value: scope,
                        isExpanded: true,
                        items: [
                          DropdownMenuItem(
                              value: 'builtin', child: Text(ui['all']!)),
                          ...randomCustomTagLibrary.map((c) => DropdownMenuItem(
                              value: c.id, child: Text(c.label(lang)))),
                          DropdownMenuItem(
                              value: 'style', child: Text(ui['local']!)),
                          DropdownMenuItem(
                              value: 'copyright', child: Text(ui['works']!))
                        ],
                        onChanged: (v) {
                          scope = v ?? 'builtin';
                          load(reset: true);
                        }),
                    if (scope == 'copyright')
                      Text(ui['worksHint']!,
                          style: Theme.of(context).textTheme.bodySmall),
                    TextField(
                        controller: search,
                        decoration: InputDecoration(
                            labelText: ui['search'],
                            prefixIcon: const Icon(Icons.search)),
                        onChanged: (_) => load(reset: true)),
                    const SizedBox(height: 6),
                    if (loading) Text(ui['loading']!),
                    if (failed)
                      TextButton(
                          onPressed: () => load(), child: Text(ui['error']!)),
                    for (final e in visible)
                      CheckboxListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          value: selected.contains(e.tag),
                          onChanged: (_) => toggle(e.tag),
                          title: Text(e.tag),
                          subtitle: Text(e.label),
                          controlAffinity: ListTileControlAffinity.leading),
                    if (!loading && !failed && visible.isEmpty)
                      Text(ui['empty']!),
                    if (visible.length <
                        (dynamicScope ? total : builtin.length))
                      TextButton(
                          onPressed: loading
                              ? null
                              : () {
                                  limit += 80;
                                  load();
                                },
                          child: Text(
                              '${ui['more']} (${visible.length}/${dynamicScope ? total : builtin.length})')),
                    if (selected.isNotEmpty)
                      ExpansionTile(
                          title: Text(
                              '${ui['selected']} ${selected.length} · ${ui['pin']}'),
                          children: [
                            for (final tag in selected)
                              CheckboxListTile(
                                  dense: true,
                                  title: Text(tag),
                                  value: pinned.contains(tag),
                                  onChanged: (_) => setState(() {
                                        pinned.contains(tag)
                                            ? pinned.remove(tag)
                                            : pinned.add(tag);
                                        preview = '';
                                      }),
                                  secondary: IconButton(
                                      tooltip: ui['clear'],
                                      onPressed: () => toggle(tag),
                                      icon: const Icon(Icons.close)))
                          ]),
                    Wrap(spacing: 10, runSpacing: 10, children: [
                      number(count, ui['count']!),
                      number(low, ui['min']!),
                      number(high, ui['max']!),
                      number(seed, ui['seed']!)
                    ]),
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      TextButton(
                          onPressed: selected.isEmpty
                              ? null
                              : () => setState(() {
                                    seed.text =
                                        '${Random().nextInt(0x7fffffff)}';
                                    preview = drawStyleTags(
                                        selected,
                                        pinned,
                                        (int.tryParse(count.text) ?? 3)
                                            .clamp(0, 50),
                                        double.tryParse(low.text) ?? 0.2,
                                        double.tryParse(high.text) ?? 1.2,
                                        int.parse(seed.text));
                                  }),
                          child: Text('↻ ${ui['reroll']}')),
                      TextButton(
                          onPressed: selected.isEmpty
                              ? null
                              : () => setState(() => preview = drawStyleTags(
                                  selected,
                                  pinned,
                                  (int.tryParse(count.text) ?? 3).clamp(0, 50),
                                  double.tryParse(low.text) ?? 0.2,
                                  double.tryParse(high.text) ?? 1.2,
                                  int.tryParse(seed.text) ?? 1)),
                          child: Text(ui['draw']!))
                    ]),
                    if (preview.isNotEmpty) SelectableText(preview),
                  ])),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    OutlinedButton(
                        onPressed: selected.isEmpty
                            ? null
                            : () => Navigator.pop(context, selected.join(', ')),
                        child: Text(ui['add']!)),
                    FilledButton(
                        onPressed: preview.isEmpty
                            ? null
                            : () => Navigator.pop(context, preview),
                        child: Text(ui['apply']!))
                  ]),
                ])));
  }
}
