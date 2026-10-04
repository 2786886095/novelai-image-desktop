import 'package:flutter/material.dart';
import '../agent/model_selections.dart';
import '../agent/agent_provider.dart';
import '../agent/agent_provider_catalog.dart';
import '../models/nai_models.dart';
import '../i18n/studio_agent_text.dart';
import '../ui/studio_dropdown.dart';

class StudioModelCollection extends StatefulWidget {
  final AppSettings draft;
  final String apiKey;
  final bool disabled;
  final ValueChanged<AppSettings> onChanged;
  const StudioModelCollection(
      {super.key,
      required this.draft,
      required this.apiKey,
      required this.disabled,
      required this.onChanged});
  @override
  State<StudioModelCollection> createState() => _StudioModelCollectionState();
}

class _StudioModelCollectionState extends State<StudioModelCollection> {
  final provider = AgentProviderClient();
  List<AgentDiscoveredModel> found = [];
  String query = '', message = '';
  bool busy = false;
  int sequence = 0;
  String t(String key) => studioAgentText(widget.draft.language, key);
  @override
  void didUpdateWidget(StudioModelCollection old) {
    super.didUpdateWidget(old);
    if (agentProviderKey(old.draft) != agentProviderKey(widget.draft) ||
        old.apiKey != widget.apiKey) {
      sequence++;
      found = [];
      message = '';
      busy = false;
      provider.abort();
    }
  }

  @override
  void dispose() {
    sequence++;
    provider.abort();
    super.dispose();
  }

  void change(List<Map<String, dynamic>> values,
      {Map<String, dynamic>? active}) {
    final settings = AppSettings.fromJson(widget.draft.toJson())
      ..savedAgentModels = normalizeSavedAgentModels(values);
    if (active != null) applyAgentModel(settings, active);
    widget.onChanged(settings);
  }

  void remove(String id) {
    final all = normalizeSavedAgentModels(widget.draft.savedAgentModels),
        key = agentProviderKey(widget.draft);
    final next =
        all.where((p) => p['providerKey'] != key || p['id'] != id).toList();
    final settings = AppSettings.fromJson(
        {...widget.draft.toJson(), 'savedAgentModels': next});
    if (settings.agentApiModel == id) {
      final replacement =
          next.where((p) => p['providerKey'] == key).firstOrNull;
      if (replacement != null) {
        applyAgentModel(settings, replacement);
      } else {
        settings.agentApiModel = '';
      }
    }
    widget.onChanged(settings);
  }

  Future<void> discover() async {
    final id = ++sequence;
    setState(() {
      busy = true;
      message = '';
    });
    try {
      final models = await provider.discoverModels(
          settings: widget.draft,
          apiKey: widget.apiKey,
          protocol: widget.draft.agentApiProtocol,
          baseUrl: widget.draft.agentApiBaseUrl);
      if (mounted && id == sequence) {
        setState(() {
          found = models;
          message = t(models.isEmpty ? 'emptyModels' : 'foundModels');
        });
      }
    } catch (_) {
      if (mounted && id == sequence) {
        setState(() => message = t('failedModels'));
      }
    } finally {
      if (mounted && id == sequence) setState(() => busy = false);
    }
  }

  void add(String id, {String? name, int? context, int? output, bool? vision}) {
    final all = normalizeSavedAgentModels(widget.draft.savedAgentModels),
        key = agentProviderKey(widget.draft);
    if (all.any((p) => p['providerKey'] == key && p['id'] == id)) return;
    final item = normalizeSavedAgentModels([
      {
        'providerKey': key,
        'id': id,
        'displayName': name ?? id,
        'contextWindow': context ?? widget.draft.agentContextWindow,
        'maxOutputTokens': output ?? widget.draft.agentMaxOutputTokens,
        'vision': vision ?? widget.draft.agentVisionEnabled,
        'reasoningEffort': 'auto'
      }
    ]).single;
    change([...all, item],
        active: widget.draft.agentApiModel.isEmpty ? item : null);
  }

  @override
  Widget build(BuildContext context) {
    final all = normalizeSavedAgentModels(widget.draft.savedAgentModels),
        key = agentProviderKey(widget.draft),
        selected = all.where((p) => p['providerKey'] == key).toList(),
        filtered = found
            .where((p) => '${p.id} ${p.displayName}'
                .toLowerCase()
                .contains(query.toLowerCase()))
            .toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, children: [
        OutlinedButton(
            onPressed: widget.disabled || busy ? null : discover,
            child: Text(t(busy ? 'statusRunning' : 'loadModels'))),
        OutlinedButton(
            onPressed:
                widget.disabled || widget.draft.agentApiModel.trim().isEmpty
                    ? null
                    : () => add(widget.draft.agentApiModel.trim()),
            child: Text(t('addModel')))
      ]),
      if (message.isNotEmpty) Text(message),
      if (found.isNotEmpty) ...[
        TextField(
            decoration: InputDecoration(labelText: t('searchModels')),
            onChanged: (v) => setState(() => query = v)),
        ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: ListView(shrinkWrap: true, children: [
              for (final m in filtered.take(80))
                CheckboxListTile(
                    dense: true,
                    value: selected.any((p) => p['id'] == m.id),
                    title: Text(m.displayName,
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(m.id,
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                    onChanged: widget.disabled
                        ? null
                        : (v) => v == true
                            ? add(m.id,
                                name: m.displayName,
                                context: m.contextWindow,
                                output: m.suggestedOutputTokens ??
                                    m.maxOutputTokens,
                                vision: m.vision)
                            : remove(m.id))
            ])),
        if (filtered.length > 80) Text(t('filterModelsHint'))
      ],
      Text(t('selectedModels')),
      for (final m in selected)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(children: [
              Row(children: [
                Expanded(
                    child: TextButton(
                        onPressed: widget.disabled
                            ? null
                            : () => change(all, active: m),
                        child: Text('${m['displayName']}',
                            maxLines: 2, overflow: TextOverflow.ellipsis))),
                IconButton(
                    tooltip: t('removeModel'),
                    onPressed: widget.disabled
                        ? null
                        : () => remove(m['id'] as String),
                    icon: const Icon(Icons.close))
              ]),
              TextFormField(
                  key: ValueKey('context:${m['id']}'),
                  initialValue: '${m['contextWindow']}',
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: t('contextWindow')),
                  onChanged: (v) {
                    final number = int.tryParse(v);
                    if (number == null) return;
                    final updated = {...m, 'contextWindow': number};
                    change(
                        all.map((p) => identical(p, m) ? updated : p).toList(),
                        active: widget.draft.agentApiModel == m['id']
                            ? normalizeSavedAgentModels([updated]).single
                            : null);
                  }),
              StudioDropdownButtonFormField<String>(
                  value: agentEffort(m['reasoningEffort']),
                  isExpanded: true,
                  decoration: InputDecoration(labelText: t('reasoningLevel')),
                  items: [
                    for (final v in ['auto', 'low', 'medium', 'high'])
                      DropdownMenuItem(value: v, child: Text(t('reasoning_$v')))
                  ],
                  onChanged: widget.disabled
                      ? null
                      : (v) {
                          final updated = {...m, 'reasoningEffort': v};
                          change(
                              all
                                  .map((p) => identical(p, m) ? updated : p)
                                  .toList(),
                              active: widget.draft.agentApiModel == m['id']
                                  ? updated
                                  : null);
                        })
            ]))
    ]);
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
