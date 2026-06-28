import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../billing/anlas.dart';
import '../i18n/app_locales.dart';
import '../models/nai_models.dart';
import '../prompts/capsule_data.dart';
import '../prompts/prompt_tools.dart';
import '../services/nai_api.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';
import '../ui/zoomable_image.dart';

class GenerateScreen extends StatelessWidget {
  const GenerateScreen({super.key});

  Future<void> _pickImage(BuildContext context) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked != null && context.mounted) {
      await context.read<AppState>().setWorkbenchPath(picked.path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final p = state.params;
    final text = generateScreenTextFor(state.settings.language);
    final wide = StudioBreakpoints.classify(MediaQuery.sizeOf(context).width) !=
        StudioWindowClass.phone;

    final preview = _PreviewCard(onPick: () => _pickImage(context));
    final controls = <Widget>[
      _TagSearchBox(
        onInsert: (tag, negative) => state.setParam((params) {
          if (negative) {
            params.negativePrompt = _appendTag(params.negativePrompt, tag);
          } else {
            params.positivePrompt = _appendTag(params.positivePrompt, tag);
          }
        }),
      ),
      const SizedBox(height: 12),
      if (state.settings.promptShortcuts.isNotEmpty) ...[
        _PromptShortcutBar(),
        const SizedBox(height: 12),
      ],
      PromptEditor(
        label: text.stylePrompt,
        value: p.stylePrompt,
        lockKind: 'style',
        onChanged: (value) =>
            state.setParam((params) => params.stylePrompt = value),
      ),
      const SizedBox(height: 12),
      PromptEditor(
        label: text.positivePrompt,
        value: p.positivePrompt,
        maxLines: 5,
        hintText: '1girl, masterpiece, ...',
        showRelatedTags: true,
        showTextTools: true,
        onChanged: (value) =>
            state.setParam((params) => params.positivePrompt = value),
      ),
      const SizedBox(height: 12),
      PromptEditor(
        label: text.negativePrompt,
        value: p.negativePrompt,
        maxLines: 3,
        lockKind: 'negative',
        onChanged: (value) =>
            state.setParam((params) => params.negativePrompt = value),
      ),
      const SizedBox(height: 16),
      _ParamControls(),
      const SizedBox(height: 16),
      _CharacterPrompts(),
      const SizedBox(height: 16),
      _ReferenceControls(),
      if (state.workbenchImage != null) ...[
        const SizedBox(height: 16),
        _I2IControls(),
      ],
      const SizedBox(height: 16),
      _OutputControls(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(state.workbenchImage == null
            ? text.titleTextToImage
            : text.titleImageLoaded),
        actions: [
          TextButton.icon(
            onPressed: state.refreshAnlas,
            icon: const Icon(Icons.refresh),
            label: Text(state.account.hasToken
                ? '${state.account.tierName ?? "API"} · ${state.account.anlasBalance ?? "—"}'
                : text.notConfigured),
          ),
        ],
      ),
      // Tablet/desktop-ish width: preview pinned on the left, controls scroll on
      // the right (no wasted horizontal space). Phone: single scroll column.
      body: wide
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 5,
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 8, 120),
                    child: preview,
                  ),
                ),
                const VerticalDivider(width: 1),
                Expanded(
                  flex: 6,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(8, 12, 16, 120),
                    children: controls,
                  ),
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
              children: [preview, const SizedBox(height: 12), ...controls],
            ),
      bottomNavigationBar: const _RunBar(),
    );
  }

  static String _appendTag(String prompt, String tag) {
    final t = tag.trim();
    if (t.isEmpty) return prompt;
    final base = prompt.trim();
    return base.isEmpty ? '$t, ' : '$base, $t, ';
  }
}

class PromptEditor extends StatefulWidget {
  final String label;
  final String value;
  final int maxLines;
  final String? hintText;
  final bool showRelatedTags;
  final String? lockKind;
  // Translate / normalize / weight tools — only meaningful on the positive
  // prompt, so style and negative fields opt out.
  final bool showTextTools;
  final ValueChanged<String> onChanged;

  const PromptEditor({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.maxLines = 1,
    this.hintText,
    this.showRelatedTags = false,
    this.lockKind,
    this.showTextTools = false,
  });

  @override
  State<PromptEditor> createState() => PromptEditorState();
}

