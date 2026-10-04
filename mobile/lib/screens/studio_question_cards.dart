import 'package:flutter/material.dart';
import '../agent/agent_questions.dart';
import '../i18n/studio_agent_text.dart';

class StudioQuestionCards extends StatefulWidget {
  final AgentQuestionRequest request;
  final String language;
  final bool Function(String requestId, String conversationId,
      List<Map<String, dynamic>>? answers) onRespond;
  const StudioQuestionCards(
      {super.key,
      required this.request,
      required this.language,
      required this.onRespond});
  @override
  State<StudioQuestionCards> createState() => _StudioQuestionCardsState();
}

class _StudioQuestionCardsState extends State<StudioQuestionCards> {
  int get index => widget.request.draftIndex;
  set index(int value) => widget.request.draftIndex = value;
  bool busy = false;
  String? error;
  Map<String, Map<String, dynamic>> get answers =>
      widget.request.confirmedAnswers;
  Map<String, String> get custom => widget.request.customDrafts;
  final input = TextEditingController();
  Set<String> get customIds => widget.request.customQuestionIds;
  @override
  void initState() {
    super.initState();
    restoreDraft();
  }

  void restoreDraft() {
    final request = widget.request;
    request.draftIndex =
        request.draftIndex.clamp(0, request.questions.length - 1);
    final validIds = request.questions.map((q) => q.id).toSet();
    custom.removeWhere(
        (id, text) => !validIds.contains(id) || text.length > 4000);
    customIds.removeWhere((id) => !validIds.contains(id));
    answers.removeWhere((id, answer) {
      if (!request.confirmedQuestionIds.contains(id) || !validIds.contains(id)) {
        return true;
      }
      try {
        final question = request.questions.firstWhere((q) => q.id == id);
        validateAgentQuestionAnswers(
            AgentQuestionRequest(request.conversationId, [question]), [answer]);
        return false;
      } catch (_) {
        return true;
      }
    });
    request.confirmedQuestionIds.removeWhere((id) => !answers.containsKey(id));
    input.text = custom[request.questions[index].id] ?? '';
  }

  void cancel() {
    if (busy) return;
    setState(() => busy = true);
    try {
      if (!widget.onRespond(
          widget.request.id, widget.request.conversationId, null)) {
        throw StateError('cancel failed');
      }
      widget.request.clearDraft();
    } catch (_) {
      setState(() {
        busy = false;
        error = t('questionFailed');
      });
    }
  }

  @override
  void didUpdateWidget(covariant StudioQuestionCards oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.request.id != widget.request.id) {
      oldWidget.request.clearDraft();
      busy = false;
      error = null;
      restoreDraft();
    }
  }

  String t(String key, {String? name}) =>
      studioAgentText(widget.language, key, name: name);
  @override
  void dispose() {
    input.dispose();
    super.dispose();
  }

  void move(int next) {
    setState(() {
      index = next;
      input.text = custom[widget.request.questions[index].id] ?? '';
    });
  }

  void choose(Map<String, dynamic> answer) {
    if (busy) return;
    if (answer['optionId'] != null) customIds.remove(answer['questionId']);
    answers[answer['questionId']] = answer;
    widget.request.confirmedQuestionIds.add(answer['questionId'] as String);
    error = null;
    if (answers.length == widget.request.questions.length) {
      final all =
          validateAgentQuestionAnswers(widget.request, answers.values.toList());
      setState(() => busy = true);
      bool ok;
      try {
        ok = widget.onRespond(
            widget.request.id, widget.request.conversationId, all);
      } catch (_) {
        ok = false;
      }
      if (ok) widget.request.clearDraft();
      if (!ok) {
        setState(() {
          busy = false;
          error = t('questionFailed');
        });
      }
      return;
    }
    move(
        widget.request.questions.indexWhere((q) => !answers.containsKey(q.id)));
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.request.questions[index],
        selected = answers[q.id]?['optionId'],
        color = Theme.of(context).colorScheme;
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(t('questionProgress',
                      name:
                          '${index + 1} / ${widget.request.questions.length}')),
                  const SizedBox(height: 8),
                  Text(q.prompt,
                      style: Theme.of(context).textTheme.titleMedium),
                  Text(t('questionManual'),
                      style: Theme.of(context).textTheme.bodySmall),
                  for (final o in q.options)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                                alignment: Alignment.centerLeft,
                                padding: const EdgeInsets.all(12),
                                backgroundColor: selected == o.id
                                    ? color.primaryContainer
                                    : null),
                            onPressed: busy
                                ? null
                                : () => choose(
                                    {'questionId': q.id, 'optionId': o.id}),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Wrap(spacing: 8, children: [
                                    Text(o.label),
                                    if (o.recommended)
                                      Text(t('questionRecommended'),
                                          style:
                                              TextStyle(color: color.primary))
                                  ]),
                                  if (o.description != null)
                                    Text(o.description!,
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodySmall)
                                ]))),
                  const SizedBox(height: 8),
                  OutlinedButton(
                      onPressed: busy
                          ? null
                          : () => setState(() {
                                customIds.add(q.id);
                                answers.remove(q.id);
                                widget.request.confirmedQuestionIds
                                    .remove(q.id);
                                input.text = custom[q.id] ?? '';
                              }),
                      style: OutlinedButton.styleFrom(
                          alignment: Alignment.centerLeft,
                          backgroundColor: customIds.contains(q.id)
                              ? color.primaryContainer
                              : null),
                      child: Text(t('questionCustom'))),
                  if (customIds.contains(q.id)) ...[
                    TextField(
                        controller: input,
                        enabled: !busy,
                        maxLength: 4000,
                        minLines: 1,
                        maxLines: 3,
                        decoration:
                            InputDecoration(hintText: t('questionCustomHint')),
                        onChanged: (value) {
                          custom[q.id] = value;
                          answers.remove(q.id);
                          widget.request.confirmedQuestionIds.remove(q.id);
                          setState(() {});
                        }),
                    Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                            onPressed: busy || input.text.trim().isEmpty
                                ? null
                                : () => choose({
                                      'questionId': q.id,
                                      'text': input.text.trim()
                                    }),
                            child: Text(t('questionConfirmCustom')))),
                  ],
                  if (error != null)
                    Text(error!, style: TextStyle(color: color.error)),
                  Wrap(alignment: WrapAlignment.spaceBetween, children: [
                    TextButton(
                        onPressed: busy ? null : cancel,
                        child: Text(t('questionCancel'))),
                    if (widget.request.questions.length > 1) ...[
                      TextButton(
                          onPressed:
                              busy || index == 0 ? null : () => move(index - 1),
                          child: Text(t('questionPrevious'))),
                      TextButton(
                          onPressed: busy ||
                                  index == widget.request.questions.length - 1
                              ? null
                              : () => move(index + 1),
                          child: Text(t('questionNext')))
                    ]
                  ]),
                ])));
  }
}
