import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../prompts/translation.dart';
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
  bool busy = false, saving = false;
  String error = '', notice = '';
  String? previewTarget, previewSource;
  @override
  void initState() {
    super.initState();
    sourceController = TextEditingController(text: widget.source);
  }

  @override
  void dispose() {
    sourceController.dispose();
    resultController.dispose();
    super.dispose();
  }

  Future<void> _changeTarget(String value) async {
    if (busy || saving) return;
    final state = context.read<AppState>();
    setState(() {
      saving = true;
      resultController.clear();
      previewSource = null;
      error = '';
      notice = '';
    });
    try {
      await state.setSettings((s) =>
          s.translateTargetLanguage = normalizeTranslationPreference(value));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _run(String target) async {
    if (busy || saving || widget.source.trim().isEmpty) return;
    final state = context.read<AppState>(), source = widget.source;
    setState(() {
      busy = true;
      error = '';
      notice = '';
      resultController.clear();
      previewSource = null;
    });
    try {
      final result = await state.translateText(source, target: target);
      if (!mounted) return;
      if (result == null || result.trim().isEmpty) {
        setState(() => error = state.status);
        return;
      }
      setState(() {
        resultController.text = result.trim();
        previewSource = source;
        previewTarget = target;
      });
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _copy(Map<String, String> text) async {
    try {
      await Clipboard.setData(ClipboardData(text: resultController.text));
      if (mounted) setState(() => notice = text['copied']!);
    } catch (_) {
      if (mounted) setState(() => error = text['copyFailed']!);
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
                readOnly: true,
                maxLines: null,
                expands: true,
                decoration:
                    const InputDecoration(border: OutlineInputBorder())))
      ]);
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        text = translationText(state.settings.language);
    final preference = normalizeTranslationPreference(
            state.settings.translateTargetLanguage),
        target = resolveTranslationTarget(preference, state.settings.language);
    final hasPreview = previewSource != null;
    final stale = hasPreview &&
        (previewSource != widget.source ||
            !widget.isCurrent(previewSource!) ||
            previewTarget != target);
    final canApply = hasPreview && !busy && !saving && !stale;
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
                            StudioDropdownButtonFormField<String>(
                                value: preference,
                                isExpanded: true,
                                decoration: InputDecoration(
                                    labelText: text['target'],
                                    border: const OutlineInputBorder()),
                                items: [
                                  DropdownMenuItem(
                                      value: 'system',
                                      child: Text(
                                          '${text['system']} (${translationLanguages.firstWhere((l) => l.value == target).label})')),
                                  ...translationLanguages.map((l) =>
                                      DropdownMenuItem(
                                          value: l.value, child: Text(l.label)))
                                ],
                                onChanged: busy || saving
                                    ? null
                                    : (v) {
                                        if (v != null) _changeTarget(v);
                                      }),
                            const SizedBox(height: 12),
                            Text(text['hint']!),
                            const SizedBox(height: 16),
                            LayoutBuilder(builder: (context, constraints) {
                              final source =
                                      _field(text['source']!, sourceController),
                                  result =
                                      _field(text['result']!, resultController);
                              return constraints.maxWidth >= 600
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
                            if (busy)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(text['busy']!)),
                            if (notice.isNotEmpty)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(notice)),
                            if (error.isNotEmpty)
                              Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Text(error,
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
                            onPressed:
                                busy || saving || widget.source.trim().isEmpty
                                    ? null
                                    : () => _run(target),
                            child: Text(text[hasPreview ? 'retry' : 'run']!)),
                        OutlinedButton(
                            onPressed: canApply ? () => _copy(text) : null,
                            child: Text(text['copy']!)),
                        FilledButton(
                            onPressed: canApply
                                ? () {
                                    if (widget.isCurrent(previewSource!)) {
                                      Navigator.pop(
                                          context, resultController.text);
                                    } else {
                                      setState(() => error = text['stale']!);
                                    }
                                  }
                                : null,
                            child: Text(text['apply']!)),
                      ])),
            ])));
  }
}
