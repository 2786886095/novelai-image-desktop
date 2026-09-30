import 'dart:convert';
import 'package:flutter/material.dart';
import '../agent/agent_models.dart';
import '../i18n/studio_agent_text.dart';

String studioToolStatus(String status) => switch (status) {
      'running' => 'statusRunning',
      'pending' => 'statusPending',
      'complete' || 'completed' => 'statusComplete',
      'denied' => 'statusDenied',
      'aborted' => 'statusStopped',
      _ => 'statusError',
    };
Map<String, dynamic>? studioPreparedPreview(AgentToolExecution tool) {
  if (tool.name != 'langbai_prepare_generation' ||
      !['complete', 'completed'].contains(tool.status) ||
      tool.output == null ||
      tool.output!.length > 20000) return null;
  try {
    final value = jsonDecode(tool.output!);
    return value is Map ? Map<String, dynamic>.from(value) : null;
  } catch (_) {
    return null;
  }
}

class StudioAgentPlanCard extends StatelessWidget {
  const StudioAgentPlanCard(
      {super.key,
      required this.preview,
      required this.language,
      this.onConfirm,
      this.onCancel,
      this.onRevise,
      this.busy = false});
  final Map<String, dynamic> preview;
  final String language;
  final VoidCallback? onConfirm, onCancel, onRevise;
  final bool busy;
  @override
  Widget build(BuildContext context) {
    String t(String key, {String? name}) =>
        studioAgentText(language, key, name: name);
    final color = Theme.of(context).colorScheme;
    final fields = <String, dynamic>{
      if (preview['model'] != null) 'model': preview['model'],
      if (preview['width'] != null && preview['height'] != null)
        'size': '${preview['width']} × ${preview['height']}',
      if (preview['steps'] != null) 'steps': preview['steps'],
      if (preview['count'] != null) 'count': preview['count']
    };
    final header = Row(children: [
      Icon(Icons.auto_awesome_outlined, color: color.primary, size: 18),
      const SizedBox(width: 6),
      Expanded(
          child: Text(t('planTitle'),
              style: const TextStyle(fontWeight: FontWeight.w600))),
      if (onConfirm != null)
        Text(t('statusPending'),
            style: TextStyle(fontSize: 12, color: color.primary)),
    ]);
    final body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
              preview['estimatedAnlas'] is num
                  ? t('estimatedCost', name: '${preview['estimatedAnlas']}')
                  : t('unknownCost'),
              style: TextStyle(color: color.primary, fontSize: 13)),
          if (preview['positivePrompt'] != null) ...[
            const SizedBox(height: 10),
            Text(t('prompt'),
                style: TextStyle(fontSize: 12, color: color.onSurfaceVariant)),
            const SizedBox(height: 4),
            SelectableText('${preview['positivePrompt']}'),
          ],
          const SizedBox(height: 10),
          Wrap(spacing: 16, runSpacing: 8, children: [
            for (final entry in fields.entries)
              ConstrainedBox(
                  constraints: const BoxConstraints(minWidth: 100),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t(entry.key),
                            style: TextStyle(
                                fontSize: 12, color: color.onSurfaceVariant)),
                        Text('${entry.value}',
                            style:
                                const TextStyle(fontWeight: FontWeight.w500)),
                      ])),
          ]),
          if (onConfirm != null) ...[
            const SizedBox(height: 8),
            Text(t('confirmationHint'), style: const TextStyle(fontSize: 12))
          ],
        ]);
    final footer = Row(children: [
      Expanded(
          child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 44)),
              onPressed: busy ? null : onCancel,
              child: Text(t('cancel')))),
      const SizedBox(width: 6),
      Expanded(
          child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 44)),
              onPressed: busy ? null : onRevise,
              child: Text(t('changePlan')))),
      const SizedBox(width: 6),
      Expanded(
          child: FilledButton(
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  minimumSize: const Size(0, 44)),
              onPressed: busy ? null : onConfirm,
              child: Text(t('confirm')))),
    ]);
    return LayoutBuilder(
        builder: (context, constraints) => Card(
              margin: const EdgeInsets.symmetric(vertical: 4),
              color: color.surfaceContainerLow,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(
                      color: onConfirm != null
                          ? color.primary
                          : color.outlineVariant)),
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        header,
                        const SizedBox(height: 8),
                        if (onConfirm != null && constraints.hasBoundedHeight)
                          Expanded(
                              child: SingleChildScrollView(
                                  primary: false, child: body))
                        else
                          body,
                        if (onConfirm != null) ...[
                          const SizedBox(height: 8),
                          footer
                        ],
                      ])),
            ));
  }
}

/// Completed tool chatter stays out of the reading flow; live/error rows are visible.
class StudioAgentToolGroup extends StatefulWidget {
  const StudioAgentToolGroup(
      {super.key,
      required this.title,
      required this.attention,
      required this.children});
  final String title;
  final bool attention;
  final List<Widget> children;
  @override
  State<StudioAgentToolGroup> createState() => _StudioAgentToolGroupState();
}

class _StudioAgentToolGroupState extends State<StudioAgentToolGroup> {
  bool? _expanded;
  @override
  Widget build(BuildContext context) {
    final open = _expanded ?? widget.attention;
    final color = Theme.of(context).colorScheme;
    return Container(
        margin: const EdgeInsets.only(top: 10),
        decoration: BoxDecoration(
            border: Border.all(color: color.outlineVariant),
            borderRadius: BorderRadius.circular(10)),
        child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                  button: true,
                  expanded: open,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(10),
                    onTap: () => setState(() => _expanded = !open),
                    child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 12),
                        child: Row(children: [
                          Icon(
                              widget.attention
                                  ? Icons.pending_outlined
                                  : Icons.check_circle_outline,
                              size: 16,
                              color: color.primary),
                          const SizedBox(width: 6),
                          Expanded(
                              child: Text(widget.title,
                                  style: TextStyle(
                                      fontSize: 13,
                                      color: color.onSurfaceVariant))),
                          Icon(open ? Icons.expand_less : Icons.expand_more,
                              size: 18),
                        ])),
                  )),
              if (open)
                Padding(
                    padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: widget.children)),
            ]));
  }
}
