import 'studio_question_cards.dart';
import 'studio_model_collection.dart';
import '../agent/model_selections.dart';
import '../services/composer_transfers.dart';
import 'studio_resources.dart';
import '../agent/studio_options.dart';
import '../agent/tavern_builtins.dart';
import '../agent/studio_composer_actions.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../agent/agent_controller.dart';
import '../agent/agent_models.dart';
import '../agent/agent_provider_catalog.dart';
import '../models/nai_models.dart';
import '../ui/studio_dropdown.dart';
import '../ui/zoomable_image.dart';
import '../i18n/studio_agent_text.dart';
import '../state/app_state.dart';
import 'studio_agent_components.dart';

Widget _providerMark(String id, BuildContext context) {
  if (id == 'custom') return const Icon(Icons.tune, size: 18);
  final theme =
      Theme.of(context).brightness == Brightness.dark ? 'dark' : 'light';
  return Image.asset('assets/provider-logos/$theme/$id.png',
      width: 18, height: 18, excludeFromSemantics: true);
}

Widget _agentBrandMenuLabel(String id, BuildContext context, String text) =>
    Row(children: [
      _providerMark(id, context),
      const SizedBox(width: 10),
      Expanded(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis))
    ]);

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
  final _composerRegion = GlobalKey();
  bool _attachmentBusy = false;
  final _focus = FocusNode();
  final _scroll = ScrollController();
  final _drafts = <String, String>{};
  final _draftActions = <String, List<AgentComposerAction>>{};
  List<AgentComposerAction> get _selectedActions =>
      _draftActions[_chatId] ?? const [];
  final _readingPositions = <String, double>{};
  final _readingAway = <String>{};
  bool _restoringScroll = false;
  String? _chatId, _loadError;
  bool _followLatest = true, _answering = false;
  ScrollDirection _userScrollDirection = ScrollDirection.idle;
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
    ComposerTransfers.listen(_importTransferredFiles);
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

  void _pinLatest() {
    if (!mounted || !_followLatest || !_scroll.hasClients) return;
    _restoringScroll = true;
    _scroll.jumpTo(_scroll.position.maxScrollExtent);
    _restoringScroll = false;
  }

  void _onScroll() {
    if (!_scroll.hasClients || _restoringScroll) return;
    if (_chatId != null) _readingPositions[_chatId!] = _scroll.offset;
  }

  bool _userScrolled(UserScrollNotification notification) {
    if (notification.depth != 0 || _restoringScroll) return false;
    if (notification.direction != ScrollDirection.idle) {
      _userScrollDirection = notification.direction;
    }
    // Idle near the bottom is not permission to undo an upward wheel/drag.
    final atBottom =
        notification.metrics.maxScrollExtent - notification.metrics.pixels <= 1;
    final following = notification.direction == ScrollDirection.idle &&
        atBottom &&
        (_followLatest ||
            _userScrollDirection == ScrollDirection.reverse ||
            notification.metrics.maxScrollExtent <= 0);
    if (_chatId != null) {
      if (following) {
        _readingAway.remove(_chatId);
      } else {
        _readingAway.add(_chatId!);
      }
    }
    if (following != _followLatest && mounted) {
      setState(() => _followLatest = following);
    }
    return false;
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
      _userScrollDirection = ScrollDirection.idle;
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
          // A lazy ListView can briefly underestimate extent during restoration.
          _scroll.jumpTo(target.clamp(
              0.0,
              _followLatest
                  ? _scroll.position.maxScrollExtent
                  : double.infinity));
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

  void _stageAction(AgentComposerAction action) {
    final chat = _agent?.selectedConversation;
    if (chat == null || chat.archivedAt != null || _agent!.sending) return;
    final actions =
        List<AgentComposerAction>.from(_draftActions[chat.id] ?? const []);
    if (actions.any(
        (a) => jsonEncode(a.toJson()) == jsonEncode(action.toJson()))) return;
    if (actions.length >= 4) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('最多选择四项操作，请先移除已有标签。')));
      return;
    }
    setState(() => _draftActions[chat.id] = [...actions, action]);
    _focus.requestFocus();
  }

  Future<void> _showActionPanel(String intent) async {
    var kind = 'convert', mode = 'mixed', version = 'v5', presetId = '';
    final app = _agent!.app;
    await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        builder: (sheetContext) =>
            StatefulBuilder(builder: (sheetContext, change) {
              final title = _t(intent == 'read'
                  ? 'menuReadTemplate'
                  : intent == 'save'
                      ? 'menuSaveTemplate'
                      : intent == 'preset'
                          ? 'presetTemplate'
                          : 'menuApplyTemplate');
              final body = ['convert', 'reverse'].contains(kind)
                  ? app.resolvedPromptTemplate(
                      kind, ReversePromptMode.values.byName(mode),
                      templateVersion: version)
                  : kind == 'optimize'
                      ? app.settings.promptOptimizeTemplate
                      : app.settings.promptAssistantTemplate;
              return Padding(
                  padding: EdgeInsets.only(
                      bottom: MediaQuery.viewInsetsOf(sheetContext).bottom),
                  child: ConstrainedBox(
                      constraints: BoxConstraints(
                          maxHeight:
                              MediaQuery.sizeOf(sheetContext).height * .82),
                      child: SingleChildScrollView(
                          child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                              child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(title,
                                        style: Theme.of(sheetContext)
                                            .textTheme
                                            .titleMedium),
                                    const SizedBox(height: 8),
                                    Text(_t('actionPanelHint')),
                                    const SizedBox(height: 16),
                                    if (intent == 'preset')
                                      StudioDropdownButtonFormField<String>(
                                          value: presetId,
                                          isExpanded: true,
                                          decoration: InputDecoration(
                                              labelText: _t('presetTemplate')),
                                          items: [
                                            DropdownMenuItem(
                                                value: '',
                                                child: _agentMenuLabel(
                                                    Icons.description_outlined,
                                                    _t('chooseTemplate'))),
                                            for (final p
                                                in app.settings.promptShortcuts)
                                              DropdownMenuItem(
                                                  value: p.id,
                                                  child: _agentMenuLabel(
                                                      Icons
                                                          .description_outlined,
                                                      p.name))
                                          ],
                                          onChanged: (value) => change(
                                              () => presetId = value ?? ''))
                                    else ...[
                                      StudioDropdownButtonFormField<String>(
                                          value: kind,
                                          isExpanded: true,
                                          decoration: InputDecoration(
                                              labelText: _t('templateKind')),
                                          items: [
                                            for (final k in [
                                              'convert',
                                              'reverse',
                                              'optimize',
                                              'assistant'
                                            ].where((k) =>
                                                intent != 'apply' ||
                                                k != 'reverse'))
                                              DropdownMenuItem(
                                                  value: k,
                                                  child: _agentMenuLabel(
                                                      Icons.tune,
                                                      _t('templateKind_$k')))
                                          ],
                                          onChanged: (value) => change(
                                              () => kind = value ?? 'convert')),
                                      if (['convert', 'reverse']
                                          .contains(kind)) ...[
                                        const SizedBox(height: 12),
                                        StudioDropdownButtonFormField<String>(
                                            value: mode,
                                            isExpanded: true,
                                            decoration: InputDecoration(
                                                labelText: _t('templateMode')),
                                            items: [
                                              for (final m in [
                                                'mixed',
                                                'tags',
                                                'natural'
                                              ])
                                                DropdownMenuItem(
                                                    value: m,
                                                    child: _agentMenuLabel(
                                                        Icons.text_fields,
                                                        _t('mode_$m')))
                                            ],
                                            onChanged: (value) => change(
                                                () => mode = value ?? 'mixed')),
                                        const SizedBox(height: 12),
                                        StudioDropdownButtonFormField<String>(
                                            value: version,
                                            isExpanded: true,
                                            decoration: InputDecoration(
                                                labelText:
                                                    _t('templateVersion')),
                                            items: [
                                              for (final v in ['v5', 'v4.5'])
                                                DropdownMenuItem(
                                                    value: v,
                                                    child: _agentMenuLabel(
                                                        Icons.layers_outlined,
                                                        v.toUpperCase()))
                                            ],
                                            onChanged: (value) => change(
                                                () => version = value ?? 'v5')),
                                      ],
                                      const SizedBox(height: 12),
                                      ExpansionTile(
                                          title: Text(_t('readTemplate')),
                                          children: [
                                            Padding(
                                                padding:
                                                    const EdgeInsets.all(12),
                                                child: SelectableText(
                                                    body.isEmpty
                                                        ? _t('builtinTemplate')
                                                        : body))
                                          ]),
                                    ],
                                    const SizedBox(height: 12),
                                    FilledButton.icon(
                                        onPressed: intent == 'preset' &&
                                                presetId.isEmpty
                                            ? null
                                            : () {
                                                Navigator.pop(sheetContext);
                                                _stageAction(intent == 'preset'
                                                    ? AgentComposerAction(
                                                        'prompt-preset',
                                                        templateId: presetId)
                                                    : AgentComposerAction(
                                                        intent == 'read'
                                                            ? 'template-read'
                                                            : intent == 'save'
                                                                ? 'template-save'
                                                                : 'template-apply',
                                                        templateKind: kind,
                                                        mode: mode,
                                                        templateVersion:
                                                            version));
                                              },
                                        icon: const Icon(Icons.add),
                                        label: Text(_t('stageAction'))),
                                  ])))));
            }));
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

  Future<void> _importTransferredFiles(List<String> paths) async {
    if (!mounted ||
        _attachmentBusy ||
        _agent?.selectedConversation?.archivedAt != null) return;
    final id = _agent?.selectedConversation?.id;
    if (id == null) return;
    setState(() => _attachmentBusy = true);
    try {
      final imported =
          await _agent!.importAttachmentPaths(paths, conversationId: id);
      if (imported.isEmpty && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(_t('attachmentLimit'))));
      }
    } catch (error) {
      if (mounted) setState(() => _agent!.error = '$error');
    } finally {
      if (mounted) setState(() => _attachmentBusy = false);
      for (final path in paths) {
        if (path
                .replaceAll('\\', '/')
                .split('/')
                .reversed
                .skip(1)
                .firstOrNull ==
            'composer-inputs') {
          try {
            await File(path).delete();
          } catch (_) {}
        }
      }
    }
  }

  Future<void> _pasteFiles() async {
    try {
      await _importTransferredFiles(await ComposerTransfers.paste());
    } catch (error) {
      if (mounted) setState(() => _agent!.error = '$error');
    }
  }

  Future<void> _pickFiles() async {
    if (_attachmentBusy) return;
    setState(() => _attachmentBusy = true);
    try {
      await _agent!.pickAttachments();
    } catch (error) {
      if (mounted) setState(() => _agent!.error = '$error');
    } finally {
      if (mounted) setState(() => _attachmentBusy = false);
    }
  }

  void _publishComposerRegion() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final box =
          _composerRegion.currentContext?.findRenderObject() as RenderBox?;
      final enabled = box != null &&
          box.hasSize &&
          _agent?.selectedConversation?.archivedAt == null &&
          ModalRoute.of(context)?.isCurrent == true;
      ComposerTransfers.region(
          enabled ? box.localToGlobal(Offset.zero) & box.size : null);
    });
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
                        _pickFiles();
                      }),
                  ListTile(
                      leading: const Icon(Icons.content_paste),
                      title: Text(_t('pasteFiles')),
                      onTap: () {
                        Navigator.pop(sheetContext);
                        _pasteFiles();
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
        _attachmentBusy ||
        agent.sending ||
        !agent.providerConfigured) return;
    final text = _input.text;
    if (text.trim().isEmpty &&
        _selectedActions.isEmpty &&
        chat.draftAttachments.isEmpty) return;
    final before = chat.messages.where((m) => m.role == 'user').length;
    final id = chat.id;
    final actions = List<AgentComposerAction>.from(_selectedActions);
    _draftActions[id] = [];
    _input.clear();
    _focus.unfocus();
    _followLatest = true;
    try {
      await agent.sendStudio(text, actions: actions);
    } catch (error) {
      if (mounted) setState(() => agent.error = '$error');
    }
    if (mounted &&
        agent.error != null &&
        chat.messages.where((m) => m.role == 'user').length == before) {
      _drafts[id] = text;
      _draftActions[id] = actions;
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
    var effort = settings.agentReasoningEffort;
    var profiles = [
      ...normalizeSavedAgentModels(settings.savedAgentModels)
          .where((p) => p['providerKey'] != agentProviderKey(settings)),
      ...selectedAgentModels(settings)
    ];
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
                                            child: _agentBrandMenuLabel(
                                                preset.id,
                                                context,
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
                                    onChanged: (_) => change(() {}),
                                    keyboardType: TextInputType.url,
                                    autocorrect: false,
                                    decoration: InputDecoration(
                                        labelText: _t('apiAddress'),
                                        hintText:
                                            'https://your-provider.example/v1')),
                                const SizedBox(height: 12),
                                TextField(
                                    controller: model,
                                    onChanged: (_) => change(() {}),
                                    autocorrect: false,
                                    decoration: InputDecoration(
                                        labelText: _t('modelId'))),
                                const SizedBox(height: 12),
                                TextField(
                                    controller: key,
                                    onChanged: (_) => change(() {}),
                                    obscureText: true,
                                    autocorrect: false,
                                    enableSuggestions: false,
                                    decoration: InputDecoration(
                                        labelText: _t('apiKey'))),
                                StudioModelCollection(
                                    draft: AppSettings.fromJson({
                                      ...settings.toJson(),
                                      'agentApiProtocol': protocol,
                                      'agentApiBaseUrl': base.text,
                                      'agentApiModel': model.text,
                                      'savedAgentModels': profiles,
                                      'agentContextWindow': contextWindow,
                                      'agentMaxOutputTokens': maxOutputTokens,
                                      'agentReasoningEffort': effort
                                    }),
                                    apiKey: key.text,
                                    disabled: saving,
                                    onChanged: (draft) => change(() {
                                          profiles = draft.savedAgentModels;
                                          model.text = draft.agentApiModel;
                                          contextWindow =
                                              draft.agentContextWindow;
                                          maxOutputTokens =
                                              draft.agentMaxOutputTokens;
                                          effort = draft.agentReasoningEffort;
                                          vision = draft.agentVisionEnabled;
                                        })),
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
                                      visionEnabled: vision,
                                      savedModels: profiles,
                                      reasoningEffort: effort);
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
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('$reason')));
        }
      }
      return;
    }
    if (action == 'delete') {
      final accepted = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
                  title: Text(_t('deleteChat')),
                  content: Text(chat.title),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: Text(_t('cancel'))),
                    FilledButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: Text(_t('deleteChat')))
                  ]));
      if (accepted == true && mounted) {
        try {
          await _agent!.deleteConversation(chat.id);
        } catch (_) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('${_t('deleteChat')}：未完成，请重试。')));
          }
        }
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
    await showGalleryImagePreview(context, images: [
      Image.file(File(image.filePath),
          errorBuilder: (_, __, ___) => Text(_t('missingImage')))
    ], captions: [
      image.name
    ]);
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
                      if (message.actions.isNotEmpty)
                        Wrap(spacing: 6, runSpacing: 4, children: [
                          for (final action in message.actions)
                            Chip(
                                avatar:
                                    const Icon(Icons.build_outlined, size: 14),
                                label: Text(studioComposerActionLabel(
                                    action, _agent!.app)))
                        ]),
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
                                onPressed: () {
                                  _prefill(message.content);
                                  setState(() => _draftActions[_chatId!] =
                                      List.from(message.actions));
                                },
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
    _publishComposerRegion();
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
        if (wide)
          Align(
              alignment: Alignment.centerRight,
              child: Builder(
                  builder: (ctx) => IconButton(
                      tooltip: _t('expandResources'),
                      icon: const Icon(Icons.menu_book_outlined),
                      onPressed: () => Scaffold.of(ctx).openEndDrawer()))),
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
          NotificationListener<UserScrollNotification>(
              onNotification: _userScrolled,
              child: NotificationListener<ScrollMetricsNotification>(
                  onNotification: (n) {
                    if (_followLatest) {
                      WidgetsBinding.instance
                          .addPostFrameCallback((_) => _pinLatest());
                    }
                    return false;
                  },
                  child: ListView(
                      controller: _scroll,
                      padding: const EdgeInsets.all(16),
                      children: [
                        if (chat.messages.isEmpty) _empty(),
                        for (final message
                            in chat.messages.where((m) => m.role != 'system'))
                          _message(message),
                        if (agent.pendingQuestion case final request?)
                          StudioQuestionCards(
                              key: ValueKey(request.id),
                              request: request,
                              language: _language,
                              onRespond: agent.respondQuestion),
                        if (agent.sending &&
                            agent.pendingPermission == null &&
                            agent.pendingQuestion == null)
                          Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Row(children: [
                                const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2)),
                                const SizedBox(width: 12),
                                Expanded(child: Text(_t('workingBody')))
                              ]))
                      ]))),
          if (!_followLatest)
            Positioned(
                right: 12,
                bottom: 8,
                child: FilledButton.tonalIcon(
                    onPressed: () {
                      setState(() {
                        _followLatest = true;
                        _userScrollDirection = ScrollDirection.idle;
                        _readingAway.remove(_chatId);
                      });
                      WidgetsBinding.instance
                          .addPostFrameCallback((_) => _pinLatest());
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
        if (_attachmentBusy) Text(_t('uploadingAttachments')),
        if (agent.sending && chat.draftAttachments.isNotEmpty)
          Text(_t('nextMessageAttachments')),
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
                                  ? Image.file(File(file.filePath),
                                      errorBuilder: (_, __, ___) =>
                                          const Icon(Icons.image_outlined))
                                  : const Icon(Icons.attachment),
                              onPressed: file.kind == 'image'
                                  ? () => _preview(file)
                                  : null,
                              label: ConstrainedBox(
                                  constraints:
                                      const BoxConstraints(maxWidth: 160),
                                  child: Text(file.name,
                                      overflow: TextOverflow.ellipsis)),
                              onDeleted: archived || _attachmentBusy
                                  ? null
                                  : () => agent.removeDraftAttachment(file.id)))
                  ])),
        SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final mode in ['confirm', 'auto'])
                MergeSemantics(
                    child: Semantics(
                        label: _t(mode == 'auto' ? 'autoMode' : 'confirmMode'),
                        selected: chat.studioApprovalMode == mode,
                        child: TextButton.icon(
                            onPressed: agent.sending || archived || agent.studioOptionsSaving
                                ? null
                                : () =>
                                    agent.setStudioOptions(approvalMode: mode),
                            icon: Icon(mode == 'auto' ? Icons.bolt : Icons.verified_user_outlined,
                                size: 16),
                            label: ExcludeSemantics(
                                child: Text(_t(mode == 'auto'
                                    ? 'autoMode'
                                    : 'confirmMode'))),
                            style: TextButton.styleFrom(
                                backgroundColor: chat.studioApprovalMode == mode
                                    ? color.primaryContainer
                                    : null)))),
              MergeSemantics(
                  child: Semantics(
                      label: _t('webQuery'),
                      toggled: chat.studioWebSearchEnabled,
                      child: TextButton.icon(
                          onPressed: agent.sending ||
                                  archived ||
                                  agent.studioOptionsSaving
                              ? null
                              : () => agent.setStudioOptions(
                                  webSearchEnabled:
                                      !chat.studioWebSearchEnabled),
                          icon: const Icon(Icons.search, size: 16),
                          label: ExcludeSemantics(child: Text(_t('webQuery'))),
                          style: TextButton.styleFrom(
                              backgroundColor: chat.studioWebSearchEnabled
                                  ? color.primaryContainer
                                  : null)))),
              MergeSemantics(
                  child: Semantics(
                      label: _t('presetToggle'),
                      toggled: chat.studioTemplateEnabled,
                      child: TextButton.icon(
                          onPressed: agent.sending ||
                                  archived ||
                                  agent.studioOptionsSaving
                              ? null
                              : () => agent.setStudioOptions(
                                  templateEnabled: !chat.studioTemplateEnabled),
                          icon:
                              const Icon(Icons.description_outlined, size: 16),
                          label:
                              ExcludeSemantics(child: Text(_t('presetToggle'))),
                          style: TextButton.styleFrom(
                              backgroundColor: chat.studioTemplateEnabled
                                  ? color.primaryContainer
                                  : null)))),
              PopupMenuButton<String>(
                  key: const ValueKey('agent-preset-selector'),
                  tooltip: _t('presetToggle'),
                  enabled:
                      !agent.sending && !archived && !agent.studioOptionsSaving,
                  onSelected: (id) => agent.setStudioOptions(presetId: id),
                  itemBuilder: (_) => [
                        for (final id in [
                          studioDefaultPresetId,
                          studioCompletePresetId
                        ])
                          CheckedPopupMenuItem(
                              value: id,
                              checked: chat.studioPresetId == id,
                              child: Text(_t(id == studioDefaultPresetId
                                  ? 'presetInfinite'
                                  : 'presetComplete'))),
                        for (final preset in agent.workspace.samplerPresets
                            .where((p) => p.id != lyraImageSamplerId))
                          CheckedPopupMenuItem(
                              value: 'tavern:${preset.id}',
                              checked:
                                  chat.studioPresetId == 'tavern:${preset.id}',
                              child: Text(preset.name))
                      ])
            ])),
        SafeArea(
            key: _composerRegion,
            top: false,
            child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
                child: Column(children: [
                  if (_selectedActions.isNotEmpty)
                    Align(
                        alignment: Alignment.centerLeft,
                        child: Wrap(spacing: 6, runSpacing: 4, children: [
                          for (final action in _selectedActions)
                            InputChip(
                                avatar:
                                    const Icon(Icons.build_outlined, size: 16),
                                label: Text(studioComposerActionLabel(
                                    action, agent.app)),
                                onDeleted: agent.sending || archived
                                    ? null
                                    : () => setState(() => _draftActions[
                                            chat.id] =
                                        _selectedActions
                                            .where((a) => !identical(a, action))
                                            .toList()))
                        ])),
                  Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    IconButton(
                        tooltip: _t('addAttachment'),
                        onPressed: archived || _attachmentBusy
                            ? null
                            : _showAttachmentSources,
                        icon: const Icon(Icons.add)),
                    Expanded(
                        child: TextField(
                            controller: _input,
                            contextMenuBuilder: (context, state) =>
                                AdaptiveTextSelectionToolbar.buttonItems(
                                    anchors: state.contextMenuAnchors,
                                    buttonItems: [
                                      ...state.contextMenuButtonItems,
                                      ContextMenuButtonItem(
                                          label: _t('pasteFiles'),
                                          onPressed: () {
                                            state.hideToolbar();
                                            _pasteFiles();
                                          })
                                    ]),
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
                                    _attachmentBusy ||
                                    !agent.providerConfigured ||
                                    (_input.text.trim().isEmpty &&
                                        _selectedActions.isEmpty &&
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
                            onSelected: (id) => id == 'configure'
                                ? _configure()
                                : agent.selectSavedModel(id),
                            itemBuilder: (_) => [
                                  for (final m in selectedAgentModels(
                                      agent.app.settings))
                                    CheckedPopupMenuItem(
                                        value: m['id'] as String,
                                        checked: m['id'] ==
                                            agent.app.settings.agentApiModel,
                                        child: Text(m['displayName'] as String,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis)),
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
                        PopupMenuButton<String>(
                            key: const ValueKey('agent-template-selector'),
                            tooltip: _t('actions'),
                            enabled: !agent.sending && !archived,
                            icon: const Icon(Icons.auto_awesome_outlined,
                                size: 18),
                            onSelected: (value) {
                              if (value == 'web') {
                                _stageAction(
                                    const AgentComposerAction('web-search'));
                              } else {
                                _showActionPanel(value);
                              }
                            },
                            itemBuilder: (_) => [
                                  PopupMenuItem(
                                      value: 'web',
                                      child: _agentMenuLabel(
                                          Icons.search, _t('webQuery'))),
                                  PopupMenuItem(
                                      value: 'read',
                                      child: _agentMenuLabel(
                                          Icons.description_outlined,
                                          _t('menuReadTemplate'))),
                                  PopupMenuItem(
                                      value: 'apply',
                                      child: _agentMenuLabel(
                                          Icons.auto_fix_high,
                                          _t('menuApplyTemplate'))),
                                  PopupMenuItem(
                                      value: 'save',
                                      child: _agentMenuLabel(
                                          Icons.save_outlined,
                                          _t('menuSaveTemplate'))),
                                  PopupMenuItem(
                                      value: 'preset',
                                      child: _agentMenuLabel(
                                          Icons.description_outlined,
                                          _t('presetTemplate'))),
                                ]),
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
        endDrawer:
            Drawer(child: StudioResources(agent: agent, language: _language)),
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
                        fontSize: 14, fontWeight: FontWeight.w500)),
                actions: [
                    Builder(
                        builder: (ctx) => IconButton(
                            tooltip: _t('expandResources'),
                            icon:
                                const Icon(Icons.menu_book_outlined, size: 20),
                            onPressed: () => Scaffold.of(ctx).openEndDrawer()))
                  ]),
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
    ComposerTransfers.listen(null);
    ComposerTransfers.region(null);
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
                          if (mounted && action == 'restore') {
                            setState(() => archivedView = false);
                          }
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
                                          : 'restoreChat'))),
                              PopupMenuItem(
                                  value: 'delete',
                                  child: _agentMenuLabel(
                                      Icons.delete_outline, t('deleteChat')))
                            ]))
            ]))
          ])));
}
