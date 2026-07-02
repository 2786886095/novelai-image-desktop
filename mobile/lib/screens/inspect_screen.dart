import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../i18n/app_locales.dart';
import '../prompts/prompt_mode.dart';
import '../state/app_state.dart';
import '../ui/zoomable_image.dart';

enum InspectPageKind { reverse, convert }

class InspectScreen extends StatelessWidget {
  final InspectPageKind kind;
  const InspectScreen({super.key, required this.kind});

  Future<void> _pick(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) {
      await context.read<AppState>().setWorkbenchPath(picked.path);
    }
  }

  @override
  Widget build(BuildContext context) {
    return kind == InspectPageKind.reverse
        ? _ReversePanel(onPick: () => _pick(context))
        : const _ConvertPanel();
  }
}

// Keep a persistent controller in sync with an external state string without
// clobbering the caret while the user types (only rewrite when they differ).
void _syncController(TextEditingController controller, String value) {
  if (controller.text == value) return;
  controller.value = TextEditingValue(
    text: value,
    selection: TextSelection.collapsed(offset: value.length),
  );
}

class _ReversePanel extends StatefulWidget {
  final VoidCallback onPick;
  const _ReversePanel({required this.onPick});

  @override
  State<_ReversePanel> createState() => _ReversePanelState();
}

class _ReversePanelState extends State<_ReversePanel> {
  final _resultCtrl = TextEditingController();
  final _hintCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final state = context.read<AppState>();
    _resultCtrl.text = state.reverseResult;
    _hintCtrl.text = state.reverseHint;
  }

  @override
  void dispose() {
    _resultCtrl.dispose();
    _hintCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final path = s.workbenchImage?.filePath;
    _syncController(_resultCtrl, s.reverseResult);
    return Scaffold(
      appBar: AppBar(title: Text(t('inspect.reverseTitle')), actions: [
        IconButton(onPressed: widget.onPick, icon: const Icon(Icons.image))
      ]),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(16),
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Card(
              clipBehavior: Clip.antiAlias,
              child: path != null && File(path).existsSync()
                  ? ZoomableImage(
                      image: Image.file(File(path), fit: BoxFit.contain),
                    )
                  : Center(
                      child: FilledButton.icon(
                          onPressed: widget.onPick,
                          icon: const Icon(Icons.image),
                          label: Text(t('inspect.selectReverseImage')))),
            ),
          ),
          const SizedBox(height: 12),
          if (s.workbenchImportedParams != null) ...[
            FilledButton.tonalIcon(
              onPressed: s.applyWorkbenchMetadata,
              icon: const Icon(Icons.settings_backup_restore),
              label: Text(t('inspect.restoreMetadata')),
            ),
            const SizedBox(height: 12),
          ],
          _ModeSelector(
              value: s.reverseMode,
              onChanged: (m) {
                s.reverseMode = m;
                s.markChanged();
              }),
          const SizedBox(height: 12),
          DropdownButtonFormField<ReversePromptScope>(
            value: s.reverseScope,
            decoration: InputDecoration(
              labelText: t('inspect.reverseScope'),
              border: const OutlineInputBorder(),
            ),
            items: ReversePromptScope.values
                .map((scope) => DropdownMenuItem(
                      value: scope,
                      child: Text(t('reverseScope.${scope.value}')),
                    ))
                .toList(),
            onChanged: (scope) {
              if (scope == null) return;
              s.reverseScope = scope;
              s.markChanged();
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _hintCtrl,
            decoration: InputDecoration(
              labelText: t('inspect.subjectHint'),
              border: const OutlineInputBorder(),
            ),
            onChanged: (value) {
              s.reverseHint = value;
              s.markChanged();
            },
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('inspect.knownCharacterTitle')),
            subtitle: Text(t('inspect.knownCharacterSubtitle')),
            value: s.reverseKnownCharacter,
            onChanged: (value) {
              s.reverseKnownCharacter = value ?? false;
              s.reversePromptVariants = null;
              s.markChanged();
            },
          ),
          FilledButton.icon(
              onPressed: s.workbenchImage == null ? null : s.reversePrompt,
              icon: const Icon(Icons.visibility),
              label: Text(t('inspect.startReverse'))),
          _TextToolJobList(
            jobs: s.reverseJobs,
            collapsed: s.reverseQueueCollapsed,
            onToggleCollapsed: s.toggleReverseQueueCollapsed,
            onRemove: s.removeReverseJob,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: InputDecoration(
                labelText: t('inspect.reverseResult'),
                border: const OutlineInputBorder()),
            onChanged: (v) {
              s.reverseResult = v;
              s.markChanged();
            },
          ),
          _ResultTemplateChips(
            value: s.reverseResult,
            language: language,
            onApply: (value) {
              s.reverseResult = value;
              s.reversePromptVariants = null;
              s.markChanged();
            },
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: s.reverseResult.trim().isEmpty
                  ? null
                  : () => s.applyPrompt(s.reverseResult),
              icon: const Icon(Icons.send),
              label: Text(t('inspect.reuseToGenerate'))),
          if (s.reversePromptVariants case final variants?) ...[
            const SizedBox(height: 12),
            _VariantResults(variants: variants, language: language),
          ],
          _TextToolHistoryList(
            items: s.reverseHistory,
            onDelete: s.deleteReverseHistoryItem,
            onClear: s.clearReverseHistory,
            onUse: (text) {
              s.reverseResult = text;
              s.markChanged();
            },
          ),
          const SizedBox(height: 8),
          Text(s.status),
        ],
      ),
    );
  }
}

