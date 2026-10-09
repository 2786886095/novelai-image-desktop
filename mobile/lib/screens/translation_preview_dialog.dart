import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../prompts/translation.dart';
import '../prompts/translation_session.dart';
import '../ui/studio_dropdown.dart';

class TranslationPreviewDialog extends StatefulWidget {
  final String source;
  final bool Function(String expected) isCurrent;
  const TranslationPreviewDialog(
      {super.key, required this.source, required this.isCurrent});
  @override
  State<TranslationPreviewDialog> createState() =>
      _TranslationPreviewDialogState();
}

class _TranslationPreviewDialogState extends State<TranslationPreviewDialog> {
  late final TextEditingController sourceController;
  final resultController = TextEditingController();
  late AppState app;
  late TranslationSession session;
  bool initialized = false, saving = false, syncing = false;
  String localError = '', notice = '';
  @override
  void initState() {
    super.initState();
    sourceController = TextEditingController(text: widget.source);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (initialized) return;
    initialized = true;
    app = context.read<AppState>();
    session = TranslationSession(
        widget.source,
        resolveTranslationTarget(
            app.settings.translateTargetLanguage, app.settings.language),
        (source, to, from) async {
      final reply = await app.translatePreviewText(source,
          target: to, sourceLanguage: from);
      return TranslationReply(
          ok: reply.ok,
          text: reply.text,
          error: reply.message,
          sourceLanguage: reply.sourceLanguage);
    },
        live: app.settings.translateRealtime,
        sourceLanguage: app.settings.translateSourceLanguage);
    session.addListener(_changed);
    sourceController.addListener(_sourceChanged);
    resultController.addListener(_resultChanged);
    app.addListener(_settingsChanged);
    session.start();
  }

  void _settingsChanged() {
    if (!mounted || saving) return;
    session.setLive(app.settings.translateRealtime);
    session.setLanguages(
        app.settings.translateSourceLanguage,
        resolveTranslationTarget(
            app.settings.translateTargetLanguage, app.settings.language));
  }

  void _sync(TextEditingController controller, String text) {
    if (controller.text != text) {
      controller.value = TextEditingValue(
          text: text, selection: TextSelection.collapsed(offset: text.length));
    }
  }

  void _changed() {
    if (!mounted) return;
    syncing = true;
    _sync(sourceController, session.source);
    _sync(resultController, session.result);
    syncing = false;
    setState(() {});
  }

  bool _composing(TextEditingController c) =>
      c.value.composing.isValid && !c.value.composing.isCollapsed;
  void _sourceChanged() {
    if (syncing) return;
    notice = '';
    localError = '';
    session.setComposing(_composing(sourceController));
    if (sourceController.text != session.source) {
      session.editSource(sourceController.text);
    }
  }

  void _resultChanged() {
    if (syncing) return;
    notice = '';
    localError = '';
    session.setComposing(_composing(resultController), scheduleOnEnd: false);
    if (resultController.text != session.result) {
      session.editResult(resultController.text);
    }
  }

  @override
  void dispose() {
    if (initialized) {
      app.removeListener(_settingsChanged);
      session.dispose();
    }
    sourceController.dispose();
    resultController.dispose();
    super.dispose();
  }

