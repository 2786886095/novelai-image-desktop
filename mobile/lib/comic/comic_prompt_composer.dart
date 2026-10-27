import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/nai_models.dart';
import '../state/app_state.dart';
import 'comic_prompt.dart';
import 'comic_prompt_controller.dart';
import 'comic_prompt_text.dart';

/// Embeddable in the conversion page and the Japanese comic import step.
/// This widget has no Scaffold, image operation, global cancellation or retry.
class ComicPromptComposer extends StatefulWidget {
  final AppState app;
  final String draftKey;
  final Future<void> Function(List<String> pages)? onImport;
  const ComicPromptComposer(
      {super.key,
      required this.app,
      this.draftKey = 'japanese',
      this.onImport});
  @override
  State<ComicPromptComposer> createState() => _ComicPromptComposerState();
}

class _ComicPromptComposerState extends State<ComicPromptComposer> {
  late final ComicPromptComposerController controller;
  @override
  void initState() {
    super.initState();
    final app = widget.app;
    controller = ComicPromptComposerController(
        contextFingerprint: () {
          final template =
              app.templateLibrary.resolve(controller.format.templateSlot);
          return jsonEncode([
            app.settings.convertApiUrl,
            app.settings.convertApiModel,
            template.revision,
            template.sha256
          ]);
        },
        readDraft: () => app.storage.getComicPromptDraft(widget.draftKey),
        writeDraft: (raw) =>
            app.storage.setComicPromptDraft(widget.draftKey, raw),
        transport: (request, scope) async {
          await app.templateLibrary.load();
          scope.check();
          final template =
              app.templateLibrary.resolve(request.format.templateSlot);
          final settings = AppSettings.fromJson(app.settings.toJson());
          final key = await app.storage.getConvertKey() ?? '';
          scope.check();
          final result = await app.api.comicPromptText(
              settings: settings,
              apiKey: key,
              system: comicTemplateSystem(template.body, request.input),
              user: request.envelope(),
              recommend: request.action == 'recommend');
          scope.check();
          if ((await app.storage.getConvertKey() ?? '') != key) {
            throw StateError(
                'Conversion credential changed; response not applied');
          }
          return ComicTextReply(
              ok: result.ok,
              text: result.text,
              message: result.message,
              truncated: result.truncated);
        });
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    try {
      await widget.app.templateLibrary.load();
    } catch (e) {
      controller.reportError(e);
    }
    await controller.load();
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: Listenable.merge([widget.app, widget.app.templateLibrary]),
      builder: (context, _) => ComicPromptComposerView(
          controller: controller,
          language: widget.app.settings.language,
          onImport: widget.onImport));
}

class ComicPromptComposerView extends StatefulWidget {
  final ComicPromptComposerController controller;
  final String language;
  final Future<void> Function(List<String>)? onImport;
  const ComicPromptComposerView(
      {super.key,
      required this.controller,
      required this.language,
      this.onImport});
  @override
  State<ComicPromptComposerView> createState() =>
      _ComicPromptComposerViewState();
}

class _ComicPromptComposerViewState extends State<ComicPromptComposerView> {
  late final TextEditingController input, output, pages;
  ComicPromptComposerController get c => widget.controller;
  String t(String key) => comicPromptText(widget.language, key);
  @override
  void initState() {
    super.initState();
    input = TextEditingController(text: c.input);
    output = TextEditingController(text: c.output);
    pages = TextEditingController(text: c.pages?.toString() ?? '');
    c.addListener(_sync);
  }

  @override
  void didUpdateWidget(covariant ComicPromptComposerView old) {
    super.didUpdateWidget(old);
    if (old.controller != c) {
      old.controller.removeListener(_sync);
      c.addListener(_sync);
      _sync();
    }
  }

