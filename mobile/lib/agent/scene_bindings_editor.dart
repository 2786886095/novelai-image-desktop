import 'dart:convert';
import 'package:flutter/material.dart';
import '../ui/studio_theme.dart';
import 'scene_bindings.dart';
import 'scene_bindings_ui.dart';
import 'scene_user_actions.dart';
import 'tavern_models.dart';

Future<Map<String, dynamic>?> showSceneBindingsEditor(
        BuildContext context, Map<String, dynamic> scene, String language,
        {bool readOnly = false,
        Future<void> Function(Map<String, dynamic>)? onSave}) =>
    showModalBottomSheet<Map<String, dynamic>>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        // A dirty editor owns its close confirmation, including Android back.
        isDismissible: false,
        enableDrag: false,
        builder: (_) => FractionallySizedBox(
            heightFactor: .94,
            child: SceneBindingsEditor(
                scene: scene,
                language: language,
                readOnly: readOnly,
                onSave: onSave)));

class SceneBindingsEditor extends StatefulWidget {
  final Map<String, dynamic> scene;
  final String language;
  final bool readOnly;
  final Future<void> Function(Map<String, dynamic>)? onSave;
  const SceneBindingsEditor(
      {super.key,
      required this.scene,
      required this.language,
      this.readOnly = false,
      this.onSave});
  @override
  State<SceneBindingsEditor> createState() => _SceneBindingsEditorState();
}

class _SceneBindingsEditorState extends State<SceneBindingsEditor> {
  late Map<String, dynamic> scene;
  final history = <Map<String, dynamic>>[];
  String? error;
  bool saving = false, allowPop = false, confirmingClose = false;
  Map<String, String> get ui =>
      sceneBindingsUi[widget.language] ?? sceneBindingsUi['en-US']!;
  bool get readOnly => widget.readOnly || saving;
  bool get dirty =>
      canonicalSceneValue(scene) != canonicalSceneValue(widget.scene);
  @override
  void initState() {
    super.initState();
    scene = jsonDecode(jsonEncode(widget.scene));
  }

  void failed(Object caught) {
    if (!mounted) return;
    final code = caught is StateError ? caught.message.toString() : '';
    setState(() => error = ui[code] ?? ui['saveFailed']);
  }

  void accept(Map<String, dynamic> next) => setState(() {
        history.add(scene);
        if (history.length > 20) history.removeAt(0);
        scene = next;
        error = null;
      });
  bool locked(String? id) {
    final e = (scene['entities'] as List)
        .cast<Map>()
        .where((e) => e['id'] == id)
        .firstOrNull;
    return e?['locked'] == true ||
        (e != null &&
            ['ownerId', 'wearerId'].any((k) =>
                e[k] != null &&
                (scene['entities'] as List)
                    .any((p) => p['id'] == e[k] && p['locked'] == true)));
  }

  void commit(String collection, Map? before, Map? after) {
    if (readOnly) return;
    try {
      accept(applyScenePatch(
          scene,
          {
            'revision': scene['revision'],
            'operations': [
              {
                'collection': collection,
                'id': (before ?? after)!['id'],
                'before': before,
                'after': after
              }
            ]
          },
          byUser: true));
    } catch (caught) {
      failed(caught);
    }
  }