class PromptEditorState extends State<PromptEditor> {
  late final TextEditingController controller;
  bool translating = false;
  String? translationBackup;
  Timer? suggestionTimer;
  int suggestionRequest = 0;
  List<TagSuggestion> suggestions = const [];

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: widget.value);
  }

  @override
  void didUpdateWidget(covariant PromptEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (controller.text == widget.value) return;
    controller.value = TextEditingValue(
      text: widget.value,
      selection: TextSelection.collapsed(offset: widget.value.length),
    );
  }

  @override
  void dispose() {
    suggestionTimer?.cancel();
    controller.dispose();
    super.dispose();
  }

  void _apply(String value) {
    controller.value = TextEditingValue(
      text: value,
      selection: TextSelection.collapsed(offset: value.length),
    );
    widget.onChanged(value);
    _scheduleSuggestions(value);
  }

  void _scheduleSuggestions(String value) {
    suggestionTimer?.cancel();
    final state = context.read<AppState>();
    if (!state.settings.autoComplete) {
      if (suggestions.isNotEmpty && mounted) setState(() => suggestions = []);
      return;
    }
    final token = _lastPromptToken(value);
    if (token.length < 2) {
      if (suggestions.isNotEmpty && mounted) setState(() => suggestions = []);
      return;
    }
    final request = ++suggestionRequest;
    suggestionTimer = Timer(const Duration(milliseconds: 320), () async {
      final result = await state.suggestTags(token);
      if (!mounted || request != suggestionRequest) return;
      setState(() => suggestions = result.take(8).toList());
    });
  }

  String _lastPromptToken(String value) {
    final comma = value.lastIndexOf(',');
    final line = value.lastIndexOf('\n');
    return value.substring((comma > line ? comma : line) + 1).trim();
  }

  void _applySuggestion(TagSuggestion suggestion) {
    final value = controller.text;
    final comma = value.lastIndexOf(',');
    final line = value.lastIndexOf('\n');
    final split = comma > line ? comma : line;
    final prefix = split < 0 ? '' : value.substring(0, split + 1);
    final spacing = prefix.isEmpty || prefix.endsWith('\n') ? '' : ' ';
    _apply('$prefix$spacing${suggestion.tag}, ');
    setState(() => suggestions = []);
  }

  Future<void> _translate() async {
    final input = controller.text.trim();
    if (input.isEmpty) return;
    setState(() => translating = true);
    final containsChinese = RegExp(r'[\u3400-\u9fff]').hasMatch(input);
    final translated = await context.read<AppState>().translateText(
          input,
          target: containsChinese ? 'en' : 'zh-CN',
        );
    if (!mounted) return;
    setState(() => translating = false);
    if (translated == null || translated.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.read<AppState>().status)),
      );
      return;
    }
    translationBackup = controller.text;
    _apply(translated.trim());
  }

  Future<void> _editWeights() async {
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    var working = controller.text;
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) {
          final tags = splitPromptTags(working);
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.72,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(generateScreenTextFor(language).weight,
                              style: Theme.of(context).textTheme.titleMedium),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, working),
                          child: Text(t('common.apply')),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: tags.isEmpty
                        ? Center(child: Text(t('generate.noAdjustableTags')))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                            itemCount: tags.length,
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final parsed = parseWeightedTag(tags[index]);
                              return ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(parsed.core),
                                subtitle: Text(
                                    '×${weightMultiplier(parsed.level).toStringAsFixed(2)}'),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      tooltip: t('generate.decreaseWeight'),
                                      onPressed: parsed.level <= -5
                                          ? null
                                          : () => setSheetState(() {
                                                working = setTagLevel(working,
                                                    index, parsed.level - 1);
                                              }),
                                      icon: const Icon(Icons.remove),
                                    ),
                                    Text('${parsed.level}'),
                                    IconButton(
                                      tooltip: t('generate.increaseWeight'),
                                      onPressed: parsed.level >= 5
                                          ? null
                                          : () => setSheetState(() {
                                                working = setTagLevel(working,
                                                    index, parsed.level + 1);
                                              }),
                                      icon: const Icon(Icons.add),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (result != null) _apply(result);
  }

  Future<void> _openNormalize() async {
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    var options = const PromptNormalizeOptions();
    final result = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final preview = normalizePrompt(
            controller.text,
            options: options,
          );
          final toggles = <({String label, bool value, VoidCallback toggle})>[
            (
              label: t('generate.normalizeLowercase'),
              value: options.lowercase,
              toggle: () =>
                  options = options.copyWith(lowercase: !options.lowercase),
            ),
            (
              label: t('generate.normalizeHalfWidth'),
              value: options.halfWidthPunct,
              toggle: () => options =
                  options.copyWith(halfWidthPunct: !options.halfWidthPunct),
            ),
            (
              label: t('generate.normalizeStripDecorative'),
              value: options.stripDecorative,
              toggle: () => options =
                  options.copyWith(stripDecorative: !options.stripDecorative),
            ),
            (
              label: t('generate.normalizeUnderscoreToSpace'),
              value: options.underscoreToSpace,
              toggle: () => options = options.copyWith(
                  underscoreToSpace: !options.underscoreToSpace),
            ),
            (
              label: t('generate.normalizeNewlineToComma'),
              value: options.newlineToComma,
              toggle: () => options =
                  options.copyWith(newlineToComma: !options.newlineToComma),
            ),
            (
              label: t('generate.normalizeDedupe'),
              value: options.dedupe,
              toggle: () => options = options.copyWith(dedupe: !options.dedupe),
            ),
            (
              label: t('generate.normalizeStripQuality'),
              value: options.stripQualityPrefix,
              toggle: () => options = options.copyWith(
                  stripQualityPrefix: !options.stripQualityPrefix),
            ),
            (
              label: t('generate.normalizeStripNonAscii'),
              value: options.stripNonAscii,
              toggle: () => options =
                  options.copyWith(stripNonAscii: !options.stripNonAscii),
            ),
            (
              label: t('generate.normalizeKeepWildcards'),
              value: options.keepWildcards,
              toggle: () => options =
                  options.copyWith(keepWildcards: !options.keepWildcards),
            ),
          ];
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.sizeOf(context).height * 0.82,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            t('generate.normalizeTitle'),
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                        ),
                        FilledButton(
                          onPressed: preview.trim().isEmpty
                              ? null
                              : () => Navigator.pop(sheetContext, preview),
                          child: Text(t('common.apply')),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      children: [
                        for (final item in toggles)
                          CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(item.label),
                            value: item.value,
                            onChanged: (_) => setSheetState(item.toggle),
                          ),
                        const SizedBox(height: 8),
                        Text(
                          t('generate.preview'),
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        SelectableText(preview.isEmpty
                            ? t('generate.emptyResult')
                            : preview),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (result != null) _apply(result);
  }

  Future<void> _pickRelatedTag() async {
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final tags = relatedPromptTags(controller.text);
    if (tags.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t('generate.relatedTagUnavailable'))),
      );
      return;
    }
    final selected = await showModalBottomSheet<RelatedPromptTag>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(generateScreenTextFor(language).relatedTag,
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: tags
                    .map((tag) => ActionChip(
                          label: Text('${tag.description}\n${tag.tag}'),
                          onPressed: () => Navigator.pop(context, tag),
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
    if (selected == null) return;
    final base = controller.text.trim();
    _apply(base.isEmpty ? selected.tag : '$base, ${selected.tag}');
  }

  Future<void> _previewWildcard() async {
    final language = context.read<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final preview = expandPromptWildcards(controller.text);
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(t('generate.randomPreviewTitle')),
        content: SelectableText(preview),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('common.close')),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _apply(preview);
            },
            child: Text(t('generate.applyResult')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final locked = widget.lockKind == 'style'
        ? state.settings.lockStylePrompt
        : widget.lockKind == 'negative'
            ? state.settings.lockNegativePrompt
            : false;
    final text = generateScreenTextFor(state.settings.language);
    final language = state.settings.language;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          maxLines: widget.maxLines,
          decoration: InputDecoration(
            labelText: widget.label,
            hintText: widget.hintText,
            border: const OutlineInputBorder(),
          ),
          onChanged: (value) {
            widget.onChanged(value);
            _scheduleSuggestions(value);
          },
        ),
        if (state.settings.autoComplete && suggestions.isNotEmpty) ...[
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: suggestions
                .map(
                  (suggestion) => ActionChip(
                    label: Text(
                      '${suggestion.tag} · ${localizedTagLabel(
                        language,
                        suggestion.tag,
                        sourceLabel: suggestion.description,
                      )}',
                    ),
                    onPressed: () => _applySuggestion(suggestion),
                  ),
                )
                .toList(),
          ),
        ],
        const SizedBox(height: 6),
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            if (widget.showTextTools) ...[
              TextButton.icon(
                onPressed: translating ? null : _translate,
                icon: translating
                    ? const SizedBox.square(
                        dimension: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.translate, size: 18),
                label: Text(translating ? text.translateBusy : text.translate),
              ),
              if (translationBackup != null)
                IconButton(
                  tooltip: text.undoTranslation,
                  onPressed: () {
                    final backup = translationBackup;
                    if (backup == null) return;
                    setState(() => translationBackup = null);
                    _apply(backup);
                  },
                  icon: const Icon(Icons.undo),
                ),
              TextButton.icon(
                onPressed: _openNormalize,
                icon: const Icon(Icons.auto_fix_high, size: 18),
                label: Text(text.normalize),
              ),
              TextButton.icon(
                onPressed: _editWeights,
                icon: const Icon(Icons.tune, size: 18),
                label: Text(text.weight),
              ),
            ],
            if (hasPromptWildcards(controller.text))
              TextButton.icon(
                onPressed: _previewWildcard,
                icon: const Icon(Icons.casino_outlined, size: 18),
                label: Text(text.randomPreview),
              ),
            if (widget.showRelatedTags)
              TextButton.icon(
                onPressed: _pickRelatedTag,
                icon: const Icon(Icons.hub_outlined, size: 18),
                label: Text(text.relatedTag),
              ),
            if (widget.lockKind != null)
              IconButton(
                tooltip: locked ? text.unlockPrompt : text.lockPrompt,
                onPressed: () => state.setPromptLock(widget.lockKind!, !locked),
                icon: Icon(locked ? Icons.lock : Icons.lock_open),
              ),
          ],
        ),
      ],
    );
  }
}