  Future<void> _persist(String from, String to) async {
    setState(() {
      saving = true;
      localError = '';
      notice = '';
    });
    try {
      await app.setSettings((s) {
        s.translateSourceLanguage = from;
        s.translateTargetLanguage = normalizeTranslationPreference(to);
      });
    } catch (e) {
      if (mounted) {
        session.setLanguages(
            app.settings.translateSourceLanguage,
            resolveTranslationTarget(
                app.settings.translateTargetLanguage, app.settings.language));
        setState(() => localError = '$e');
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _changeLive(bool value) async {
    final previous = session.live;
    setState(() {
      saving = true;
      localError = '';
      notice = '';
    });
    try {
      await session.persistLive(value,
          (enabled) => app.setSettings((s) => s.translateRealtime = enabled));
    } catch (e) {
      // setSettings mutates in memory before storage; restore that value too.
      app.settings.translateRealtime = previous;
      if (mounted) setState(() => localError = '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _copy(Map<String, String> text) async {
    try {
      await Clipboard.setData(ClipboardData(text: session.result));
      if (mounted) setState(() => notice = text['copied']!);
    } catch (_) {
      if (mounted) setState(() => localError = text['copyFailed']!);
    }
  }

  Widget _field(String label, TextEditingController controller) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label),
        const SizedBox(height: 8),
        SizedBox(
            height: 180,
            child: TextField(
                controller: controller,
                maxLines: null,
                expands: true,
                decoration: InputDecoration(
                    labelText: label, border: const OutlineInputBorder())))
      ]);
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        text = translationText(state.settings.language),
        editor = translationEditorText(state.settings.language);
    final target = resolveTranslationTarget(
        state.settings.translateTargetLanguage, state.settings.language);
    final preference = session.target == target
        ? normalizeTranslationPreference(state.settings.translateTargetLanguage)
        : session.target;
    final stale = !widget.isCurrent(widget.source);
    final canApply = session.valid &&
        session.result.trim().isNotEmpty &&
        !session.busy &&
        !session.composing &&
        !saving &&
        !stale;
    final sourceMenu = StudioDropdownButtonFormField<String>(
        value: session.sourceLanguage,
        isExpanded: true,
        decoration: InputDecoration(
            labelText: editor['sourceLanguage'],
            border: const OutlineInputBorder()),
        items: [
          DropdownMenuItem(value: 'auto', child: Text(editor['auto']!)),
          ...translationLanguages.map(
              (l) => DropdownMenuItem(value: l.value, child: Text(l.label)))
        ],
        onChanged: saving
            ? null
            : (v) {
                if (v != null) {
                  session.setLanguages(v, session.target);
                  _persist(v, state.settings.translateTargetLanguage);
                }
              });
    final targetMenu = StudioDropdownButtonFormField<String>(
        value: preference,
        isExpanded: true,
        decoration: InputDecoration(
            labelText: text['target'], border: const OutlineInputBorder()),
        items: [
          DropdownMenuItem(
              value: 'system',
              child: Text(
                  '${text['system']} (${translationLanguages.firstWhere((l) => l.value == target).label})')),
          ...translationLanguages.map(
              (l) => DropdownMenuItem(value: l.value, child: Text(l.label)))
        ],
        onChanged: saving
            ? null
            : (v) {
                if (v != null) {
                  session.setLanguages(session.sourceLanguage,
                      resolveTranslationTarget(v, state.settings.language));
                  _persist(session.sourceLanguage, v);
                }
              });
    final swap = IconButton(
        tooltip: session.canSwap ? editor['swap'] : editor['selectSource'],
        onPressed: !session.canSwap || saving
            ? null
            : () {
                if (session.swap()) {
                  _persist(session.sourceLanguage, session.target);
                }
              },
        icon: Semantics(
            label: editor['swap'], child: const Icon(Icons.swap_horiz)));
    return Dialog(
        child: ConstrainedBox(
            constraints: BoxConstraints(
                maxWidth: 900,
                maxHeight: MediaQuery.sizeOf(context).height * .88),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Padding(
                  padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
                  child: Row(children: [
                    Expanded(
                        child: Text(text['title']!,
                            style: Theme.of(context).textTheme.titleLarge)),
                    IconButton(
                        tooltip: text['cancel'],
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close))
                  ])),
              Flexible(
                  child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            LayoutBuilder(
                                builder: (context, c) => c.maxWidth >= 600
                                    ? Row(children: [
                                        Expanded(child: sourceMenu),
                                        swap,
                                        Expanded(child: targetMenu)
                                      ])
                                    : Column(children: [
                                        sourceMenu,
                                        swap,
                                        targetMenu
                                      ])),
                            const SizedBox(height: 12),
                            SwitchListTile(
                                key: const ValueKey('translation-live-toggle'),
                                contentPadding: EdgeInsets.zero,
                                title: Text(editor['live']!),
                                value: session.live,
                                onChanged: saving ? null : _changeLive),
                            Text(text['hint']!),
                            const SizedBox(height: 16),
                            LayoutBuilder(builder: (context, c) {
                              final source =
                                      _field(text['source']!, sourceController),
                                  result =
                                      _field(text['result']!, resultController);
                              return c.maxWidth >= 600
                                  ? Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                          Expanded(child: source),
                                          const SizedBox(width: 16),
                                          Expanded(child: result)
                                        ])
                                  : Column(children: [
                                      source,
                                      const SizedBox(height: 16),
                                      result
                                    ]);
                            }),
                            if (session.busy)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(text['busy']!)),
                            if (notice.isNotEmpty)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(notice)),
                            if (localError.isNotEmpty ||
                                session.error.isNotEmpty)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(
                                      localError.isNotEmpty
                                          ? localError
                                          : session.error ==
                                                  'TRANSLATION_FAILED'
                                              ? text['failed']!
                                              : session.error,
                                      style: TextStyle(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .error))),
                            if (stale)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(text['stale']!,
                                      style: TextStyle(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .error))),
                          ]))),
              Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  child: Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: Text(text['cancel']!)),
                        OutlinedButton(
                            onPressed: session.busy ||
                                    session.composing ||
                                    saving ||
                                    session.source.trim().isEmpty
                                ? null
                                : () {
                                    setState(() {
                                      notice = '';
                                      localError = '';
                                    });
                                    session.translate();
                                  },
                            child: Text(text[
                                session.result.isEmpty ? 'run' : 'retry']!)),
                        OutlinedButton(
                            onPressed: canApply ? () => _copy(text) : null,
                            child: Text(text['copy']!)),
                        FilledButton(
                            onPressed: canApply
                                ? () {
                                    if (widget.isCurrent(widget.source)) {
                                      Navigator.pop(context, session.result);
                                    } else {
                                      setState(
                                          () => localError = text['stale']!);
                                    }
                                  }
                                : null,
                            child: Text(text['apply']!)),
                      ])),
            ])));
  }
}
