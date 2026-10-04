import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/nai_api.dart';
import '../ui/studio_dropdown.dart';

class McpToolSettings extends StatefulWidget {
  const McpToolSettings({super.key});
  @override
  State<McpToolSettings> createState() => _McpToolSettingsState();
}

class _McpToolSettingsState extends State<McpToolSettings> {
  List<Map<String, dynamic>> tools = [];
  bool busy = false;
  String error = '', binding = '';
  int revision = 0;
  Timer? timer;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = context.watch<AppState>().settings;
    final next = '${s.tagServerEnabled}|${s.tagServerType}|${s.tagServerUrl}';
    if (next != binding) {
      binding = next;
      revision++;
      tools = [];
      timer?.cancel();
      if (s.tagServerEnabled && s.tagServerUrl.trim().isNotEmpty) {
        timer = Timer(const Duration(milliseconds: 400), discover);
      }
    }
  }

  @override
  void dispose() {
    revision++;
    timer?.cancel();
    super.dispose();
  }

  Future<void> discover() async {
    final state = context.read<AppState>(), id = ++revision;
    setState(() {
      busy = true;
      error = '';
    });
    try {
      final key = await state.storage.getTagKey() ?? '';
      final found = await state.api.listMcpTools(state.settings, apiKey: key);
      if (mounted && id == revision) setState(() => tools = found);
    } catch (_) {
      if (mounted && id == revision) {
        setState(
            () => error = 'MCP tools/list failed; saved choices retained.');
      }
    } finally {
      if (mounted && id == revision) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(), s = state.settings;
    final zh = s.language.startsWith('zh');
    final values = [
      s.tagServerTool,
      s.tagServerRelatedTool,
      s.tagServerArtistTool
    ];
    final labels = zh
        ? ['标签搜索工具', '关联拓展工具（可选）', '画师推荐工具（可选）']
        : [
            'Tag search tool',
            'Related tags (optional)',
            'Artist recommendations (optional)'
          ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      OutlinedButton(
          onPressed: busy ? null : discover,
          child: Text(busy
              ? 'tools/list…'
              : zh
                  ? '发现工具'
                  : 'Discover tools')),
      if (error.isNotEmpty) Text(error),
      for (var i = 0; i < 3; i++)
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: tools.isEmpty
                ? TextFormField(
                    key: ValueKey('mcp-slot-$i-$binding'),
                    initialValue: values[i],
                    decoration: InputDecoration(labelText: labels[i]),
                    onChanged: (v) => save(state, i, v))
                : StudioDropdownButtonFormField<String>(
                    key: ValueKey('mcp-slot-$i'),
                    value: values[i],
                    decoration: InputDecoration(labelText: labels[i]),
                    items: [
                      if (i > 0)
                        DropdownMenuItem(
                            value: '', child: Text(zh ? '不使用' : 'Disabled')),
                      for (final name in {
                        ...tools.map((t) => t['name'] as String),
                        if (values[i].isNotEmpty) values[i]
                      })
                        DropdownMenuItem(value: name, child: Text(name))
                    ],
                    onChanged: busy
                        ? null
                        : (v) {
                            if (v != null) save(state, i, v);
                          })),
      Text(zh
          ? '发现只读取工具列表，不调用工具。'
          : 'Discovery reads the list without calling tools.')
    ]);
  }

  void save(AppState state, int slot, String value) {
    unawaited(state.setSettings((s) {
      if (slot == 0) {s.tagServerTool = value;}
      else if (slot == 1) {s.tagServerRelatedTool = value;}
      else {s.tagServerArtistTool = value;}
    }));
  }
}

class McpCapsuleSuggestions extends StatefulWidget {
  final void Function(String tag) onPick;
  const McpCapsuleSuggestions({super.key, required this.onPick});
  @override
  State<McpCapsuleSuggestions> createState() => _McpCapsuleSuggestionsState();
}

class _McpCapsuleSuggestionsState extends State<McpCapsuleSuggestions> {
  Timer? timer;
  int revision = 0;
  List<TagSuggestion> tags = [];
  bool busy = false;
  @override
  void dispose() {
    revision++;
    timer?.cancel();
    super.dispose();
  }

  void query(String q) {
    timer?.cancel();
    final id = ++revision;
    setState(() {
      tags = [];
      busy = q.trim().isNotEmpty;
    });
    if (q.trim().isEmpty) return;
    timer = Timer(const Duration(milliseconds: 250), () async {
      final state = context.read<AppState>();
      try {
        final key = await state.storage.getTagKey() ?? '';
        final found = await state.api.searchTags(state.settings, q, 24,
            apiKey: key, fallbackLocal: false);
        if (mounted && id == revision) setState(() => tags = found);
      } catch (_) {
      } finally {
        if (mounted && id == revision) setState(() => busy = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>().settings;
    if (!s.tagServerEnabled || !s.mcpForCapsule) return const SizedBox.shrink();
    return Column(children: [
      TextField(
          decoration: const InputDecoration(labelText: 'MCP'),
          onChanged: query),
      if (busy) const LinearProgressIndicator(),
      Wrap(
          children: tags
              .map((tag) => ActionChip(
                  label: Text(tag.tag),
                  onPressed: () => widget.onPick(tag.tag)))
              .toList())
    ]);
  }
}