class _PromptShortcutBar extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              text.promptShortcuts,
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: state.settings.promptShortcuts
                  .map(
                    (template) => ActionChip(
                      avatar: const Icon(Icons.bolt, size: 18),
                      label: Text(template.name),
                      onPressed: () => state.applyPromptShortcut(template),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}

class _PreviewCard extends StatelessWidget {
  final VoidCallback onPick;
  const _PreviewCard({required this.onPick});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final current = state.current;
    final work = state.workbenchImage;
    final path = work?.filePath ?? current?.filePath;
    return AspectRatio(
      aspectRatio: 1,
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (path != null && File(path).existsSync())
              ZoomableImage(
                image: Image.file(File(path), fit: BoxFit.contain),
              )
            else
              Center(child: Text(text.previewEmpty)),
            if (state.busy)
              Container(
                  color: Colors.black38,
                  child: const Center(child: CircularProgressIndicator())),
            Positioned(
              right: 8,
              bottom: 8,
              child: Wrap(
                spacing: 8,
                children: [
                  FilledButton.tonalIcon(
                      onPressed: onPick,
                      icon: const Icon(Icons.image),
                      label: Text(text.loadImage)),
                  if (work != null)
                    FilledButton.tonalIcon(
                        onPressed: state.clearWorkbench,
                        icon: const Icon(Icons.close),
                        label: Text(text.switchToTextToImage)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagSearchBox extends StatefulWidget {
  final void Function(String tag, bool negative) onInsert;
  const _TagSearchBox({required this.onInsert});

  @override
  State<_TagSearchBox> createState() => _TagSearchBoxState();
}

class _TagSearchBoxState extends State<_TagSearchBox> {
  final ctrl = TextEditingController();
  late final Future<List<CapsuleCategory>> taxonomy;
  List<TagSuggestion> tags = [];

  @override
  void initState() {
    super.initState();
    taxonomy = loadCapsuleTaxonomy();
  }

  @override
  void dispose() {
    ctrl.dispose();
    super.dispose();
  }

  Future<void> _search(String value) async {
    if (value.trim().isEmpty) {
      setState(() => tags = []);
      return;
    }
    final result = await context.read<AppState>().suggestTags(value);
    if (mounted) setState(() => tags = result);
  }

  Future<void> _openCapsules() async {
    final categories = await taxonomy;
    if (!mounted) return;
    final text =
        generateScreenTextFor(context.read<AppState>().settings.language);
    if (categories.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(text.capsuleLoadFailed)),
      );
      return;
    }
    final selected = await showModalBottomSheet<_CapsulePick>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _CapsulePickerSheet(categories: categories),
    );
    if (selected != null) {
      widget.onInsert(selected.tag.replaceAll('_', ' '), selected.negative);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final language = state.settings.language;
    final hasOfflineTags = state.offlineTagStatus.downloaded;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: ctrl,
              decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  labelText: text.tagSearchLabel,
                  hintText: text.tagSearchHint,
                  border: const OutlineInputBorder()),
              onChanged: _search,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                OutlinedButton.icon(
                  onPressed: _openCapsules,
                  icon: const Icon(Icons.category_outlined),
                  label: Text(text.browseCategories),
                ),
                if (!hasOfflineTags)
                  FilledButton.tonalIcon(
                    onPressed:
                        state.offlineTagBusy ? null : state.downloadOfflineTags,
                    icon: state.offlineTagBusy
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.download_for_offline_outlined),
                    label: Text(state.offlineTagBusy
                        ? text.downloadBusy
                        : text.downloadChineseTags),
                  )
                else
                  Text(
                    '${text.tagsReadyPrefix}${state.offlineTagStatus.count}${text.tagsReadySuffix}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
            if (!hasOfflineTags)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  text.offlineTagHint,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            if (tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: tags
                    .map((t) => ActionChip(
                        label: Text(
                          '${t.tag} · ${localizedTagLabel(
                            language,
                            t.tag,
                            sourceLabel: t.description,
                          )}',
                        ),
                        onPressed: () => widget.onInsert(t.tag, false)))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CapsulePick {
  final String tag;
  final bool negative;

  const _CapsulePick(this.tag, this.negative);
}

class _CapsulePickerSheet extends StatefulWidget {
  final List<CapsuleCategory> categories;

  const _CapsulePickerSheet({required this.categories});

  @override
  State<_CapsulePickerSheet> createState() => _CapsulePickerSheetState();
}

class _CapsulePickerSheetState extends State<_CapsulePickerSheet> {
  int categoryIndex = 0;
  int subgroupIndex = 0;

  @override
  Widget build(BuildContext context) {
    final category = widget.categories[categoryIndex];
    final subgroup = category.subgroups[subgroupIndex];
    final settings = context.watch<AppState>().settings;
    final text = generateScreenTextFor(settings.language);
    final language = settings.language;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.84,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                text.inspirationCapsules,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (var index = 0; index < widget.categories.length; index++)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(localizedCapsuleCategoryName(
                            language, widget.categories[index].name)),
                        selected: categoryIndex == index,
                        onSelected: (_) => setState(() {
                          categoryIndex = index;
                          subgroupIndex = 0;
                        }),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  for (var index = 0;
                      index < category.subgroups.length;
                      index++)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(localizedCapsuleSubgroupName(
                            language, category.subgroups[index].name)),
                        selected: subgroupIndex == index,
                        onSelected: (_) =>
                            setState(() => subgroupIndex = index),
                      ),
                    ),
                ],
              ),
            ),
            const Divider(height: 17),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: subgroup.tags
                        .map((tag) => ActionChip(
                              labelPadding:
                                  const EdgeInsets.symmetric(horizontal: 6),
                              label: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    tag.tag.replaceAll('_', ' '),
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w600),
                                  ),
                                  if (tag.label.isNotEmpty)
                                    Text(
                                      localizedTagLabel(
                                        language,
                                        tag.tag,
                                        sourceLabel: tag.label,
                                      ),
                                      style: TextStyle(
                                        fontSize: 11,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .onSurfaceVariant,
                                      ),
                                    ),
                                ],
                              ),
                              onPressed: () => Navigator.pop(
                                context,
                                _CapsulePick(tag.tag, category.isNegative),
                              ),
                            ))
                        .toList(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ParamControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final watched = context.watch<AppState>();
    final p = watched.params;
    final language = watched.settings.language;
    final text = generateScreenTextFor(language);
    String t(String key) => mobileUiTextFor(language, key);
    final mode = p.model == 'nai-diffusion-furry-3'
        ? 'furry'
        : watched.settings.modelMode;
    final visibleModels = naiModels
        .where((model) => mode == 'furry'
            ? model.value == 'nai-diffusion-furry-3'
            : model.value != 'nai-diffusion-furry-3')
        .toList();
    return Column(
      children: [
        SegmentedButton<String>(
          segments: [
            ButtonSegment(
              value: 'anime',
              icon: const Icon(Icons.face_outlined),
              label: Text(text.animeMode),
            ),
            ButtonSegment(
              value: 'furry',
              icon: const Icon(Icons.pets_outlined),
              label: Text(text.furryMode),
            ),
          ],
          selected: {mode},
          onSelectionChanged: (selection) async {
            final next = selection.first;
            await state.setSettings((settings) => settings.modelMode = next);
            state.setParam((params) {
              params.model = next == 'furry'
                  ? 'nai-diffusion-furry-3'
                  : 'nai-diffusion-4-5-full';
            });
          },
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: p.model,
          decoration: InputDecoration(
              labelText: text.model, border: const OutlineInputBorder()),
          isExpanded: true,
          items: visibleModels
              .map((m) => DropdownMenuItem(
                  value: m.value,
                  child: Text(
                      localizedNaiOptionLabel(language, m.value, m.label),
                      overflow: TextOverflow.ellipsis)))
              .toList(),
          onChanged: (v) =>
              v == null ? null : state.setParam((x) => x.model = v),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: sizePresets.map((s) {
            final selected = p.width == s.width && p.height == s.height;
            return ChoiceChip(
                label: Text(localizedSizePresetLabel(
                    language, s.width, s.height, s.label)),
                selected: selected,
                onSelected: (_) => state.setParam((x) => (x
                  ..width = s.width
                  ..height = s.height)));
          }).toList(),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _SyncedNumberField(
                label: text.width,
                value: p.width,
                onChanged: (value) => state.setParam(
                  (x) => x.width = _snapDimension(value),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _SyncedNumberField(
                label: text.height,
                value: p.height,
                onChanged: (value) => state.setParam(
                  (x) => x.height = _snapDimension(value),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: p.sampler,
          decoration: InputDecoration(
              labelText: text.sampler, border: const OutlineInputBorder()),
          isExpanded: true,
          items: naiSamplers
              .map((s) => DropdownMenuItem(
                  value: s.value,
                  child: Text(
                      localizedNaiOptionLabel(language, s.value, s.label))))
              .toList(),
          onChanged: (v) =>
              v == null ? null : state.setParam((x) => x.sampler = v),
        ),
        _Slider(
            label: 'Steps',
            value: p.steps.toDouble(),
            min: 1,
            max: 50,
            divisions: 49,
            onChanged: (v) => state.setParam((x) => x.steps = v.round()),
            display: '${p.steps}'),
        _Slider(
            label: 'CFG Scale',
            value: p.cfgScale,
            min: 1,
            max: 10,
            divisions: 45,
            onChanged: (v) => state.setParam(
                (x) => x.cfgScale = double.parse(v.toStringAsFixed(1))),
            display: p.cfgScale.toStringAsFixed(1)),
        _Slider(
            label: 'CFG Rescale',
            value: p.cfgRescale,
            min: 0,
            max: 1,
            divisions: 100,
            onChanged: (v) => state.setParam(
                (x) => x.cfgRescale = double.parse(v.toStringAsFixed(2))),
            display: p.cfgRescale.toStringAsFixed(2)),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          value: p.noiseSchedule,
          decoration: InputDecoration(
              labelText: text.noiseSchedule,
              border: const OutlineInputBorder()),
          items: naiNoiseSchedules
              .map((option) => DropdownMenuItem(
                    value: option.value,
                    child: Text(localizedNaiOptionLabel(
                        language, option.value, option.label)),
                  ))
              .toList(),
          onChanged: (value) => value == null
              ? null
              : state.setParam((x) => x.noiseSchedule = value),
        ),
        const SizedBox(height: 10),
        DropdownButtonFormField<int>(
          value: p.ucPreset,
          decoration: InputDecoration(
              labelText: text.ucPreset, border: const OutlineInputBorder()),
          items: ucPresets
              .map((option) => DropdownMenuItem(
                    value: int.parse(option.value),
                    child: Text(localizedNaiOptionLabel(
                        language, option.value, option.label)),
                  ))
              .toList(),
          onChanged: (value) =>
              value == null ? null : state.setParam((x) => x.ucPreset = value),
        ),
        const SizedBox(height: 10),
        SegmentedButton<String>(
          segments: [
            ButtonSegment(
                value: 'random',
                icon: const Icon(Icons.casino_outlined),
                label: Text(text.randomSeed)),
            ButtonSegment(
                value: 'fixed',
                icon: const Icon(Icons.push_pin_outlined),
                label: Text(text.fixedSeed)),
          ],
          selected: {p.seedMode},
          onSelectionChanged: (selection) => state.setParam((x) {
            x.seedMode = selection.first;
            if (x.seedMode == 'fixed' && x.seed <= 0) x.seed = 1;
          }),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            if (p.seedMode == 'fixed')
              Expanded(
                child: _SyncedNumberField(
                  label: 'Seed',
                  value: p.seed,
                  onChanged: (value) => state.setParam((x) {
                    x.seed = value.clamp(1, 2147483647);
                    x.seedMode = 'fixed';
                  }),
                ),
              ),
            if (p.seedMode == 'fixed')
              IconButton(
                tooltip: text.fixedSeedTooltip,
                onPressed: () => state.setParam(
                  (x) => x.seed = Random.secure().nextInt(2147483646) + 1,
                ),
                icon: const Icon(Icons.casino_outlined),
              ),
            if (p.seedMode == 'fixed') const SizedBox(width: 12),
            Expanded(
              child: _SyncedNumberField(
                label: text.batch,
                value: context.watch<AppState>().batchCount,
                onChanged: state.setBatchCount,
              ),
            ),
          ],
        ),
        SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(text.qualityToggle),
            value: p.qualityToggle,
            onChanged: (v) => state.setParam((x) => x.qualityToggle = v)),
        SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(text.variety),
            value: p.variety,
            onChanged: (v) => state.setParam((x) => x.variety = v)),
        if (!p.isV4Plus) ...[
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('generate.smea')),
            value: p.smea,
            onChanged: (value) => state.setParam((x) {
              x.smea = value;
              if (!value) x.smeaDyn = false;
            }),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('generate.smeaDyn')),
            value: p.smeaDyn,
            onChanged: p.smea
                ? (value) => state.setParam((x) => x.smeaDyn = value)
                : null,
          ),
        ],
      ],
    );
  }
}