  Future<void> close() async {
    if (saving || confirmingClose) return;
    if (dirty && !widget.readOnly) {
      confirmingClose = true;
      final discard = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text(ui['discardTitle']!),
                  content: Text(ui['discardHint']!),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: Text(ui['keepEditing']!)),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: Text(ui['discard']!))
                  ]));
      confirmingClose = false;
      if (discard != true || !mounted) return;
    }
    setState(() => allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pop(context);
    });
  }

  Future<void> save() async {
    if (readOnly) return;
    setState(() {
      saving = true;
      error = null;
    });
    try {
      await widget.onSave?.call(scene);
      if (!mounted) return;
      setState(() {
        allowPop = true;
        saving = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pop(context, scene);
      });
    } catch (caught) {
      if (!mounted) return;
      setState(() => saving = false);
      failed(caught);
    }
  }

  Future<void> edit(
      String collection, Map row, String field, String heading) async {
    final result = await showDialog<Map<String, String>>(
        context: context,
        builder: (_) => _SceneFieldsDialog(
            ui: ui,
            title: heading,
            allowEmptyPrompt: collection == 'facts',
            values: {field: row[field] as String? ?? ''}));
    if (result != null && mounted) {
      commit(collection, row, {...row, field: result[field]});
    }
  }

  Future<void> add(String id) async {
    final result = await showDialog<Map<String, String>>(
        context: context,
        builder: (_) => _SceneFieldsDialog(
            ui: ui,
            title: ui['add']!,
            allowEmptyPrompt: true,
            values: const {'slot': '', 'prompt': ''}));
    if (result != null && mounted) {
      commit(
          'facts', null, {'id': tavernId('fact'), 'entityId': id, ...result});
    }
  }

  Future<void> removeEntity(Map item) async {
    if (readOnly || locked(item['id'])) return;
    try {
      final plan = sceneEntityRemoval(scene, item['id']);
      final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text('${ui['removeEntity']}: ${item['name']}'),
                  content: SingleChildScrollView(
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text(ui['removeHint']!),
                        const SizedBox(height: StudioSpacing.sm),
                        Text(
                            '${ui['removeCounts']}: ${(plan['facts'] as List).length} / ${(plan['relations'] as List).length}'),
                        if ((plan['affected'] as List).isNotEmpty)
                          Text(
                              '${ui['detachItems']}: ${(plan['affected'] as List).map((e) => e['name']).join(', ')}')
                      ])),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: Text(ui['cancel']!)),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: Text(ui['remove']!))
                  ]));
      if (confirmed == true && mounted && !readOnly) {
        accept(applyScenePatch(scene, plan['patch'], byUser: true));
      }
    } catch (caught) {
      failed(caught);
    }
  }

  Widget lock(String collection, Map row,
          {bool parentLocked = false}) =>
      IconButton(
          tooltip:
              '${ui['locked']}: ${row['name'] ?? row['slot'] ?? row['id']}',
          isSelected: row['locked'] == true,
          onPressed: readOnly || parentLocked
              ? null
              : () => commit(
                  collection, row, {...row, 'locked': row['locked'] != true}),
          icon: Icon(row['locked'] == true ? Icons.lock : Icons.lock_open));
  List<Widget> facts(String id) => [
        for (final f in (scene['facts'] as List)
            .cast<Map>()
            .where((f) => f['entityId'] == id))
          ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(f['slot']),
              subtitle: Text(f['prompt']),
              onTap: readOnly || f['locked'] == true || locked(id)
                  ? null
                  : () =>
                      edit('facts', f, 'prompt', '${name(id)} / ${f['slot']}'),
              trailing: widget.readOnly
                  ? null
                  : Row(mainAxisSize: MainAxisSize.min, children: [
                      lock('facts', f, parentLocked: locked(id)),
                      IconButton(
                          tooltip: '${ui['remove']}: ${f['slot']}',
                          onPressed:
                              readOnly || f['locked'] == true || locked(id)
                                  ? null
                                  : () => commit('facts', f, null),
                          icon: const Icon(Icons.delete_outline))
                    ])),
        if (!widget.readOnly && !locked(id))
          Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                  onPressed: saving ? null : () => add(id),
                  icon: const Icon(Icons.add),
                  label: Text(ui['add']!)))
      ];
  String name(String id) =>
      (scene['entities'] as List)
          .cast<Map>()
          .where((e) => e['id'] == id)
          .firstOrNull?['name'] as String? ??
      ui['scene']!;
  String endpoint(String id, dynamic part) =>
      '${name(id)}${part is String && part.trim().isNotEmpty ? ' ($part)' : ''}';
  Widget entity(Map e) => ExpansionTile(
          key: ValueKey(e['id']),
          title: Text(e['name']),
          leading: widget.readOnly ? null : lock('entities', e),
          children: [
            for (final field in ['name', 'prompt'])
              ListTile(
                  title: Text(ui[field]!),
                  subtitle: Text(e[field]),
                  trailing: !readOnly && !locked(e['id'])
                      ? const Icon(Icons.edit_outlined, size: 18)
                      : null,
                  onTap: readOnly || locked(e['id'])
                      ? null
                      : () => edit('entities', e, field, e['name'])),
            if (e['kind'] != 'character')
              for (final key in [
                'ownerId',
                if (e['kind'] == 'garment') 'wearerId'
              ])
                Padding(
                    padding: const EdgeInsets.all(StudioSpacing.sm),
                    child: DropdownButtonFormField<String>(
                        value: e[key] as String? ?? '',
                        isExpanded: true,
                        decoration: InputDecoration(
                            labelText:
                                key == 'ownerId' ? ui['owner'] : ui['wearer']),
                        items: [
                          const DropdownMenuItem(value: '', child: Text('—')),
                          for (final p in (scene['entities'] as List)
                              .where((x) => x['kind'] == 'character'))
                            DropdownMenuItem(
                                value: p['id'] as String,
                                child: Text(p['name']))
                        ],
                        onChanged: readOnly || locked(e['id'])
                            ? null
                            : (value) {
                                final next = {...e};
                                if (value == null || value.isEmpty) {
                                  next.remove(key);
                                } else {
                                  next[key] = value;
                                }
                                commit('entities', e, next);
                              })),
            ...facts(e['id']),
            if (!widget.readOnly)
              Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                      key: ValueKey('remove-${e['id']}'),
                      onPressed: saving || locked(e['id'])
                          ? null
                          : () => removeEntity(e),
                      icon: const Icon(Icons.delete_outline),
                      label: Text(ui['removeEntity']!))),
            if (e['kind'] == 'character')
              for (final g in (scene['entities'] as List)
                  .cast<Map>()
                  .where((g) => g['wearerId'] == e['id']))
                entity(g),
          ]);
  @override
  Widget build(BuildContext context) {
    if (readSceneBindings(scene) == null) {
      return Center(child: Text(ui['error']!));
    }
    return PopScope(
        canPop: allowPop || (!dirty && !saving),
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) close();
        },
        child: Scaffold(
            appBar: AppBar(
                title: Text(ui['title']!),
                leading: IconButton(
                    tooltip: ui['cancel'],
                    onPressed: saving ? null : close,
                    icon: const Icon(Icons.close)),
                actions: [
                  if (!widget.readOnly)
                    TextButton(
                        onPressed: saving ? null : save,
                        child: saving
                            ? Row(mainAxisSize: MainAxisSize.min, children: [
                                const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2)),
                                const SizedBox(width: StudioSpacing.sm),
                                Text(ui['saving']!)
                              ])
                            : Text(ui['save']!))
                ]),
            body: ListView(
                padding: const EdgeInsets.all(StudioSpacing.lg),
                children: [
                  Text(ui['source']!),
                  if (error != null)
                    Semantics(
                        liveRegion: true,
                        child: Text(error!,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error))),
                  if (history.isNotEmpty && !widget.readOnly)
                    TextButton.icon(
                        onPressed: saving
                            ? null
                            : () => setState(() {
                                  final revision = scene['revision'] as int;
                                  scene = history.removeLast();
                                  scene['revision'] = revision + 1;
                                  error = null;
                                }),
                        icon: const Icon(Icons.undo),
                        label: Text(ui['undo']!)),
                  for (final e in (scene['entities'] as List).cast<Map>().where(
                      (e) => e['kind'] == 'character' || e['wearerId'] == null))
                    entity(e),
                  ExpansionTile(
                      title: Text(ui['scene']!), children: facts('scene')),
                  if ((scene['relations'] as List).isNotEmpty)
                    ExpansionTile(title: Text(ui['relations']!), children: [
                      for (final r in (scene['relations'] as List).cast<Map>())
                        ListTile(
                            title: Text(
                                '${endpoint(r['actorId'], r['actorPart'])} → ${endpoint(r['targetId'], r['targetPart'])}'),
                            subtitle: Text(r['action']),
                            onTap: readOnly ||
                                    r['locked'] == true ||
                                    locked(r['actorId']) ||
                                    locked(r['targetId'])
                                ? null
                                : () => edit(
                                    'relations', r, 'action', ui['relations']!),
                            trailing: widget.readOnly
                                ? null
                                : lock('relations', r,
                                    parentLocked: locked(r['actorId']) ||
                                        locked(r['targetId'])))
                    ])
                ])));
  }
}