class _ConvertPanel extends StatefulWidget {
  const _ConvertPanel();

  @override
  State<_ConvertPanel> createState() => _ConvertPanelState();
}

class _ConvertPanelState extends State<_ConvertPanel> {
  final _inputCtrl = TextEditingController();
  final _resultCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final s = context.read<AppState>();
    _inputCtrl.text = s.convertInput;
    _resultCtrl.text = s.convertResult;
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _resultCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    _syncController(_inputCtrl, s.convertInput);
    _syncController(_resultCtrl, s.convertResult);
    return Scaffold(
      appBar: AppBar(title: Text(t('inspect.convertTitle'))),
      body: ListView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _inputCtrl,
            maxLines: 5,
            decoration: InputDecoration(
                labelText: t('inspect.inputDescription'),
                border: const OutlineInputBorder()),
            onChanged: (v) {
              s.convertInput = v;
              s.markChanged();
            },
          ),
          const SizedBox(height: 12),
          _ModeSelector(
              value: s.convertMode,
              onChanged: (m) {
                s.convertMode = m;
                s.markChanged();
              }),
          const SizedBox(height: 12),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('inspect.knownCharacterTitle')),
            subtitle: Text(t('inspect.knownCharacterSubtitle')),
            value: s.convertKnownCharacter,
            onChanged: (value) {
              s.convertKnownCharacter = value ?? false;
              s.convertResultVariants = null;
              s.markChanged();
            },
          ),
          FilledButton.icon(
              onPressed:
                  s.convertInput.trim().isEmpty ? null : s.convertPrompt,
              icon: const Icon(Icons.translate),
              label: Text(t('inspect.startConvert'))),
          _TextToolJobList(
            jobs: s.convertJobs,
            collapsed: s.convertQueueCollapsed,
            onToggleCollapsed: s.toggleConvertQueueCollapsed,
            onRemove: s.removeConvertJob,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: InputDecoration(
                labelText: t('inspect.convertResult'),
                border: const OutlineInputBorder()),
            onChanged: (v) {
              s.convertResult = v;
              s.markChanged();
            },
          ),
          _ResultTemplateChips(
            value: s.convertResult,
            language: language,
            onApply: (value) {
              s.convertResult = value;
              s.convertResultVariants = null;
              s.markChanged();
            },
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
              onPressed: s.convertResult.trim().isEmpty
                  ? null
                  : () => s.applyPrompt(s.convertResult),
              icon: const Icon(Icons.send),
              label: Text(t('inspect.reuseToGenerate'))),
          if (s.convertResultVariants case final variants?) ...[
            const SizedBox(height: 12),
            _VariantResults(variants: variants, language: language),
          ],
          _TextToolHistoryList(
            items: s.convertHistory,
            onDelete: s.deleteConvertHistoryItem,
            onClear: s.clearConvertHistory,
            onUse: (text) {
              s.convertResult = text;
              s.markChanged();
            },
          ),
          const SizedBox(height: 8),
          Text(s.status),
        ],
      ),
    );
  }
}