class _I2IControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final text = generateScreenTextFor(s.settings.language);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Align(
                alignment: Alignment.centerLeft,
                child: Text(text.i2iParams,
                    style: const TextStyle(fontWeight: FontWeight.bold))),
            _Slider(
                label: text.strength,
                value: s.i2i.strength,
                min: 0,
                max: 1,
                divisions: 20,
                display: s.i2i.strength.toStringAsFixed(2),
                onChanged: (v) {
                  s.i2i.strength = v;
                  s.markChanged();
                }),
            _Slider(
                label: text.noise,
                value: s.i2i.noise,
                min: 0,
                max: 0.99,
                divisions: 20,
                display: s.i2i.noise.toStringAsFixed(2),
                onChanged: (v) {
                  s.i2i.noise = v;
                  s.markChanged();
                }),
            const SizedBox(height: 8),
            _SyncedNumberField(
              label: text.extraNoiseSeed,
              value: s.i2i.extraNoiseSeed,
              onChanged: (value) {
                s.i2i.extraNoiseSeed = value.clamp(0, 2147483647);
                s.markChanged();
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _OutputControls extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    final selectedExists = state.selectedGroupId.isEmpty ||
        state.groups.any((group) => group.id == state.selectedGroupId);
    final selected = selectedExists ? state.selectedGroupId : '';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(text.output,
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            TextFormField(
              initialValue: state.params.fileNamePrefix,
              decoration: InputDecoration(
                labelText: text.imagePrefix,
                border: const OutlineInputBorder(),
              ),
              onChanged: (value) =>
                  state.setParam((params) => params.fileNamePrefix = value),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: selected,
              isExpanded: true,
              decoration: InputDecoration(
                labelText: text.historyGroup,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(value: '', child: Text(text.ungrouped)),
                ...state.groups.map(
                  (group) => DropdownMenuItem(
                    value: group.id,
                    child: Text(group.name, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ],
              onChanged: (value) {
                state.setActiveHistoryGroup(value ?? '');
              },
            ),
          ],
        ),
      ),
    );
  }
}

