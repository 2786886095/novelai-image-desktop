import 'package:flutter/material.dart';
import '../agent/agent_controller.dart';
import '../agent/studio_options.dart';
import '../agent/tavern_builtins.dart';
import '../i18n/studio_agent_text.dart';
import '../ui/studio_theme.dart';

/// Compact resource lists; imported text is creative data, not app authority.
class StudioResources extends StatefulWidget {
  const StudioResources(
      {super.key, required this.agent, required this.language});
  final AgentController agent;
  final String language;
  @override
  State<StudioResources> createState() => _StudioResourcesState();
}

class _StudioResourcesState extends State<StudioResources> {
  final details = <String>{};
  bool importing = false;
  String text(String key) => studioAgentText(widget.language, key);
  Future<void> perform(Future<void> Function() action) async {
    try {
      await action();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(text('resourceActionFailed'))));
      }
    }
  }

  Future<void> import(String tab) async {
    if (importing) return;
    setState(() => importing = true);
    await perform(() async {
      final agent = widget.agent, id = widget.agent.selectedConversation?.id;
      if (tab == 'presets') {
        final result = await agent.importTavernPreset();
        if (result != null && agent.selectedConversation?.id == id) {
          await agent.setStudioOptions(presetId: 'tavern:${result.preset.id}');
        }
      } else {
        await agent.importTavernCard();
        if (agent.selectedConversation?.id == id) {
          final chat = agent.selectedConversation;
          if (chat != null) {
            await agent.setStudioOptions(
                characterIds: List.of(chat.characterIds),
                lorebookIds: List.of(chat.lorebookIds));
          }
        }
      }
    });
    if (mounted) setState(() => importing = false);
  }

  Widget item(String id, String title, String body, IconData icon,
      bool selected, bool locked, Future<void> Function() choose) {
    final color = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ListTile(
          key: ValueKey('resource-$id'),
          dense: true,
          selected: selected,
          selectedTileColor: color.primaryContainer.withOpacity(.45),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          leading: Icon(icon, size: 20),
          title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: locked ? null : () => perform(choose),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            if (selected) Icon(Icons.check, size: 18, color: color.primary),
            IconButton(
                tooltip: text('resourceDetails'),
                visualDensity: VisualDensity.compact,
                onPressed: () => setState(() => details.contains(id)
                    ? details.remove(id)
                    : details.add(id)),
                icon: Icon(details.contains(id)
                    ? Icons.expand_less
                    : Icons.expand_more))
          ])),
      studioSizeTransition(context,
          child: details.contains(id)
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  child:
                      Text(body, maxLines: 40, overflow: TextOverflow.ellipsis))
              : const SizedBox.shrink())
    ]);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: widget.agent,
      builder: (context, _) {
        final agent = widget.agent, chat = widget.agent.selectedConversation;
        const tabs = ['presets', 'worldbooks', 'characters'];
        final tab = tabs.contains(agent.workspace.studioResourceTab)
            ? agent.workspace.studioResourceTab
            : 'presets';
        final locked = importing ||
            agent.sending ||
            agent.compacting ||
            agent.studioOptionsSaving ||
            chat == null ||
            chat.archivedAt != null;
        return SafeArea(
            child: Column(children: [
          Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 4, 0),
              child: Row(children: [
                const Icon(Icons.menu_book_outlined, size: 20),
                const SizedBox(width: 8),
                Expanded(
                    child: Text(text('resources'),
                        style: Theme.of(context).textTheme.titleMedium)),
                IconButton(
                    tooltip: text('collapseResources'),
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close))
              ])),
          Padding(
              padding: const EdgeInsets.all(8),
              child: SegmentedButton<String>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(
                        value: 'presets',
                        icon: const Icon(Icons.description_outlined, size: 16),
                        label: Text(text('resource_presets'))),
                    ButtonSegment(
                        value: 'worldbooks',
                        icon: const Icon(Icons.menu_book_outlined, size: 16),
                        label: Text(text('resource_worldbooks'))),
                    ButtonSegment(
                        value: 'characters',
                        icon: const Icon(Icons.person_outline, size: 16),
                        label: Text(text('resource_characters')))
                  ],
                  selected: {tab},
                  onSelectionChanged: (s) =>
                      perform(() => agent.setStudioResourceTab(s.single)))),
          Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                      onPressed: locked ? null : () => import(tab),
                      icon: const Icon(Icons.file_upload_outlined, size: 18),
                      label: Text(text('import_$tab'))))),
          Expanded(
              child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  children: [
                if (tab == 'presets') ...[
                  for (final id in [
                    studioDefaultPresetId,
                    studioCompletePresetId
                  ])
                    item(
                        id,
                        text(id == studioDefaultPresetId
                            ? 'presetInfinite'
                            : 'presetComplete'),
                        text(id == studioDefaultPresetId
                            ? 'presetInfiniteBody'
                            : 'presetCompleteBody'),
                        Icons.description_outlined,
                        chat?.studioPresetId == id,
                        locked,
                        () => agent.setStudioOptions(presetId: id)),
                  for (final p in agent.workspace.samplerPresets
                      .where((p) => p.id != lyraImageSamplerId))
                    item(
                        'tavern:${p.id}',
                        p.name,
                        p.systemPrompt,
                        Icons.description_outlined,
                        chat?.studioPresetId == 'tavern:${p.id}',
                        locked,
                        () =>
                            agent.setStudioOptions(presetId: 'tavern:${p.id}'))
                ],
                if (tab == 'worldbooks')
                  for (final b in agent.workspace.lorebooks)
                    item(b.id, b.name, b.description, Icons.menu_book_outlined,
                        chat?.lorebookIds.contains(b.id) == true, locked, () {
                      final ids = List<String>.of(chat?.lorebookIds ?? []);
                      ids.contains(b.id) ? ids.remove(b.id) : ids.add(b.id);
                      return agent.setStudioOptions(lorebookIds: ids);
                    }),
                if (tab == 'characters')
                  for (final c in agent.workspace.characters)
                    item(c.id, c.name, c.description, Icons.person_outline,
                        chat?.characterIds.contains(c.id) == true, locked, () {
                      final ids = List<String>.of(chat?.characterIds ?? []);
                      if (ids.contains(c.id)) {
                        if (ids.length > 1) ids.remove(c.id);
                      } else {
                        ids.add(c.id);
                      }
                      return agent.setStudioOptions(characterIds: ids);
                    })
              ]))
        ]));
      });
}