// Concurrent job tracker for reverse/convert — unlike the image-generation
// queue, there's no serial drain loop: every submission fires immediately,
// so more than one entry can be "processing" at once. Shared by both panels.
class _TextToolJobList extends StatelessWidget {
  final List<TextToolJob> jobs;
  final bool collapsed;
  final VoidCallback onToggleCollapsed;
  final ValueChanged<String> onRemove;
  const _TextToolJobList({
    required this.jobs,
    required this.collapsed,
    required this.onToggleCollapsed,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    if (jobs.isEmpty) return const SizedBox.shrink();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final processing =
        jobs.where((j) => j.status == TextToolJobStatus.processing).length;
    return Card(
      margin: const EdgeInsets.only(top: 4, bottom: 4),
      child: Column(
        children: [
          ListTile(
            dense: true,
            title: Text(processing > 0
                ? '${t('textTool.queueTitle')} · $processing'
                : t('textTool.queueTitle')),
            trailing: IconButton(
              icon: Icon(collapsed ? Icons.expand_more : Icons.expand_less),
              onPressed: onToggleCollapsed,
            ),
          ),
          if (!collapsed)
            for (final job in jobs)
              ListTile(
                dense: true,
                leading: switch (job.status) {
                  TextToolJobStatus.processing => const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2)),
                  TextToolJobStatus.done =>
                    const Icon(Icons.check_circle, color: Colors.green, size: 18),
                  TextToolJobStatus.failed =>
                    const Icon(Icons.error, color: Colors.red, size: 18),
                },
                title: Text(job.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: job.status == TextToolJobStatus.failed && job.message != null
                    ? Text(job.message!, maxLines: 1, overflow: TextOverflow.ellipsis)
                    : null,
                trailing: IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  tooltip: job.status == TextToolJobStatus.processing
                      ? t('textTool.cancel')
                      : null,
                  onPressed: () => onRemove(job.id),
                ),
              ),
        ],
      ),
    );
  }
}

// Persisted reverse/convert history. Kept collapsed by default via local
// state (separate from the job list's store-backed collapse flag) since
// browsing old results is secondary to watching active jobs.
class _TextToolHistoryList extends StatefulWidget {
  final List<TextToolHistoryItem> items;
  final ValueChanged<String> onDelete;
  final VoidCallback onClear;
  final ValueChanged<String> onUse;
  const _TextToolHistoryList({
    required this.items,
    required this.onDelete,
    required this.onClear,
    required this.onUse,
  });

  @override
  State<_TextToolHistoryList> createState() => _TextToolHistoryListState();
}

class _TextToolHistoryListState extends State<_TextToolHistoryList> {
  bool _collapsed = true;