int _snapDimension(int value) {
  final bounded = value.clamp(64, 1600);
  return ((bounded / 64).round() * 64).clamp(64, 1600);
}

class _SyncedNumberField extends StatefulWidget {
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  const _SyncedNumberField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  State<_SyncedNumberField> createState() => _SyncedNumberFieldState();
}

class _SyncedNumberFieldState extends State<_SyncedNumberField> {
  late final TextEditingController controller;
  late final FocusNode focusNode;

  @override
  void initState() {
    super.initState();
    controller = TextEditingController(text: '${widget.value}');
    focusNode = FocusNode()..addListener(_syncAfterEditing);
  }

  @override
  void didUpdateWidget(covariant _SyncedNumberField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!focusNode.hasFocus && controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  void _syncAfterEditing() {
    if (focusNode.hasFocus) return;
    if (controller.text != '${widget.value}') {
      controller.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    focusNode
      ..removeListener(_syncAfterEditing)
      ..dispose();
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        focusNode: focusNode,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(
          labelText: widget.label,
          border: const OutlineInputBorder(),
        ),
        onChanged: (raw) {
          final value = int.tryParse(raw);
          if (value != null) widget.onChanged(value);
        },
      );
}

class _CharacterPrompts extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                    child: Text(t('generate.characterPrompts'),
                        style: const TextStyle(fontWeight: FontWeight.bold))),
                TextButton.icon(
                    onPressed: s.addCharacter,
                    icon: const Icon(Icons.add),
                    label: Text(t('common.add'))),
              ],
            ),
            for (var i = 0; i < s.extras.charCaptions.length; i++)
              _CharCard(index: i),
          ],
        ),
      ),
    );
  }
}

