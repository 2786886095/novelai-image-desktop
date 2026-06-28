import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/nai_models.dart';
import '../i18n/app_locales.dart';
import '../state/app_state.dart';
import '../ui/studio_shell.dart';

class AiLogScreen extends StatelessWidget {
  const AiLogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final logs = state.aiCallLog;
    final language = state.settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Scaffold(
      appBar: AppBar(
        title: Text(
            mobileUiFormatFor(language, 'aiLog.title', {'count': logs.length})),
        actions: [
          IconButton(
            tooltip: t('aiLog.refresh'),
            onPressed: state.markChanged,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: t('aiLog.clear'),
            onPressed: logs.isEmpty ? null : state.clearAiCallLog,
            icon: const Icon(Icons.delete_sweep_outlined),
          ),
        ],
      ),
      body: StudioContent(
        maxWidth: 980,
        child: logs.isEmpty
            ? Center(child: Text(t('aiLog.empty')))
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
                itemCount: logs.length,
                itemBuilder: (context, index) => _LogCard(entry: logs[index]),
              ),
      ),
    );
  }
}

class _LogCard extends StatelessWidget {
  final AiCallLogEntry entry;
  const _LogCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final color = entry.ok
        ? Theme.of(context).colorScheme.primary
        : Theme.of(context).colorScheme.error;
    final language = context.watch<AppState>().settings.language;
    String t(String key) => mobileUiTextFor(language, key);
    return Card(
      child: ExpansionTile(
        leading: Icon(
            entry.ok ? Icons.check_circle_outline : Icons.error_outline,
            color: color),
        title: Text(entry.label),
        subtitle: Text(
          '${entry.api} · ${entry.model} · ${_time(entry.time)}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        children: [
          _LogSection(title: 'System Prompt', text: entry.systemPrompt),
          _LogSection(title: 'User', text: entry.userText),
          _LogSection(
            title: entry.ok ? t('aiLog.returned') : t('aiLog.error'),
            text: entry.response,
          ),
        ],
      ),
    );
  }

  String _time(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}:${value.second.toString().padLeft(2, '0')}';
}

class _LogSection extends StatelessWidget {
  final String title;
  final String text;
  const _LogSection({required this.title, required this.text});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(title,
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                    ),
                    IconButton(
                      tooltip: mobileUiTextFor(
                          context.watch<AppState>().settings.language,
                          'aiLog.copy'),
                      visualDensity: VisualDensity.compact,
                      onPressed: () =>
                          Clipboard.setData(ClipboardData(text: text)),
                      icon: const Icon(Icons.copy_outlined, size: 18),
                    ),
                  ],
                ),
                SelectableText(text),
              ],
            ),
          ),
        ),
      );
}