  @override
  Widget build(BuildContext context) {
    if (widget.items.isEmpty) return const SizedBox.shrink();
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      margin: const EdgeInsets.only(top: 4, bottom: 4),
      child: Column(
        children: [
          ListTile(
            dense: true,
            title: Text('${t('textTool.historyTitle')} · ${widget.items.length}'),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: widget.onClear,
                  child: Text(t('textTool.historyClear')),
                ),
                IconButton(
                  icon: Icon(_collapsed ? Icons.expand_more : Icons.expand_less),
                  onPressed: () => setState(() => _collapsed = !_collapsed),
                ),
              ],
            ),
          ),
          if (!_collapsed)
            for (final item in widget.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ListTile(
                      dense: true,
                      title: Text(
                        item.input.trim().isNotEmpty
                            ? item.input
                            : item.result,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                          item.createdAt.replaceFirst('T', ' ').split('.').first),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (item.variants == null)
                            IconButton(
                              icon: const Icon(Icons.send, size: 18),
                              onPressed: () => widget.onUse(item.result),
                            ),
                          IconButton(
                            icon: const Icon(Icons.close, size: 18),
                            onPressed: () => widget.onDelete(item.id),
                          ),
                        ],
                      ),
                    ),
                    if (item.variants case final variants?
                        when variants.namePrompt.isNotEmpty ||
                            variants.featurePrompt.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: _VariantResults(
                          variants: variants,
                          language: language,
                          onUse: widget.onUse,
                        ),
                      ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

class _ResultTemplateChips extends StatelessWidget {
  final String value;
  final Object? language;
  final ValueChanged<String> onApply;

  const _ResultTemplateChips({
    required this.value,
    required this.language,
    required this.onApply,
  });

  @override
  Widget build(BuildContext context) {
    final templates = context.watch<AppState>().settings.promptShortcuts;
    if (value.trim().isEmpty || templates.isEmpty) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(mobileUiTextFor(language, 'inspect.applyTemplate')),
          ...templates.map(
            (template) => ActionChip(
              label: Text(template.name),
              onPressed: () {
                final merged = [
                  template.prefix.trim(),
                  value.trim(),
                  template.suffix.trim(),
                ].where((part) => part.isNotEmpty).join(', ');
                onApply(merged);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _VariantResults extends StatelessWidget {
  final PromptVariants variants;
  final Object? language;
  // Defaults to pushing straight into the main generate screen's positive
  // prompt (the live-result behavior); history callers pass their own
  // "put into the result box" callback instead, matching how the single
  // non-variant history item's "use" button already behaves.
  final ValueChanged<String>? onUse;
  const _VariantResults({
    required this.variants,
    required this.language,
    this.onUse,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _VariantCard(
          title: mobileUiTextFor(language, 'inspect.nameVariant'),
          subtitle: mobileUiTextFor(language, 'inspect.nameVariantHint'),
          prompt: variants.namePrompt,
          language: language,
          onUse: onUse,
        ),
        const SizedBox(height: 8),
        _VariantCard(
          title: mobileUiTextFor(language, 'inspect.featureVariant'),
          subtitle: mobileUiTextFor(language, 'inspect.featureVariantHint'),
          prompt: variants.featurePrompt,
          language: language,
          onUse: onUse,
        ),
      ],
    );
  }
}

class _VariantCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String prompt;
  final Object? language;
  final ValueChanged<String>? onUse;
  const _VariantCard({
    required this.title,
    required this.subtitle,
    required this.prompt,
    required this.language,
    this.onUse,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            SelectableText(prompt.isEmpty
                ? mobileUiTextFor(language, 'inspect.variantMissing')
                : prompt),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: prompt.isEmpty
                  ? null
                  : () => (onUse ?? context.read<AppState>().applyPrompt)(prompt),
              icon: const Icon(Icons.send_outlined),
              label: Text(mobileUiTextFor(language, 'inspect.reuseToGenerate')),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeSelector extends StatelessWidget {
  final ReversePromptMode value;
  final ValueChanged<ReversePromptMode> onChanged;
  const _ModeSelector({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final language = context.watch<AppState>().settings.language;
    return SegmentedButton<ReversePromptMode>(
      segments: ReversePromptMode.values
          .map((m) => ButtonSegment(
              value: m,
              label: Text(mobileUiTextFor(language, 'promptMode.${m.value}'))))
          .toList(),
      selected: {value},
      onSelectionChanged: (v) => onChanged(v.first),
    );
  }
}
