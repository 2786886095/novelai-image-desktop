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
              hintText: t('inspect.subjectHintExample'),
              border: const OutlineInputBorder(),
            ),
            onChanged: (value) => s.reverseHint = value,
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
              onPressed:
                  s.busy || s.workbenchImage == null ? null : s.reversePrompt,
              icon: const Icon(Icons.visibility),
              label: Text(t('inspect.startReverse'))),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: InputDecoration(
                labelText: t('inspect.reverseResult'),
                border: const OutlineInputBorder()),
            onChanged: (v) => s.reverseResult = v,
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
                hintText: t('inspect.inputDescriptionHint'),
                border: const OutlineInputBorder()),
            onChanged: (v) => s.convertInput = v,
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
              onPressed: s.busy || s.convertInput.trim().isEmpty
                  ? null
                  : s.convertPrompt,
              icon: const Icon(Icons.translate),
              label: Text(t('inspect.startConvert'))),
          const SizedBox(height: 12),
          TextField(
            controller: _resultCtrl,
            maxLines: 8,
            decoration: InputDecoration(
                labelText: t('inspect.convertResult'),
                border: const OutlineInputBorder()),
            onChanged: (v) => s.convertResult = v,
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
          const SizedBox(height: 8),
          Text(s.status),
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
  const _VariantResults({required this.variants, required this.language});

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
        ),
        const SizedBox(height: 8),
        _VariantCard(
          title: mobileUiTextFor(language, 'inspect.featureVariant'),
          subtitle: mobileUiTextFor(language, 'inspect.featureVariantHint'),
          prompt: variants.featurePrompt,
          language: language,
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
  const _VariantCard({
    required this.title,
    required this.subtitle,
    required this.prompt,
    required this.language,
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
                  : () => context.read<AppState>().applyPrompt(prompt),
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