  void _sync() {
    for (final pair in [
      (input, c.input),
      (output, c.output),
      (pages, c.pages?.toString() ?? '')
    ]) {
      if (pair.$1.text != pair.$2) {
        pair.$1.value = TextEditingValue(
            text: pair.$2,
            selection: TextSelection.collapsed(offset: pair.$2.length));
      }
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    c.removeListener(_sync);
    input.dispose();
    output.dispose();
    pages.dispose();
    super.dispose();
  }

  Future<void> _import() async {
    if (!c.canImport || widget.onImport == null) return;
    final importPages = widget.onImport!;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(t('confirmTitle')),
                content: Text(t('confirmBody')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: Text(t('close'))),
                  FilledButton(
                      key: const ValueKey('comic-confirm-import'),
                      onPressed: () => Navigator.pop(context, true),
                      child: Text(t('confirm')))
                ]));
    if (confirmed != true || !mounted) return;
    try {
      await importPages(c.pagesToImport());
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)
            ?.showSnackBar(SnackBar(content: Text(t('imported'))));
      }
    } catch (e) {
      c.reportError(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final editable = c.loaded && c.draftError == null;
    return Card(
        margin: EdgeInsets.zero,
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(t('title'),
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 6),
                  Text(t('description'),
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 12),
                  if (!c.loaded) const LinearProgressIndicator(),
                  if (c.draftError != null)
                    Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text('${t('draftDamaged')}\n${c.draftError}',
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error))),
                  DropdownButtonFormField<ComicPromptFormat>(
                      key: const ValueKey('comic-prompt-format'),
                      value: c.format,
                      isExpanded: true,
                      decoration: InputDecoration(
                          labelText: t('format'),
                          border: const OutlineInputBorder()),
                      items: ComicPromptFormat.values
                          .map((f) => DropdownMenuItem(
                              value: f,
                              child: Text(
                                  t(f == ComicPromptFormat.japanesePage
                                      ? 'jp'
                                      : 'single'),
                                  overflow: TextOverflow.ellipsis)))
                          .toList(),
                      onChanged: editable
                          ? (value) {
                              if (value != null) c.setFormat(value);
                            }
                          : null),
                  const SizedBox(height: 12),
                  TextField(
                      key: const ValueKey('comic-prompt-input'),
                      controller: input,
                      enabled: editable,
                      minLines: 4,
                      maxLines: 10,
                      maxLength: maxComicInputChars,
                      onChanged: c.setInput,
                      decoration: InputDecoration(
                          labelText: t('input'),
                          border: const OutlineInputBorder(),
                          alignLabelWithHint: true)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    ChoiceChip(
                        label: Text(t('recommended')),
                        selected: !c.manual,
                        onSelected:
                            editable ? (_) => c.setManual(false) : null),
                    ChoiceChip(
                        label: Text(t('manual')),
                        selected: c.manual,
                        onSelected: editable ? (_) => c.setManual(true) : null),
                  ]),
                  const SizedBox(height: 12),
                  SizedBox(
                      width: 240,
                      child: TextField(
                          key: const ValueKey('comic-prompt-pages'),
                          controller: pages,
                          enabled: editable,
                          keyboardType: TextInputType.number,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly
                          ],
                          onChanged: c.setPages,
                          decoration: InputDecoration(
                              labelText: t('pages'),
                              border: const OutlineInputBorder(),
                              errorText: c.validPages ? null : t('pages')))),
                  const SizedBox(height: 10),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    OutlinedButton.icon(
                        key: const ValueKey('comic-recommend'),
                        onPressed: editable && !c.busy && c.validInput
                            ? () => unawaited(c.recommend())
                            : null,
                        icon: const Icon(Icons.auto_awesome_outlined),
                        label: Text(t('recommend'))),
                    FilledButton.icon(
                        key: const ValueKey('comic-generate-prompts'),
                        onPressed: c.canGenerate
                            ? () => unawaited(c.generate())
                            : null,
                        icon: const Icon(Icons.edit_note),
                        label: Text(
                            t(c.output.isEmpty ? 'generate' : 'regenerate'))),
                    if (c.busy)
                      OutlinedButton.icon(
                          onPressed: c.cancel,
                          icon: const Icon(Icons.close),
                          label: Text(t('cancel'))),
                  ]),
                  if (!c.manual && !c.recommendationCurrent)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(t('recommendRequired'),
                            style: Theme.of(context).textTheme.bodySmall)),
                  if (c.reason.isNotEmpty)
                    Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text('${t('reason')}：${c.reason}')),
                  if (c.beats.isNotEmpty)
                    ExpansionTile(
                        title: Text('${t('reason')} · ${c.beats.length}'),
                        children: c.beats
                            .asMap()
                            .entries
                            .map((e) => ListTile(
                                dense: true,
                                title: Text('${e.key + 1}. ${e.value}')))
                            .toList()),
                  const SizedBox(height: 10),
                  Text(t('notice'),
                      style: Theme.of(context).textTheme.bodySmall),
                  if (c.message.isNotEmpty)
                    Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text(
                            t(c.message == 'recommended'
                                ? 'reason'
                                : c.message),
                            key: const ValueKey('comic-prompt-status'),
                            semanticsLabel: t(c.message))),
                  if (c.error.isNotEmpty)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: SelectableText(c.error,
                            style: TextStyle(
                                color: Theme.of(context).colorScheme.error))),
                  if (c.output.isNotEmpty) ...[
                    const Divider(height: 26),
                    Text('${t('count')}：${c.completedPages}/${c.pages ?? "?"}'),
                    const SizedBox(height: 10),
                    TextField(
                        key: const ValueKey('comic-prompt-output'),
                        controller: output,
                        enabled: editable,
                        minLines: 5,
                        maxLines: 14,
                        onChanged: c.editOutput,
                        decoration: InputDecoration(
                            labelText: t('output'),
                            border: const OutlineInputBorder(),
                            alignLabelWithHint: true)),
                    const SizedBox(height: 10),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      OutlinedButton.icon(
                          onPressed: () async {
                            await Clipboard.setData(
                                ClipboardData(text: c.output));
                            if (context.mounted) {
                              ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                                  SnackBar(content: Text(t('copied'))));
                            }
                          },
                          icon: const Icon(Icons.copy),
                          label: Text(t('copy'))),
                      if (c.canContinue)
                        FilledButton.icon(
                            key: const ValueKey('comic-next-batch'),
                            onPressed: () => unawaited(c.generate(next: true)),
                            icon: const Icon(Icons.playlist_add),
                            label: Text(
                                '${t('next')} · ${c.completedPages + 1}–${(c.completedPages + c.format.batchLimit).clamp(1, c.pages ?? 30)}')),
                      if (widget.onImport != null)
                        FilledButton.icon(
                            key: const ValueKey('comic-import-pages'),
                            onPressed:
                                c.canImport ? () => unawaited(_import()) : null,
                            icon: const Icon(Icons.download_outlined),
                            label: Text(t('import'))),
                    ]),
                    if (!c.outputCurrent)
                      Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(t('stale'),
                              style: Theme.of(context).textTheme.bodySmall)),
                  ],
                  if (c.raw.isNotEmpty || c.notes.isNotEmpty)
                    ExpansionTile(title: Text(t('raw')), children: [
                      if (c.notes.isNotEmpty)
                        Padding(
                            padding: const EdgeInsets.all(12),
                            child: SelectableText('${t('notes')}\n${c.notes}')),
                      if (c.raw.isNotEmpty)
                        Padding(
                            padding: const EdgeInsets.all(12),
                            child: SelectableText(c.raw)),
                    ]),
                  const SizedBox(height: 8),
                  Text(t('saved'),
                      style: Theme.of(context).textTheme.bodySmall),
                  Text(t('openTemplates'),
                      style: Theme.of(context).textTheme.bodySmall),
                ])));
  }
}
