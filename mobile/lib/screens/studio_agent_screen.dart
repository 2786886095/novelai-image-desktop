import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../agent/agent_controller.dart';
import '../agent/agent_models.dart';
import '../agent/agent_provider_catalog.dart';
import '../ui/studio_dropdown.dart';
import '../models/nai_models.dart';
import '../i18n/studio_agent_text.dart';
import '../state/app_state.dart';
import 'studio_agent_components.dart';

IconData _providerIcon(String id) => switch (id) {
      'deepseek' || 'mistral' => Icons.waves,
      'openrouter' => Icons.hub_outlined,
      'gemini' || 'xai' => Icons.auto_awesome,
      'ollama' || 'lm-studio' => Icons.computer_outlined,
      'volcengine' => Icons.local_fire_department_outlined,
      'moonshot' => Icons.nightlight_outlined,
      'groq' => Icons.bolt,
      'custom' => Icons.tune,
      'dashscope' || 'siliconflow' => Icons.cloud_outlined,
      _ => Icons.smart_toy_outlined,
    };

Widget _agentMenuLabel(IconData icon, String text) => Row(children: [
      Icon(icon, size: 18),
      const SizedBox(width: 10),
      Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis))
    ]);

/// A bounded software-tool assistant; legacy Tavern data remains on disk.
class StudioAgentScreen extends StatefulWidget {
  const StudioAgentScreen({super.key, this.controller});
  final AgentController? controller;
  @override
  State<StudioAgentScreen> createState() => _StudioAgentScreenState();
}