class _ReferenceControls extends StatelessWidget {
  Future<void> _pick(BuildContext context, {required bool precise}) async {
    final picked = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 100);
    if (picked == null || !context.mounted) return;
    final state = context.read<AppState>();
    final error = precise
        ? await state.addPreciseReference(picked.path)
        : await state.addVibeImage(picked.path);
    if (error != null && context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(error)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final extras = state.extras;
    return Card(
      child: ExpansionTile(
        leading: const Icon(Icons.auto_awesome_motion_outlined),
        title: Text(t('generate.referenceImages')),
        subtitle: Text(
          mobileUiFormatFor(language, 'generate.referenceSubtitle', {
            'vibe': extras.vibeImages.length,
            'precise': extras.preciseReferences.length
          }),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(t('generate.vibeTransfer'),
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(t('generate.vibeHint')),
          ),
          for (var index = 0; index < extras.vibeImages.length; index++)
            _VibeReferenceRow(index: index),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => _pick(context, precise: false),
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: Text(t('generate.addVibe')),
            ),
          ),
          const Divider(height: 28),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(t('generate.preciseReference'),
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              t('generate.preciseHint'),
            ),
          ),
          if (!state.params.isV45 && extras.preciseReferences.isNotEmpty)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.warning_amber_rounded),
              title: Text(t('generate.preciseUnsupportedTitle')),
              subtitle: Text(t('generate.preciseUnsupportedSubtitle')),
            ),
          for (var index = 0; index < extras.preciseReferences.length; index++)
            _PreciseReferenceRow(index: index),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              onPressed: () => _pick(context, precise: true),
              icon: const Icon(Icons.person_search_outlined),
              label: Text(t('generate.addPrecise')),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReferenceThumbnail extends StatelessWidget {
  final String path;
  const _ReferenceThumbnail({required this.path});

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: SizedBox.square(
          dimension: 64,
          child: path.isNotEmpty && File(path).existsSync()
              ? Image.file(
                  File(path),
                  fit: BoxFit.cover,
                  cacheWidth: 160,
                  filterQuality: FilterQuality.low,
                )
              : const ColoredBox(
                  color: Colors.black12,
                  child: Icon(Icons.broken_image_outlined),
                ),
        ),
      );
}

