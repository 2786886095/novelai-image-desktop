import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../i18n/compatible_image_text.dart';

class CompatibleImageSettingsCard extends StatefulWidget {
  const CompatibleImageSettingsCard({super.key});
  @override
  State<CompatibleImageSettingsCard> createState() =>
      _CompatibleImageSettingsCardState();
}

class _CompatibleImageSettingsCardState
    extends State<CompatibleImageSettingsCard> {
  final url = TextEditingController(),
      keyValue = TextEditingController(),
      model = TextEditingController(),
      size = TextEditingController(),
      extensions = TextEditingController();
  String format = 'auto', message = '';
  String loadedId = '';
  bool saving = false, loading = true, visible = false;
  @override
  void initState() {
    super.initState();
    load(context.read<AppState>());
  }

  void load(AppState state) {
    final c = state.settings.compatibleImage;
    final id = c['credentialId'] as String? ?? '';
    loadedId = id;
    loading = true;
    message = '';
    keyValue.clear();
    url.text = c['baseUrl'] as String? ?? '';
    model.text = c['model'] as String? ?? '';
    size.text = c['size'] as String? ?? '1024x1024';
    format = c['responseFormat'] as String? ?? 'auto';
    extensions.text =
        const JsonEncoder.withIndent('  ').convert(c['extensions'] ?? {});
    state.storage.getCompatibleImageKey(id).then((value) {
      if (mounted && loadedId == id) {
        setState(() {
          // Never attach a late old key to a newer configuration.
          if ((state.settings.compatibleImage['credentialId'] as String? ??
                  '') ==
              id) keyValue.text = value ?? '';
          loading = false;
        });
      }
    }).catchError((Object _) {
      if (mounted && loadedId == id) {
        setState(() {
          loading = false;
          message = compatibleImageText(state.settings.language)['invalid']!;
        });
      }
    });
  }

  @override
  void dispose() {
    for (final controller in [url, keyValue, model, size, extensions]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    final state = context.read<AppState>(),
        text = compatibleImageText(context.read<AppState>().settings.language);
    setState(() => saving = true);
    try {
      final parsed =
          jsonDecode(extensions.text.isEmpty ? '{}' : extensions.text);
      if (parsed is! Map<String, dynamic>) throw const FormatException();
      await state.saveCompatibleSettings({
        'baseUrl': url.text,
        'model': model.text,
        'size': size.text,
        'responseFormat': format,
        'extensions': parsed
      }, keyValue.text, expectedCredentialId: loadedId);
      if (mounted) {
        setState(() {
          loadedId =
              state.settings.compatibleImage['credentialId'] as String? ?? '';
          message = text['saved']!;
        });
      }
    } catch (_) {
      if (mounted) setState(() => message = text['invalid']!);
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        text = compatibleImageText(context.watch<AppState>().settings.language);
    final disabled = saving || loading;
    final stale = loadedId !=
        (state.settings.compatibleImage['credentialId'] as String? ?? '');
    Widget field(String id, TextEditingController controller,
            {String? help, int lines = 1}) =>
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: TextField(
                key: ValueKey('compatible-$id'),
                controller: controller,
                enabled: !disabled,
                maxLines: lines,
                decoration: InputDecoration(
                    labelText: text[id],
                    helperText: help,
                    helperMaxLines: 4,
                    border: const OutlineInputBorder())));
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(text['title']!,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(
                      '${text['current']}${state.settings.imageProvider == 'openai-images' ? '${text['panel']} · ${state.settings.compatibleImage['model'] ?? ''}' : text['native']}'),
                  Text(text['scope']!),
                  if (stale) ...[
                    Text(text['changed']!,
                        key: const ValueKey('compatible-config-changed')),
                    OutlinedButton(
                        key: const ValueKey('compatible-reload'),
                        onPressed:
                            disabled ? null : () => setState(() => load(state)),
                        child: Text(text['reload']!)),
                  ],
                  if (state.settings.imageProvider == 'openai-images')
                    OutlinedButton(
                        onPressed: disabled
                            ? null
                            : () async {
                                setState(() => saving = true);
                                try {
                                  await state.switchToNativeImages();
                                  if (mounted) {
                                    setState(() {
                                      if (!stale) {
                                        loadedId = state
                                                    .settings.compatibleImage[
                                                'credentialId'] as String? ??
                                            '';
                                      }
                                      message = text['switched']!;
                                    });
                                  }
                                } catch (_) {
                                  if (mounted) {
                                    setState(
                                        () => message = text['switchFailed']!);
                                  }
                                } finally {
                                  if (mounted) setState(() => saving = false);
                                }
                              },
                        child: Text(text['switchNative']!)),
                  ExpansionTile(
                      initiallyExpanded:
                          state.settings.imageProvider == 'openai-images',
                      title: Text(text['setup']!),
                      children: [
                        field('url', url, help: text['urlHelp']),
                        TextField(
                            key: const ValueKey('compatible-key'),
                            controller: keyValue,
                            enabled: !disabled,
                            obscureText: !visible,
                            autocorrect: false,
                            enableSuggestions: false,
                            decoration: InputDecoration(
                                labelText: text['key'],
                                border: const OutlineInputBorder(),
                                suffixIcon: IconButton(
                                    tooltip: text[visible ? 'hide' : 'show'],
                                    onPressed: () =>
                                        setState(() => visible = !visible),
                                    icon: Icon(visible
                                        ? Icons.visibility_off
                                        : Icons.visibility)))),
                        field('model', model),
                        field('size', size, help: text['sizeHelp']),
                        DropdownButtonFormField<String>(
                            value: format,
                            decoration:
                                InputDecoration(labelText: text['format']),
                            items: [
                              DropdownMenuItem(
                                  value: 'auto', child: Text(text['auto']!)),
                              const DropdownMenuItem(
                                  value: 'b64_json', child: Text('b64_json')),
                              const DropdownMenuItem(
                                  value: 'url', child: Text('URL'))
                            ],
                            onChanged: disabled
                                ? null
                                : (v) => setState(() => format = v!)),
                        field('extensions', extensions,
                            help: text['extensionHelp'], lines: 3),
                        FilledButton(
                            onPressed: disabled || stale ? null : save,
                            child: Text(text[saving ? 'saving' : 'save']!)),
                      ]),
                  if (message.isNotEmpty)
                    Text(message,
                        key: const ValueKey('compatible-settings-status')),
                  Text(text['privacy']!),
                ])));
  }
}