class _StudioAgentScreenState extends State<StudioAgentScreen> {
  AgentController? _agent;
  final _input = TextEditingController();
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final _drafts = <String, String>{};
  final _readingPositions = <String, double>{};
  final _readingAway = <String>{};
  bool _restoringScroll = false;
  String? _chatId, _loadError;
  bool _followLatest = true, _answering = false;
  String get _language => context.read<AppState>().settings.language;
  String _t(String key, {String? name}) =>
      studioAgentText(_language, key, name: name);
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_agent != null) return;
    _agent =
        widget.controller ?? AgentController(app: context.read<AppState>());
    _input.addListener(_onInput);
    _scroll.addListener(_onScroll);
    _agent!.addListener(_changed);
    if (_agent!.loaded) {
      _changed();
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    try {
      await _agent!.load();
      if (mounted) setState(() => _loadError = null);
    } catch (error) {
      if (mounted) setState(() => _loadError = '$error');
    }
  }

  void _onInput() {
    if (_chatId != null) {
      _drafts[_chatId!] = _input.text;
      _agent?.updateDraft(_chatId!, _input.text);
    }
    if (mounted) setState(() {});
  }

  void _onScroll() {
    if (!_scroll.hasClients || _restoringScroll) return;
    final following = _scroll.position.maxScrollExtent - _scroll.offset <= 100;
    if (_chatId != null) {
      _readingPositions[_chatId!] = _scroll.offset;
      if (following) {
        _readingAway.remove(_chatId);
      } else {
        _readingAway.add(_chatId!);
      }
    }
    if (following != _followLatest && mounted) {
      setState(() => _followLatest = following);
    }
  }

  void _changed() {
    if (!mounted) return;
    final id = _agent?.selectedConversation?.id;
    final switched = id != _chatId;
    if (switched) {
      if (_chatId != null && _scroll.hasClients) {
        _readingPositions[_chatId!] = _scroll.offset;
        if (!_followLatest) _readingAway.add(_chatId!);
      }
      _restoringScroll = true;
      _chatId = id;
      _input.text =
          _drafts[id] ?? _agent?.selectedConversation?.draftText ?? '';
      _followLatest = !_readingAway.contains(id);
    }
    setState(() {});
    if (switched || _followLatest) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _chatId == id && _scroll.hasClients) {
          final target = _followLatest
              ? _scroll.position.maxScrollExtent
              : (_readingPositions[id] ?? 0);
          _scroll.jumpTo(target.clamp(0.0, _scroll.position.maxScrollExtent));
          _restoringScroll = false;
        }
      });
    }
  }

  void _prefill(String text) {
    _input.text = text;
    _input.selection = TextSelection.collapsed(offset: text.length);
    _focus.requestFocus();
  }

  Future<void> _showTemplates() async {
    final app = _agent!.app;
    final entries = <(String, String, String, String)>[];
    for (final kind in ['convert', 'reverse']) {
      for (final version in ['v5', 'v4.5']) {
        for (final mode in ReversePromptMode.values) {
          final body =
              app.promptOverrides(kind, templateVersion: version)[mode.value];
          if (body != null && body.trim().isNotEmpty) {
            entries.add((kind, version, mode.value, body));
          }
        }
      }
    }
    for (final kind in ['optimize', 'assistant']) {
      final body = _agent!.workspace.agentTemplates[kind];
      if (body != null && body.trim().isNotEmpty) {
        entries.add((kind, '', '', body));
      }
    }
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
            child: ConstrainedBox(
                constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * .7),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  ListTile(title: Text(_t('savedTemplates'))),
                  Flexible(
                      child: entries.isEmpty
                          ? Center(
                              child: Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Text(_t('noSavedTemplates'))))
                          : ListView.builder(
                              shrinkWrap: true,
                              itemCount: entries.length,
                              itemBuilder: (context, index) {
                                final entry = entries[index];
                                return ListTile(
                                    title: Text(entry.$2.isEmpty
                                        ? entry.$1
                                        : '${entry.$1} · ${entry.$2} · ${entry.$3}'),
                                    subtitle: Text(entry.$4,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis),
                                    onTap: () async {
                                      Navigator.pop(sheetContext);
                                      await _agent!.selectPromptTemplate(
                                          entry.$1,
                                          mode: entry.$3.isEmpty
                                              ? null
                                              : entry.$3,
                                          version: entry.$2.isEmpty
                                              ? null
                                              : entry.$2);
                                      if (mounted) {
                                        _prefill(
                                            '${_t('useSavedTemplate')} ${entry.$1}${entry.$2.isEmpty ? '' : ' ${entry.$2} ${entry.$3}'}。');
                                      }
                                    });
                              }))
                ]))));
  }

  Future<void> _showContext() async {
    final agent = _agent!;
    final chat = agent.selectedConversation!;
    await showModalBottomSheet<void>(
        context: context,
        builder: (sheetContext) => SafeArea(
            child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_t('contextUsage'),
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(
                          '${chat.context.used} / ${chat.context.limit} ${_t('tokens')}${chat.context.estimated ? ' · ${_t('estimated')}' : ''}'),
                      const SizedBox(height: 8),
                      LinearProgressIndicator(
                          value: chat.context.percent / 100),
                      SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(_t('autoCompact')),
                          value: agent.app.settings.agentAutoCompact,
                          onChanged: agent.sending || agent.compacting
                              ? null
                              : (value) async {
                                  await agent.app.setSettings(
                                      (s) => s.agentAutoCompact = value);
                                  if (sheetContext.mounted) {
                                    Navigator.pop(sheetContext);
                                  }
                                  if (mounted) setState(() {});
                                }),
                      FilledButton.tonalIcon(
                          onPressed: agent.sending ||
                                  agent.compacting ||
                                  chat.messages.isEmpty
                              ? null
                              : () async {
                                  Navigator.pop(sheetContext);
                                  await agent.compact(chat.id);
                                },
                          icon: const Icon(Icons.compress),
                          label: Text(_t('compactNow'))),
                    ]))));
  }

  Future<void> _showAttachmentSources() async {
    final agent = _agent!;
    final app = agent.app;
    final sources = <(String, String, String)>[
      if (app.workbenchImage != null)
        ('canvas', 'current', _t('currentCanvas')),
      for (final item in app.referencePresets.take(30))
        ('reference', item.id, item.localizedName(_language)),
      for (final item in app.history.take(30))
        ('gallery', item.id, '${_t('galleryImage')} · ${item.date}'),
    ];
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
            child: ConstrainedBox(
                constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(sheetContext).height * .7),
                child: ListView(shrinkWrap: true, children: [
                  ListTile(
                      leading: const Icon(Icons.upload_file),
                      title: Text(_t('chooseFile')),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        agent.pickAttachments();
                      }),
                  for (final source in sources)
                    ListTile(
                        leading: const Icon(Icons.image_outlined),
                        title: Text(source.$3,
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(source.$1),
                        onTap: () async {
                          Navigator.pop(sheetContext);
                          try {
                            await agent.attachAppImage(source.$1, source.$2);
                          } catch (error) {
                            if (mounted) setState(() => agent.error = '$error');
                          }
                        }),
                ]))));
  }

  Future<void> _send() async {
    final agent = _agent;
    final chat = agent?.selectedConversation;
    if (agent == null ||
        chat == null ||
        agent.sending ||
        !agent.providerConfigured) return;
    final text = _input.text;
    if (text.trim().isEmpty && chat.draftAttachments.isEmpty) return;
    final before = chat.messages.where((m) => m.role == 'user').length;
    final id = chat.id;
    _input.clear();
    _focus.unfocus();
    _followLatest = true;
    try {
      await agent.sendStudio(text);
    } catch (error) {
      if (mounted) setState(() => agent.error = '$error');
    }
    if (mounted &&
        agent.error != null &&
        chat.messages.where((m) => m.role == 'user').length == before) {
      _drafts[id] = text;
      if (_chatId == id) _input.text = text;
    }
  }

  Future<void> _answer(String response, {bool revise = false}) async {
    if (_answering || _agent?.pendingPermission == null) return;
    setState(() => _answering = true);
    try {
      await _agent!.respondPermission(response);
      if (mounted && revise) _prefill(_t('changePlanDraft'));
    } finally {
      if (mounted) setState(() => _answering = false);
    }
  }

  Future<void> _configure() async {
    final agent = _agent!;
    final settings = agent.app.settings;
    final base = TextEditingController(text: settings.agentApiBaseUrl),
        model = TextEditingController(text: settings.agentApiModel);
    final key = TextEditingController(
        text: await agent.app.storage.getAgentApiKey() ?? '');
    if (!mounted) {
      base.dispose();
      model.dispose();
      key.dispose();
      return;
    }
    var protocol = settings.agentApiProtocol;
    var vision = settings.agentVisionEnabled;
    var presetId = '';
    var providerName = settings.agentProviderName;
    var contextWindow = settings.agentContextWindow;
    var maxOutputTokens = settings.agentMaxOutputTokens;
    var saving = false;
    String? error;
    final settingsRoute = DialogRoute<void>(
        context: context,
        barrierDismissible: false,
        builder: (dialogContext) => StatefulBuilder(
            builder: (context, change) => PopScope(
                canPop: !saving,
                child: AlertDialog(
                  title: Text(_t('modelSettings')),
                  content: SingleChildScrollView(
                      child: SizedBox(
                          width: 440,
                          child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(_t('configureHint')),
                                const SizedBox(height: 8),
                                Text(_t('imageApi'),
                                    style: TextStyle(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary)),
                                const SizedBox(height: 16),
                                StudioDropdownButtonFormField<String>(
                                    value: presetId,
                                    isExpanded: true,
                                    decoration: InputDecoration(
                                        labelText: _t('providerPreset')),
                                    items: [
                                      DropdownMenuItem(
                                          value: '',
                                          child: _agentMenuLabel(
                                              Icons.cloud_outlined,
                                              _t('selectProvider'))),
                                      for (final preset in agentProviderPresets)
                                        DropdownMenuItem(
                                            value: preset.id,
                                            child: _agentMenuLabel(
                                                _providerIcon(preset.id),
                                                preset.label)),
                                    ],
                                    onChanged: saving
                                        ? null
                                        : (id) {
                                            final preset = agentProviderPresets
                                                .where((p) => p.id == id)
                                                .firstOrNull;
                                            if (preset == null) return;
                                            change(() {
                                              presetId = preset.id;
                                              protocol = preset.protocol;
                                              base.text = preset.baseUrl;
                                              model.text = preset.model;
                                              key.clear();
                                              vision = preset.vision;
                                              providerName =
                                                  preset.providerName;
                                              contextWindow =
                                                  preset.contextWindow;
                                              maxOutputTokens =
                                                  preset.maxOutputTokens;
                                            });
                                          }),
                                const SizedBox(height: 12),
                                TextField(
                                    controller: base,
                                    keyboardType: TextInputType.url,
                                    autocorrect: false,
                                    decoration: InputDecoration(
                                        labelText: _t('apiAddress'),
                                        hintText:
                                            'https://your-provider.example/v1')),
                                const SizedBox(height: 12),
                                TextField(
                                    controller: model,
                                    autocorrect: false,
                                    decoration: InputDecoration(
                                        labelText: _t('modelId'))),
                                const SizedBox(height: 12),
                                TextField(
                                    controller: key,
                                    obscureText: true,
                                    autocorrect: false,
                                    enableSuggestions: false,
                                    decoration: InputDecoration(
                                        labelText: _t('apiKey'))),
                                ExpansionTile(
                                    tilePadding: EdgeInsets.zero,
                                    title: Text(_t('details')),
                                    children: [
                                      StudioDropdownButtonFormField<String>(
                                          value: protocol,
                                          isExpanded: true,
                                          decoration: InputDecoration(
                                              labelText: _t('protocol')),
                                          items: [
                                            DropdownMenuItem(
                                                value: 'openai-compatible',
                                                child: _agentMenuLabel(
                                                    Icons.chat_bubble_outline,
                                                    'OpenAI Chat Completions')),
                                            DropdownMenuItem(
                                                value: 'openai-responses',
                                                child: _agentMenuLabel(
                                                    Icons.smart_toy_outlined,
                                                    'OpenAI Responses')),
                                            DropdownMenuItem(
                                                value: 'anthropic-messages',
                                                child: _agentMenuLabel(
                                                    Icons.auto_awesome,
                                                    'Anthropic Messages')),
                                            DropdownMenuItem(
                                                value: 'google-gemini',
                                                child: _agentMenuLabel(
                                                    Icons.auto_awesome,
                                                    'Google Gemini'))
                                          ],
                                          onChanged: saving
                                              ? null
                                              : (value) => change(() =>
                                                  protocol =
                                                      value ?? protocol)),
                                      CheckboxListTile(
                                          contentPadding: EdgeInsets.zero,
                                          title: Text(_t('imageAnalysis')),
                                          value: vision,
                                          onChanged: saving
                                              ? null
                                              : (value) => change(() =>
                                                  vision = value ?? vision)),
                                    ]),
                                if (error != null)
                                  Text(error!,
                                      style: TextStyle(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .error)),
                              ]))),
                  actions: [
                    TextButton(
                        onPressed:
                            saving ? null : () => Navigator.pop(dialogContext),
                        child: Text(_t('cancel'))),
                    FilledButton(
                        onPressed: saving
                            ? null
                            : () async {
                                final uri = Uri.tryParse(base.text.trim());
                                if (uri == null ||
                                    !['http', 'https'].contains(uri.scheme) ||
                                    uri.host.isEmpty ||
                                    uri.userInfo.isNotEmpty ||
                                    model.text.trim().isEmpty) {
                                  change(() => error = _t('configInvalid'));
                                  return;
                                }
                                change(() {
                                  saving = true;
                                  error = null;
                                });
                                try {
                                  await agent.saveProvider(
                                      protocol: protocol,
                                      baseUrl: base.text.trim(),
                                      apiKey: key.text.trim(),
                                      model: model.text.trim(),
                                      providerName: providerName,
                                      contextWindow: contextWindow,
                                      maxOutputTokens: maxOutputTokens,
                                      autoCompact: settings.agentAutoCompact,
                                      compactThreshold:
                                          settings.agentAutoCompactThreshold,
                                      visionEnabled: vision);
                                  if (dialogContext.mounted) {
                                    Navigator.pop(dialogContext);
                                  }
                                } catch (reason) {
                                  if (context.mounted) {
                                    change(() {
                                      error = '$reason';
                                      saving = false;
                                    });
                                  }
                                }
                              },
                        child: Text(_t(saving ? 'saveBusy' : 'save')))
                  ],
                ))));
    await Navigator.of(context).push(settingsRoute);
    await settingsRoute.completed;
    base.dispose();
    model.dispose();
    key.dispose();
  }

  Future<void> _chatAction(AgentConversation chat, String action) async {
    if (_agent!.sending || _agent!.compacting) return;
    if (action == 'archive' || action == 'restore') {
      try {
        await _agent!.setConversationArchived(chat.id, action == 'archive');
      } catch (reason) {
        if (mounted)
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('$reason')));
      }
      return;
    }
    final name = TextEditingController(text: chat.title);
    final chatRoute = DialogRoute<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(_t('rename')),
                content: TextField(
                    controller: name,
                    maxLength: 100,
                    autofocus: true,
                    decoration: InputDecoration(labelText: _t('chatName'))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: Text(_t('cancel'))),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: Text(_t('save')))
                ]));
    final accepted = await Navigator.of(context).push(chatRoute);
    await chatRoute.completed;
    if (accepted == true && mounted) {
      if (action == 'rename') {
        _agent!.renameConversation(chat.id, name.text);
      }
    }
    name.dispose();
  }

  Widget _chatList({VoidCallback? close}) => _StudioChatList(
      agent: _agent!,
      language: _language,
      onAction: _chatAction,
      onConfigure: _configure,
      close: close);
  Future<void> _preview(AgentAttachment image) async {
    await showDialog<void>(
        context: context,
        builder: (context) => Dialog.fullscreen(
            child: Scaffold(
                appBar: AppBar(
                    title: Text(_t('preview')),
                    leading: IconButton(
                        tooltip: _t('close'),
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.pop(context))),
                body: Center(
                    child: InteractiveViewer(
                        minScale: .5,
                        maxScale: 5,
                        child: Image.file(File(image.filePath),
                            errorBuilder: (_, __, ___) =>
                                Text(_t('missingImage'))))))));
  }

  Widget? _webSources(AgentToolExecution tool) {
    if (tool.name != 'langbai_search_web' || tool.output == null) return null;
    try {
      final data = jsonDecode(tool.output!);
      if (data is! Map || data['sources'] is! List) return null;
      final sources = (data['sources'] as List).whereType<Map>().toList();
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (final source in sources)
          if (Uri.tryParse(source['url']?.toString() ?? '') case final uri?)
            if (const {'http', 'https'}.contains(uri.scheme) &&
                uri.host.isNotEmpty &&
                uri.userInfo.isEmpty)
              ListTile(
                  dense: true,
                  title: Text(source['title']?.toString() ?? uri.host),
                  subtitle: Text('${source['snippet'] ?? ''}\n$uri',
                      maxLines: 4, overflow: TextOverflow.ellipsis),
                  onTap: () =>
                      launchUrl(uri, mode: LaunchMode.externalApplication)),
      ]);
    } catch (_) {
      return null;
    }
  }

  Widget _message(AgentMessage message) {
    final color = Theme.of(context).colorScheme;
    return Align(
        alignment: message.role == 'user'
            ? Alignment.centerRight
            : Alignment.centerLeft,
        child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Container(
                margin: const EdgeInsets.only(bottom: 20),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                    color: message.role == 'user'
                        ? color.primaryContainer
                        : color.surface,
                    borderRadius: BorderRadius.circular(12)),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_t(message.role == 'user' ? 'you' : 'title'),
                          style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: color.primary)),
                      const SizedBox(height: 8),
                      if (message.content.isNotEmpty)
                        MarkdownBody(
                            data: message.content,
                            selectable: true,
                            onTapLink: (_, href, __) {
                              final uri = Uri.tryParse(href ?? '');
                              if (uri != null &&
                                  ['http', 'https'].contains(uri.scheme)) {
                                launchUrl(uri,
                                    mode: LaunchMode.externalApplication);
                              }
                            }),
                      if (message.error != null) ...[
                        Text(message.error!,
                            style: TextStyle(color: color.error)),
                        Text(_t('errorHint'),
                            style: const TextStyle(fontSize: 12))
                      ],
                      if (message.status == 'aborted')
                        Text(_t('statusStopped')),
                      if (message.tools.isNotEmpty)
                        StudioAgentToolGroup(
                            key: ValueKey('tool-group-${message.id}'),
                            title: _t('toolProgress',
                                name: '${message.tools.length}'),
                            attention: message.tools.any((tool) => [
                                  'pending',
                                  'running',
                                  'failed',
                                  'error'
                                ].contains(tool.status)),
                            children: [
                              for (final tool in message.tools) ...[
                                const SizedBox(height: 10),
                                Row(children: [
                                  Icon(
                                      ['running', 'pending']
                                              .contains(tool.status)
                                          ? Icons.pending_outlined
                                          : tool.status == 'denied'
                                              ? Icons.block
                                              : tool.status == 'failed'
                                                  ? Icons.error_outline
                                                  : Icons.check_circle_outline,
                                      size: 16,
                                      color: color.primary),
                                  const SizedBox(width: 6),
                                  Expanded(
                                      child: Text(
                                          tool.name ==
                                                  'langbai_prepare_generation'
                                              ? _t('planTitle')
                                              : tool.title,
                                          style:
                                              const TextStyle(fontSize: 13))),
                                  Text(_t(studioToolStatus(tool.status)),
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: color.onSurfaceVariant))
                                ]),
                                if (studioPreparedPreview(tool)
                                    case final preview?)
                                  if (!(_agent!.pendingPermission != null &&
                                      message ==
                                          _agent!.selectedConversation?.messages
                                              .last))
                                    StudioAgentPlanCard(
                                        preview: preview, language: _language),
                                if (tool.status == 'denied')
                                  Text(_t('cancelledSafe')),
                                if (tool.output != null || tool.error != null)
                                  ExpansionTile(
                                      tilePadding: EdgeInsets.zero,
                                      minTileHeight: 34,
                                      title: Text(_t('details'),
                                          style: const TextStyle(fontSize: 12)),
                                      children: [
                                        if (_webSources(tool)
                                            case final sources?)
                                          sources,
                                        SelectableText(
                                            tool.error ?? tool.output ?? '',
                                            style:
                                                const TextStyle(fontSize: 12))
                                      ]),
                              ],
                            ]),
                      for (final image in message.attachments
                          .where((a) => a.kind == 'image')) ...[
                        Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Semantics(
                                label: _t('preview'),
                                button: true,
                                child: InkWell(
                                    onTap: () => _preview(image),
                                    child: ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: Image.file(File(image.filePath),
                                            height: 240,
                                            errorBuilder: (_, __, ___) =>
                                                Text(_t('missingImage'))))))),
                        if (message.role == 'assistant')
                          TextButton.icon(
                              onPressed: () =>
                                  _prefill(_t('continueImageDraft')),
                              icon: const Icon(Icons.edit_outlined, size: 16),
                              label: Text(_t('continueImage'))),
                      ],
                      if (message.content.isNotEmpty)
                        Wrap(children: [
                          TextButton.icon(
                              onPressed: () async {
                                await Clipboard.setData(
                                    ClipboardData(text: message.content));
                                if (mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text(_t('copied'))));
                                }
                              },
                              icon: const Icon(Icons.copy_outlined, size: 16),
                              label: Text(_t('copy'))),
                          if (message.role == 'user')
                            TextButton.icon(
                                onPressed: () => _prefill(message.content),
                                icon: const Icon(Icons.edit_outlined, size: 16),
                                label: Text(_t('editRequest')))
                        ]),
                    ]))));
  }

  Widget _empty() => Padding(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 12),
      child: Column(children: [
        Icon(Icons.auto_awesome_outlined,
            size: 36, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 16),
        Text(_t('heroTitle'),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
            textAlign: TextAlign.center),
        const SizedBox(height: 12),
        Text(_t('heroBody'), textAlign: TextAlign.center),
        const SizedBox(height: 24),
        Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              OutlinedButton.icon(
                  onPressed: () => _prefill(_t('quickSettingsDraft')),
                  icon: const Icon(Icons.tune, size: 18),
                  label: Text(_t('quickSettings'))),
              OutlinedButton.icon(
                  onPressed: () => _prefill(_t('quickPromptDraft')),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: Text(_t('quickPrompt'))),
              OutlinedButton.icon(
                  onPressed: () {
                    _prefill(_t('quickReferenceDraft'));
                    _agent!.pickAttachments();
                  },
                  icon: const Icon(Icons.image_outlined, size: 18),
                  label: Text(_t('quickReference')))
            ])
      ]));
  Widget _pending(AgentPermissionRequest request) {
    if (request.tool == 'langbai_generate_image') {
      return StudioAgentPlanCard(
          preview: request.arguments,
          language: _language,
          busy: _answering,
          onConfirm: () => _answer('once'),
          onCancel: () => _answer('reject'),
          onRevise: () => _answer('reject', revise: true));
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_t('confirmTool', name: request.title),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Expanded(
              child: SingleChildScrollView(
                  child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(_t('confirmationHint')),
              if (request.arguments['positivePrompt'] != null)
                SelectableText('${request.arguments['positivePrompt']}'),
              if ([
                'langbai_upscale_image',
                'langbai_redraw_image',
                'langbai_inpaint_image',
                'langbai_director_image'
              ].contains(request.tool))
                Text(_t('unknownCost')),
            ],
          ))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
                child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44)),
                    onPressed: _answering ? null : () => _answer('reject'),
                    child: Text(_t('cancel')))),
            const SizedBox(width: 8),
            Expanded(
                child: FilledButton(
                    style:
                        FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: _answering ? null : () => _answer('once'),
                    child: Text(_t('confirm')))),
          ]),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final agent = _agent, chat = agent?.selectedConversation;
    if (_loadError != null) {
      return Scaffold(
          body: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(_t('loadFailed')),
        SelectableText(_loadError!),
        FilledButton(onPressed: _load, child: Text(_t('retry')))
      ])));
    }
    if (agent == null || !agent.loaded || chat == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final archived = chat.archivedAt != null;
    final wide = MediaQuery.sizeOf(context).width >= 840;
    final color = Theme.of(context).colorScheme;
    final main = LayoutBuilder(builder: (context, constraints) {
      final compact = constraints.maxHeight < 520 ||
          MediaQuery.viewInsetsOf(context).bottom > 0;
      final decisionHeight =
          ((constraints.maxHeight - (compact ? 100 : 140)) * .44)
              .clamp(120.0, 320.0);
      return Column(children: [
        if (archived)
          Material(
              color: color.surfaceContainerLow,
              child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Row(children: [
                    const Icon(Icons.archive_outlined, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(_t('archivedReadOnly'),
                            style: const TextStyle(fontSize: 12))),
                    TextButton(
                        onPressed: agent.sending
                            ? null
                            : () =>
                                agent.setConversationArchived(chat.id, false),
                        child: Text(_t('restoreChat')))
                  ]))),
        if (!agent.providerConfigured && !archived)
          Container(
              color: color.primaryContainer,
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(_t('missingModel'),
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      if (!compact)
                        Text(_t('setupBody'),
                            style: const TextStyle(fontSize: 12))
                    ])),
                const SizedBox(width: 8),
                FilledButton(onPressed: _configure, child: Text(_t('setup')))
              ])),
        Expanded(
            child: Stack(children: [
          ListView(
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              children: [
                if (chat.messages.isEmpty) _empty(),
                for (final message
                    in chat.messages.where((m) => m.role != 'system'))
                  _message(message),
                if (agent.sending && agent.pendingPermission == null)
                  Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(children: [
                        const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2)),
                        const SizedBox(width: 12),
                        Expanded(child: Text(_t('workingBody')))
                      ]))
              ]),
          if (!_followLatest)
            Positioned(
                right: 12,
                bottom: 8,
                child: FilledButton.tonalIcon(
                    onPressed: () {
                      setState(() => _followLatest = true);
                      _scroll.jumpTo(_scroll.position.maxScrollExtent);
                    },
                    icon: const Icon(Icons.arrow_downward, size: 16),
                    label: Text(_t('latest'))))
        ])),
        if (agent.pendingPermission case final request?)
          SizedBox(
              key: const ValueKey('agent-decision-tray'),
              height: decisionHeight,
              width: double.infinity,
              child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: _pending(request))),
        if (agent.error != null)
          Padding(
              padding: const EdgeInsets.all(8),
              child: Row(children: [
                Expanded(
                    child: Tooltip(
                        message: agent.error!,
                        child: Text(agent.error!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: color.error)))),
                IconButton(
                    tooltip: _t('close'),
                    onPressed: () => setState(() => agent.error = null),
                    icon: const Icon(Icons.close, size: 18))
              ])),
        if (chat.draftAttachments.isNotEmpty)
          SizedBox(
              height: compact ? 52 : 64,
              child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  children: [
                    for (final file in chat.draftAttachments)
                      Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: InputChip(
                              avatar: file.kind == 'image'
                                  ? GestureDetector(
                                      onTap: () => _preview(file),
                                      child: Image.file(File(file.filePath),
                                          errorBuilder: (_, __, ___) =>
                                              const Icon(Icons.image_outlined)))
                                  : const Icon(Icons.attachment),
                              label: ConstrainedBox(
                                  constraints:
                                      const BoxConstraints(maxWidth: 160),
                                  child: Text(file.name,
                                      overflow: TextOverflow.ellipsis)),
                              onDeleted: agent.sending
                                  ? null
                                  : () => agent.removeDraftAttachment(file.id)))
                  ])),
        SafeArea(
            top: false,
            child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
                child: Column(children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    IconButton(
                        tooltip: _t('addAttachment'),
                        onPressed: agent.sending || archived
                            ? null
                            : _showAttachmentSources,
                        icon: const Icon(Icons.add)),
                    Expanded(
                        child: TextField(
                            controller: _input,
                            readOnly: archived,
                            focusNode: _focus,
                            minLines: 1,
                            maxLines: compact ? 3 : 5,
                            key: const ValueKey('agent-composer-input'),
                            keyboardType: TextInputType.multiline,
                            textInputAction: TextInputAction.newline,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: InputDecoration(
                                hintText: _t('hint'),
                                filled: true,
                                fillColor: color.surfaceContainerLow,
                                contentPadding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 10),
                                border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(16))))),
                    const SizedBox(width: 4),
                    IconButton.filled(
                        tooltip: agent.sending ? _t('stop') : _t('send'),
                        icon: Icon(
                            agent.sending ? Icons.stop : Icons.arrow_upward),
                        onPressed: agent.sending
                            ? agent.abort
                            : archived ||
                                    !agent.providerConfigured ||
                                    (_input.text.trim().isEmpty &&
                                        chat.draftAttachments.isEmpty)
                                ? null
                                : _send)
                  ]),
                  SizedBox(
                      height: 44,
                      child: Row(children: [
                        PopupMenuButton<String>(
                            key: const ValueKey('agent-model-selector'),
                            tooltip: _t('modelSettings'),
                            enabled: !agent.sending,
                            onSelected: (_) => _configure(),
                            itemBuilder: (_) => [
                                  PopupMenuItem(
                                      value: 'configure',
                                      child: _agentMenuLabel(
                                          Icons.settings_outlined,
                                          _t('modelSettings')))
                                ],
                            child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 8),
                                child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(Icons.auto_awesome, size: 15),
                                      const SizedBox(width: 4),
                                      ConstrainedBox(
                                          constraints: BoxConstraints(
                                              maxWidth:
                                                  MediaQuery.sizeOf(context)
                                                              .width <
                                                          380
                                                      ? 88
                                                      : 150),
                                          child: Text(
                                              agent.app.settings.agentApiModel
                                                      .isEmpty
                                                  ? _t('setup')
                                                  : agent.app.settings
                                                      .agentApiModel,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis)),
                                      const Icon(Icons.arrow_drop_down,
                                          size: 18),
                                    ]))),
                        const Spacer(),
                        IconButton(
                            key: const ValueKey('agent-template-selector'),
                            visualDensity: VisualDensity.compact,
                            tooltip: _t('savedTemplates'),
                            onPressed: agent.sending || archived
                                ? null
                                : _showTemplates,
                            icon: const Icon(Icons.description_outlined,
                                size: 18)),
                        TextButton.icon(
                            key: const ValueKey('agent-context-control'),
                            style: TextButton.styleFrom(
                                visualDensity: VisualDensity.compact),
                            onPressed: _showContext,
                            icon: Icon(Icons.data_usage,
                                size: 16,
                                color:
                                    chat.context.danger ? color.error : null),
                            label: Text('${chat.context.percent.round()}%')),
                      ])),
                ]))),
      ]);
    });
    return Scaffold(
        drawer: wide
            ? null
            : Drawer(
                child: SafeArea(
                    child: Builder(
                        builder: (drawerContext) => _chatList(
                            close: () => Navigator.pop(drawerContext))))),
        appBar: wide
            ? null
            : AppBar(
                toolbarHeight: 44,
                leading: Builder(
                    builder: (barContext) => IconButton(
                        tooltip: _t('chats'),
                        icon: const Icon(Icons.chat_bubble_outline, size: 20),
                        onPressed: () => Scaffold.of(barContext).openDrawer())),
                title: Text(chat.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w500))),
        body: wide
            ? Row(children: [
                SizedBox(width: 228, child: _chatList()),
                const VerticalDivider(width: 1),
                Expanded(child: main)
              ])
            : main);
  }

  @override
  void dispose() {
    if (_agent != null && _chatId != null) {
      _agent!.updateDraft(_chatId!, _input.text);
      unawaited(_agent!.saveWorkspace());
    }
    _agent?.removeListener(_changed);
    if (widget.controller == null) {
      _agent?.abort();
      _agent?.dispose();
    }
    _input.removeListener(_onInput);
    _scroll.removeListener(_onScroll);
    _input.dispose();
    _focus.dispose();
    _scroll.dispose();
    super.dispose();
  }
}