class _VibeReferenceRow extends StatelessWidget {
  final int index;
  const _VibeReferenceRow({required this.index});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final item = state.extras.vibeImages[index];
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ReferenceThumbnail(path: item.sourcePath),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              children: [
                _Slider(
                  label: t('generate.infoExtracted'),
                  value: item.infoExtracted,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.infoExtracted.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updateVibeImage(index, infoExtracted: value),
                ),
                _Slider(
                  label: t('generate.referenceStrength'),
                  value: item.strength,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.strength.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updateVibeImage(index, strength: value),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: t('common.remove'),
            onPressed: () => state.removeVibeImage(index),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

class _PreciseReferenceRow extends StatelessWidget {
  final int index;
  const _PreciseReferenceRow({required this.index});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final item = state.extras.preciseReferences[index];
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _ReferenceThumbnail(path: item.sourcePath),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DropdownButtonFormField<String>(
                  value: item.type,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: t('generate.referenceType'),
                    border: const OutlineInputBorder(),
                  ),
                  items: [
                    DropdownMenuItem(
                        value: 'character',
                        child: Text(t('generate.refType.character'))),
                    DropdownMenuItem(
                        value: 'style',
                        child: Text(t('generate.refType.style'))),
                    DropdownMenuItem(
                        value: 'character&style',
                        child: Text(t('generate.refType.both'))),
                  ],
                  onChanged: (value) => value == null
                      ? null
                      : state.updatePreciseReference(index, type: value),
                ),
                _Slider(
                  label: t('generate.strengthLabel'),
                  value: item.strength,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.strength.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updatePreciseReference(index, strength: value),
                ),
                _Slider(
                  label: t('generate.fidelityLabel'),
                  value: item.fidelity,
                  min: 0,
                  max: 1,
                  divisions: 100,
                  display: item.fidelity.toStringAsFixed(2),
                  onChanged: (value) =>
                      state.updatePreciseReference(index, fidelity: value),
                ),
                Text(mobileUiFormatFor(language, 'generate.autoOfficialSize',
                    {'width': item.width, 'height': item.height})),
              ],
            ),
          ),
          IconButton(
            tooltip: t('common.remove'),
            onPressed: () => state.removePreciseReference(index),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

class _CharCard extends StatelessWidget {
  final int index;
  const _CharCard({required this.index});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final language = s.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    final c = s.extras.charCaptions[index];
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        children: [
          TextFormField(
            initialValue: c.prompt,
            decoration: InputDecoration(
                labelText: mobileUiFormatFor(
                    language, 'generate.characterLabel', {'index': index + 1}),
                border: const OutlineInputBorder(),
                suffixIcon: IconButton(
                    icon: const Icon(Icons.delete),
                    onPressed: () => s.removeCharacter(index))),
            onChanged: (v) {
              c.prompt = v;
              s.markChanged();
            },
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(t('generate.useCoords')),
            value: c.useCoords,
            onChanged: (v) {
              c.useCoords = v ?? false;
              s.markChanged();
            },
          ),
          if (c.useCoords)
            Row(children: [
              Expanded(
                  child: _Slider(
                      label: 'X',
                      value: c.x,
                      min: 0,
                      max: 1,
                      divisions: 20,
                      display: c.x.toStringAsFixed(2),
                      onChanged: (v) {
                        c.x = v;
                        s.markChanged();
                      })),
              Expanded(
                  child: _Slider(
                      label: 'Y',
                      value: c.y,
                      min: 0,
                      max: 1,
                      divisions: 20,
                      display: c.y.toStringAsFixed(2),
                      onChanged: (v) {
                        c.y = v;
                        s.markChanged();
                      })),
            ]),
        ],
      ),
    );
  }
}

class _Slider extends StatelessWidget {
  final String label;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final String display;
  final ValueChanged<double> onChanged;
  const _Slider(
      {required this.label,
      required this.value,
      required this.min,
      required this.max,
      required this.divisions,
      required this.display,
      required this.onChanged});
  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label),
          Text(display, style: const TextStyle(fontWeight: FontWeight.bold))
        ]),
        Slider(
            value: value.clamp(min, max),
            min: min,
            max: max,
            divisions: divisions,
            label: display,
            onChanged: onChanged),
      ]);
}