class CompatibleGenerateScreen extends StatelessWidget {
  final Widget preview;
  const CompatibleGenerateScreen({super.key, required this.preview});
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        text = compatibleImageText(context.watch<AppState>().settings.language);
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text(text['panel']!, style: Theme.of(context).textTheme.titleMedium),
      Text(
          '${state.settings.compatibleImage['model'] ?? ''} · ${state.settings.compatibleImage['size'] ?? ''}'),
      const SizedBox(height: 12),
      TextFormField(
          key: const ValueKey('compatible-prompt'),
          initialValue: state.params.positivePrompt,
          maxLines: 6,
          decoration: InputDecoration(
              labelText: text['prompt'], border: const OutlineInputBorder()),
          onChanged: (v) => state.setParam((p) => p.positivePrompt = v)),
      const SizedBox(height: 12),
      TextFormField(
          key: const ValueKey('compatible-count'),
          initialValue: '${state.batchCount}',
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: text['count']),
          onChanged: (v) {
            final n = int.tryParse(v);
            if (n != null && n > 0) state.setBatchCount(n);
          }),
      Text(text['requestHelp']!),
      Text(text['controlsHelp']!),
      OutlinedButton(
          onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => ChangeNotifierProvider.value(
                  value: state,
                  child: SafeArea(
                      child: SingleChildScrollView(
                          padding: EdgeInsets.only(
                              bottom: MediaQuery.viewInsetsOf(context).bottom),
                          child: const CompatibleImageSettingsCard())))),
          child: Text(text['settings']!)),
      FilledButton(
          onPressed: state.busy
              ? state.cancelGeneration
              : state.params.positivePrompt.trim().isEmpty
                  ? null
                  : state.generate,
          child: Text(text[state.busy ? 'stop' : 'generate']!)),
      Text(state.status, key: const ValueKey('compatible-generation-status')),
      const SizedBox(height: 12),
      preview,
    ]);
  }
}