class _StudioChatList extends StatefulWidget {
  const _StudioChatList(
      {required this.agent,
      required this.language,
      required this.onAction,
      required this.onConfigure,
      this.close});
  final AgentController agent;
  final String language;
  final Future<void> Function(AgentConversation, String) onAction;
  final VoidCallback onConfigure;
  final VoidCallback? close;
  @override
  State<_StudioChatList> createState() => _StudioChatListState();
}

class _StudioChatListState extends State<_StudioChatList> {
  String search = '';
  bool archivedView = false;
  String t(String key) => studioAgentText(widget.language, key);
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: widget.agent,
      builder: (context, _) => Padding(
          padding: const EdgeInsets.all(12),
          child: Column(children: [
            Row(children: [
              const Icon(Icons.auto_awesome, size: 20),
              const SizedBox(width: 8),
              Expanded(
                  child: Text(t('title'),
                      style: const TextStyle(fontWeight: FontWeight.w600))),
              IconButton(
                  tooltip: t('modelSettings'),
                  onPressed: widget.agent.sending ? null : widget.onConfigure,
                  icon: const Icon(Icons.settings_outlined, size: 20))
            ]),
            const SizedBox(height: 4),
            FilledButton.tonalIcon(
                onPressed: widget.agent.sending
                    ? null
                    : () {
                        setState(() => archivedView = false);
                        widget.agent.createConversation(t('newChat'));
                        widget.close?.call();
                      },
                icon: const Icon(Icons.add),
                label: Text(t('newChat'))),
            const SizedBox(height: 12),
            TextField(
                decoration: InputDecoration(
                    hintText: t('searchChats'),
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder()),
                onChanged: (value) => setState(() => search = value)),
            const SizedBox(height: 8),
            SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(
                      value: false,
                      icon: const Icon(Icons.chat_bubble_outline, size: 16),
                      label: Text(t('activeChats'))),
                  ButtonSegment(
                      value: true,
                      icon: const Icon(Icons.archive_outlined, size: 16),
                      label: Text(t('archivedChats')))
                ],
                selected: {archivedView},
                onSelectionChanged: (value) =>
                    setState(() => archivedView = value.first)),
            const SizedBox(height: 6),
            Expanded(
                child: ListView(children: [
              if (!widget.agent.workspace.conversations.any((c) =>
                  (c.archivedAt != null) == archivedView &&
                  c.title.toLowerCase().contains(search.toLowerCase())))
                Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(t(archivedView ? 'noArchivedChats' : 'noChats'),
                        style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant))),
              for (final chat in widget.agent.workspace.conversations.where(
                  (c) =>
                      (c.archivedAt != null) == archivedView &&
                      c.title.toLowerCase().contains(search.toLowerCase())))
                ListTile(
                    contentPadding: EdgeInsets.zero,
                    selected: chat.id == widget.agent.selectedConversation?.id,
                    title: Text(chat.title,
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    leading: const Icon(Icons.chat_bubble_outline, size: 18),
                    onTap: widget.agent.sending
                        ? null
                        : () {
                            widget.agent.selectConversation(chat.id);
                            widget.close?.call();
                          },
                    trailing: PopupMenuButton<String>(
                        tooltip: t('chatActions'),
                        enabled:
                            !widget.agent.sending && !widget.agent.compacting,
                        onSelected: (action) async {
                          await widget.onAction(chat, action);
                          if (mounted && action == 'restore')
                            setState(() => archivedView = false);
                        },
                        itemBuilder: (_) => [
                              PopupMenuItem(
                                  value: 'rename',
                                  child: _agentMenuLabel(
                                      Icons.edit_outlined, t('rename'))),
                              PopupMenuItem(
                                  value: chat.archivedAt == null
                                      ? 'archive'
                                      : 'restore',
                                  child: _agentMenuLabel(
                                      chat.archivedAt == null
                                          ? Icons.archive_outlined
                                          : Icons.unarchive_outlined,
                                      t(chat.archivedAt == null
                                          ? 'archiveChat'
                                          : 'restoreChat')))
                            ]))
            ]))
          ])));
}