/// Controllers live until the dialog route is disposed, not merely until pop completes.
class _SceneFieldsDialog extends StatefulWidget {
  final Map<String, String> ui, values;
  final String title;
  final bool allowEmptyPrompt;
  const _SceneFieldsDialog(
      {required this.ui,
      required this.title,
      required this.values,
      this.allowEmptyPrompt = false});
  @override
  State<_SceneFieldsDialog> createState() => _SceneFieldsDialogState();
}

class _SceneFieldsDialogState extends State<_SceneFieldsDialog> {
  final form = GlobalKey<FormState>();
  late final inputs =
      widget.values.map((k, v) => MapEntry(k, TextEditingController(text: v)));
  @override
  void dispose() {
    for (final c in inputs.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text(widget.title),
          content: SingleChildScrollView(
              child: Form(
                  key: form,
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    for (final item in inputs.entries)
                      TextFormField(
                          controller: item.value,
                          autofocus: item.key == inputs.keys.first,
                          maxLines: item.key == 'prompt' || item.key == 'action'
                              ? 3
                              : 1,
                          maxLength: item.key == 'slot'
                              ? 80
                              : item.key == 'name'
                                  ? 160
                                  : null,
                          decoration: InputDecoration(
                              labelText:
                                  widget.ui[item.key] ?? widget.ui['prompt']),
                          validator: (value) =>
                              item.key == 'prompt' && widget.allowEmptyPrompt
                                  ? null
                                  : value == null || value.trim().isEmpty
                                      ? widget.ui['SCENE_INVALID']
                                      : null),
                  ]))),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(widget.ui['cancel']!)),
            FilledButton(
                onPressed: () {
                  if (form.currentState!.validate()) {
                    Navigator.pop(
                        context, inputs.map((k, v) => MapEntry(k, v.text)));
                  }
                },
                child: Text(widget.ui['save']!))
          ]);
}