class _RunBar extends StatelessWidget {
  const _RunBar();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final text = generateScreenTextFor(state.settings.language);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _AnlasQuoteBar(state: state),
            const SizedBox(height: 6),
            if (state.generationQueueRunning) ...[
              _GenerationQueuePanel(state: state),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed:
                          state.queueAdding ? null : state.enqueueGeneration,
                      icon: state.queueAdding
                          ? const SizedBox.square(
                              dimension: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.add_to_photos_outlined),
                      label: Text(
                        state.queueAdding
                            ? text.quoting
                            : '${text.addToQueue}（${text.waiting} ${state.generationQueue.length}）',
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filledTonal(
                    tooltip: state.queuePaused ? text.resume : text.pause,
                    onPressed: state.toggleQueuePause,
                    icon: Icon(
                      state.queuePaused ? Icons.play_arrow : Icons.pause,
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton.filled(
                    tooltip: text.cancelAndClear,
                    onPressed: state.cancelGeneration,
                    icon: const Icon(Icons.stop),
                  ),
                ],
              ),
            ] else
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: state.busy || !state.account.hasToken
                      ? null
                      : state.runTextOrImage,
                  icon: Icon(state.workbenchImage == null
                      ? Icons.play_arrow
                      : Icons.image_search),
                  label: Text(state.workbenchImage == null
                      ? (state.batchCount > 1
                          ? '${text.generateCountPrefix}${state.batchCount}${text.generateCountSuffix}'
                          : text.generateImage)
                      : text.useCurrentImage),
                ),
              ),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                state.displayStatus,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AnlasQuoteBar extends StatelessWidget {
  final AppState state;

  const _AnlasQuoteBar({required this.state});

  @override
  Widget build(BuildContext context) {
    final quote = state.generationQuote;
    final text = generateScreenTextFor(state.settings.language);
    final scheme = Theme.of(context).colorScheme;
    final source = quote?.source == AnlasQuoteSource.officialApi
        ? text.officialQuote
        : quote?.source == AnlasQuoteSource.estimateFormula
            ? text.formulaQuote
            : text.pendingQuote;
    final amount = quote?.amount;
    final warning = quote?.insufficient == true;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: warning
            ? scheme.errorContainer
            : scheme.secondaryContainer.withOpacity(0.55),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Row(
          children: [
            Icon(
              warning ? Icons.warning_amber_rounded : Icons.toll_outlined,
              size: 18,
              color: warning ? scheme.onErrorContainer : scheme.secondary,
            ),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                amount == null
                    ? '${text.precharge}: ${state.account.hasToken ? text.reading : text.configureToken}'
                    : '${text.precharge}: $amount Anlas · $source',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            if (state.quoteLoading)
              const Padding(
                padding: EdgeInsets.only(right: 8),
                child: SizedBox.square(
                  dimension: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            Text(
              '${text.balance} ${state.account.anlasBalance ?? text.unknown}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _GenerationQueuePanel extends StatelessWidget {
  final AppState state;

  const _GenerationQueuePanel({required this.state});

  @override
  Widget build(BuildContext context) {
    final progress = state.queueProgress ?? const GenerationQueueProgress();
    final text = generateScreenTextFor(state.settings.language);
    final finished = progress.done + progress.failed;
    final pending = (progress.total - finished - 1).clamp(0, progress.total);
    final manuallyQueued = state.generationQueue.length;
    final batchPending = (pending - manuallyQueued).clamp(0, pending);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 6, 6, 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${text.queue} · ${text.running}${pending > 0 ? ' / $pending ${text.queued}' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                if (pending > 0)
                  IconButton(
                    tooltip: text.clearPending,
                    visualDensity: VisualDensity.compact,
                    onPressed: state.clearPendingGenerationQueue,
                    icon: const Icon(Icons.playlist_remove, size: 20),
                  ),
                IconButton(
                  tooltip: state.queueCollapsed
                      ? text.expandQueue
                      : text.collapseQueue,
                  visualDensity: VisualDensity.compact,
                  onPressed: state.toggleQueueCollapsed,
                  icon: Icon(
                    state.queueCollapsed
                        ? Icons.keyboard_arrow_down
                        : Icons.keyboard_arrow_up,
                    size: 20,
                  ),
                ),
              ],
            ),
            LinearProgressIndicator(
              value: progress.total <= 0 ? null : finished / progress.total,
            ),
            if (!state.queueCollapsed) ...[
              const SizedBox(height: 5),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  state.queuePaused
                      ? text.pauseAfterCurrent
                      : text.runningCurrent,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              if (batchPending > 0)
                _QueueLine(
                    label:
                        '${text.batchPendingPrefix}$batchPending${text.batchPendingSuffix}'),
              for (final job in state.generationQueue)
                _QueueLine(
                  label: job.label,
                  trailing: IconButton(
                    tooltip: text.removeFromQueue,
                    visualDensity: VisualDensity.compact,
                    onPressed: () => state.removeQueueJob(job.id),
                    icon: const Icon(Icons.close, size: 18),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _QueueLine extends StatelessWidget {
  final String label;
  final Widget? trailing;

  const _QueueLine({required this.label, this.trailing});

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 30,
        child: Row(
          children: [
            const Icon(Icons.schedule, size: 15),
            const SizedBox(width: 6),
            Expanded(
              child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      );
}
