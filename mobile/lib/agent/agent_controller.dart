import 'studio_composer_actions.dart';
import 'compatible_proposal.dart';
import 'image_provider.dart';
import 'provider_outcome.dart';
import 'image_repair.dart';
import '../models/nai_models.dart';
import 'image_continuity.dart';
import 'scene_bindings.dart';
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;

import '../state/app_state.dart';
import '../prompts/dsh_image_ai.dart';
import 'agent_context.dart';
import 'agent_models.dart';
import 'agent_provider.dart';
import 'agent_provider_catalog.dart';
import 'agent_tools.dart';
import 'studio_generation_preparations.dart';
import 'tavern_builtins.dart';
import 'tavern_card_service.dart';
import 'tavern_prompt.dart';
import 'tavern_preset_import.dart';

class AgentController extends ChangeNotifier {
  final AppState app;
  final AgentProviderClient provider;
  final TavernCardService cardService = const TavernCardService();
  late final AgentToolExecutor tools;
  final StudioGenerationPreparations _generationPreparations =
      StudioGenerationPreparations();

  AgentWorkspace workspace = AgentWorkspace();
  AgentPermissionRequest? pendingPermission;
  bool loaded = false;
  bool sending = false;
  bool compacting = false;
  final Set<String> _savingSceneMessages = {};
  String? error;

  Set<String> _alwaysAllowed = <String>{};
  Completer<String>? _permissionCompleter;
  Timer? _persistTimer;
  Timer? _streamNotifyTimer;
  bool _disposed = false;
  bool _abortRequested = false;

  AgentController({required this.app, AgentProviderClient? provider})
      : provider = provider ?? AgentProviderClient() {
    tools = AgentToolExecutor(
      app: app,
      listMemories: _memoryJson,
      upsertMemory: _upsertMemoryFromTool,
      deleteMemory: deleteMemory,
      readAgentTemplate: (kind) => workspace.agentTemplates[kind] ?? '',
      writeAgentTemplate: (kind, body) async {
        if (body.isEmpty) {
          workspace.agentTemplates.remove(kind);
        } else {
          workspace.agentTemplates[kind] = body;
        }
        await _persist();
        _notify();
      },
    );
  }

  AgentConversation? get selectedConversation {
    final selected = workspace.selectedConversationId;
    for (final conversation in workspace.conversations) {
      if (conversation.id == selected) return conversation;
    }
    return workspace.conversations
        .where((c) => c.archivedAt == null)
        .firstOrNull;
  }

  TavernCharacter? get activeCharacter {
    final conversation = selectedConversation;
    final id = conversation?.activeCharacterId ?? workspace.selectedCharacterId;
    return workspace.characters.where((item) => item.id == id).firstOrNull ??
        workspace.characters.firstOrNull;
  }

  TavernPersona? get activePersona {
    final id = selectedConversation?.personaId ?? workspace.selectedPersonaId;
    return workspace.personas.where((item) => item.id == id).firstOrNull ??
        workspace.personas.firstOrNull;
  }

  TavernSamplerPreset? get activeSamplerPreset {
    final id = selectedConversation?.samplerPresetId;
    return workspace.samplerPresets
            .where((item) => item.id == id)
            .firstOrNull ??
        workspace.samplerPresets.firstOrNull;
  }

  List<TavernCharacter> get activeCharacters {
    final ids = selectedConversation?.characterIds.toSet() ?? const <String>{};
    final selected = workspace.characters
        .where((character) => ids.contains(character.id))
        .toList();
    return selected.isNotEmpty
        ? selected
        : [if (activeCharacter != null) activeCharacter!];
  }

  List<TavernLorebook> get activeLorebooks {
    final ids = selectedConversation?.lorebookIds.toSet() ?? const <String>{};
    return workspace.lorebooks
        .where((lorebook) => ids.contains(lorebook.id))
        .toList();
  }

  bool get providerConfigured =>
      app.settings.agentApiBaseUrl.trim().isNotEmpty &&
      app.settings.agentApiModel.trim().isNotEmpty;

  Future<void> load() async {
    workspace = await app.storage.getAgentWorkspace();
    _alwaysAllowed = await app.storage.getAgentAlwaysAllowedTools();
    for (final conversation in workspace.conversations) {
      if (conversation.status == 'running' ||
          conversation.status == 'waiting-permission') {
        conversation.status = 'idle';
      }
      for (final message in conversation.messages) {
        if (message.status == 'streaming') message.status = 'aborted';
        for (final tool in message.tools) {
          if (const {'pending', 'running'}.contains(tool.status)) {
            tool.status = 'error';
            tool.error = '上次运行已中断；结果未确认，请检查状态后重试。';
            tool.completedAt = agentNow();
          }
        }
      }
    }
    if (!workspace.conversations.any((c) => c.archivedAt == null)) {
      createConversation(activeCharacter?.name ?? '新对话');
    }
    loaded = true;
    await _persist();
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _notifyStreaming() {
    if (_disposed || _streamNotifyTimer?.isActive == true) return;
    _streamNotifyTimer = Timer(const Duration(milliseconds: 40), () {
      _streamNotifyTimer = null;
      _notify();
    });
  }

  void _throwIfAborted() {
    if (_abortRequested) {
      throw const AgentProviderException('Agent 请求已停止。');
    }
  }

  Future<void> _persist() async {
    workspace.updatedAt = agentNow();
    await app.storage.setAgentWorkspace(workspace);
  }

  Future<void> saveWorkspace() async {
    await _persist();
    _notify();
  }

  /// Save the editor against the exact scene it opened, never a newer proposal.
  Future<void> saveTavernScene(String conversationId, String messageId,
      Map<String, dynamic> expected, Map<String, dynamic> updated) async {
    final conversation = workspace.conversations
        .where((c) => c.id == conversationId)
        .firstOrNull;
    final message =
        conversation?.messages.where((m) => m.id == messageId).firstOrNull;
    final proposal = message?.imageProposal;
    if (proposal == null ||
        _savingSceneMessages.contains(messageId) ||
        proposal.status == 'generating' ||
        proposal.status == 'complete' ||
        canonicalSceneValue(proposal.scene) != canonicalSceneValue(expected)) {
      throw StateError('SCENE_STALE');
    }
    final checked = readSceneBindings(updated);
    if (checked == null) throw StateError('SCENE_INVALID');
    final prompt = compileSceneBindings(checked)['positivePrompt'] as String;
    final oldScene = proposal.scene, oldPrompt = proposal.positivePrompt;
    _savingSceneMessages.add(messageId);
    proposal
      ..scene = checked
      ..positivePrompt = prompt;
    try {
      await _persist();
    } catch (_) {
      if (identical(message!.imageProposal, proposal) &&
          identical(proposal.scene, checked)) {
        proposal
          ..scene = oldScene
          ..positivePrompt = oldPrompt;
      }
      rethrow;
    } finally {
      _savingSceneMessages.remove(messageId);
      _notify();
    }
  }

  void _schedulePersist() {
    _persistTimer?.cancel();
    _persistTimer = Timer(const Duration(milliseconds: 180), () {
      if (!_disposed) {
        unawaited(_persist().catchError((Object caught) {
          error = caught.toString().replaceFirst('Exception: ', '');
          _notify();
        }));
      }
    });
  }

  void updateDraft(String conversationId, String text) {
    final matches =
        workspace.conversations.where((c) => c.id == conversationId);
    if (matches.isEmpty) return;
    final conversation = matches.first;
    if (conversation.draftText == text) return;
    conversation.draftText =
        text.length > 30000 ? text.substring(0, 30000) : text;
    _schedulePersist();
  }

  Future<void> selectPromptTemplate(String kind,
      {String? mode, String? version}) async {
    final conversation = selectedConversation;
    if (conversation == null) return;
    if (!const {'convert', 'reverse', 'optimize', 'assistant'}.contains(kind)) {
      throw ArgumentError.value(kind, 'kind');
    }
    if (kind == 'optimize' || kind == 'assistant') {
      if ((workspace.agentTemplates[kind] ?? '').trim().isEmpty) {
        throw StateError('所选模板未保存。');
      }
    } else {
      if (!const {'mixed', 'tags', 'natural'}.contains(mode) ||
          !const {'v5', 'v4.5'}.contains(version) ||
          (app.promptOverrides(kind, templateVersion: version)[mode] ?? '')
              .trim()
              .isEmpty) {
        throw StateError('所选模板未保存。');
      }
    }
    conversation
      ..selectedTemplateKind = kind
      ..selectedTemplateMode = mode
      ..selectedTemplateVersion = version;
    await _persist();
    _notify();
  }

  String? _selectedPromptTemplate(AgentConversation conversation) {
    final kind = conversation.selectedTemplateKind;
    if (kind == null) return null;
    if (kind == 'optimize' || kind == 'assistant') {
      return workspace.agentTemplates[kind]?.trim();
    }
    if (kind == 'convert' || kind == 'reverse') {
      final mode = conversation.selectedTemplateMode;
      final version = conversation.selectedTemplateVersion;
      if (mode == null || version == null) return null;
      return app.promptOverrides(kind, templateVersion: version)[mode]?.trim();
    }
    return null;
  }

  String _uniqueConversationTitle(String requested) {
    final base = requested.trim().isEmpty ? '新对话' : requested.trim();
    final occupied =
        workspace.conversations.map((item) => item.title.toLowerCase()).toSet();
    if (!occupied.contains(base.toLowerCase())) return base;
    var index = 1;
    while (occupied.contains('$base ($index)'.toLowerCase())) {
      index++;
    }
    return '$base ($index)';
  }

  AgentConversation createConversation([String title = '新对话']) {
    final character = workspace.characters
            .where((item) => item.id == workspace.selectedCharacterId)
            .firstOrNull ??
        workspace.characters.firstOrNull;
    final persona = workspace.personas
            .where((item) => item.id == workspace.selectedPersonaId)
            .firstOrNull ??
        workspace.personas.firstOrNull;
    final preset = workspace.samplerPresets.firstOrNull;
    final linkedLorebookIds = <String>{
      if (character?.lorebookId != null &&
          workspace.lorebooks.any((item) => item.id == character!.lorebookId))
        character!.lorebookId!,
      if (persona?.lorebookId != null &&
          workspace.lorebooks.any((item) => item.id == persona!.lorebookId))
        persona!.lorebookId!,
    }.toList();
    final conversation = AgentConversation(
      id: agentId('conversation'),
      title: _uniqueConversationTitle(title),
      // Keep the opening greeting on the stable character intro surface, as
      // the desktop Tavern does. It remains part of the Character Card and is
      // not duplicated into the transcript before the user sends anything.
      messages: [],
      characterIds: [if (character != null) character.id],
      activeCharacterId: character?.id,
      personaId: persona?.id,
      lorebookIds: linkedLorebookIds,
      samplerPresetId: preset?.id,
      generationMode: workspace.defaultGenerationMode,
      reasoningEffort: 'auto',
      context: createAgentContextSnapshot(
        const [],
        app.settings.agentContextWindow,
        app.settings.agentAutoCompactThreshold,
      ),
    );
    workspace.conversations.insert(0, conversation);
    workspace.selectedConversationId = conversation.id;
    _schedulePersist();
    _notify();
    return conversation;
  }

  void selectConversation(String id) {
    if (!workspace.conversations.any((item) => item.id == id)) return;
    workspace.selectedConversationId = id;
    _schedulePersist();
    _notify();
  }

  void renameConversation(String id, String title) {
    final clean = title.trim();
    if (clean.isEmpty) return;
    final conversation =
        workspace.conversations.where((item) => item.id == id).firstOrNull;
    if (conversation == null) return;
    conversation
      ..title = clean.length > 100 ? clean.substring(0, 100) : clean
      ..updatedAt = agentNow();
    _schedulePersist();
    _notify();
  }

  Future<void> setConversationArchived(String id, bool archived) async {
    if (sending || compacting) return;
    final conversation =
        workspace.conversations.where((c) => c.id == id).firstOrNull;
    if (conversation == null ||
        ['running', 'waiting-permission'].contains(conversation.status)) return;
    conversation.archivedAt =
        archived ? (conversation.archivedAt ?? agentNow()) : null;
    conversation.updatedAt = agentNow();
    if (!archived) {
      workspace.selectedConversationId = conversation.id;
    } else if (workspace.selectedConversationId == id) {
      workspace.selectedConversationId = workspace.conversations
          .where((c) => c.archivedAt == null)
          .firstOrNull
          ?.id;
    }
    if (!workspace.conversations.any((c) => c.archivedAt == null))
      createConversation('新对话');
    await _persist();
    _notify();
  }

  Future<void> deleteConversation(String id) async {
    workspace.conversations.removeWhere((item) => item.id == id);
    workspace.memories.removeWhere(
      (item) => item.scope == 'conversation' && item.conversationId == id,
    );
    try {
      final root = await app.storage.agentAttachmentsDirectory();
      final directory = Directory('${root.path}${Platform.pathSeparator}$id');
      if (directory.existsSync()) await directory.delete(recursive: true);
    } catch (_) {}
    if (workspace.conversations.isEmpty) {
      createConversation(activeCharacter?.name ?? '新对话');
    } else if (workspace.selectedConversationId == id) {
      workspace.selectedConversationId = workspace.conversations.first.id;
    }
    await _persist();
    _notify();
  }

  String _safeName(String raw) {
    var name = p
        .basename(raw)
        .replaceAll(RegExp(r'[\x00-\x1f<>:"/\\|?*]+'), '_')
        .trim();
    if (name.length > 160) name = name.substring(name.length - 160);
    return name.isEmpty ? 'attachment' : name;
  }

  String _mime(String extension) => switch (extension.toLowerCase()) {
        '.png' => 'image/png',
        '.jpg' || '.jpeg' => 'image/jpeg',
        '.webp' => 'image/webp',
        '.gif' => 'image/gif',
        '.bmp' => 'image/bmp',
        '.avif' => 'image/avif',
        '.pdf' => 'application/pdf',
        '.txt' => 'text/plain',
        '.md' => 'text/markdown',
        '.json' => 'application/json',
        '.jsonl' => 'application/x-ndjson',
        '.csv' => 'text/csv',
        '.tsv' => 'text/tab-separated-values',
        '.yaml' || '.yml' => 'application/yaml',
        _ => 'application/octet-stream',
      };

  String _kind(String extension) {
    final value = extension.toLowerCase();
    if (const {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'}
        .contains(value)) return 'image';
    if (const {
      '.txt',
      '.md',
      '.json',
      '.jsonl',
      '.csv',
      '.tsv',
      '.yaml',
      '.yml'
    }.contains(value)) return 'text';
    if (value == '.pdf') return 'document';
    return 'other';
  }

  Future<List<AgentAttachment>> pickAttachments() async {
    final conversation = selectedConversation;
    if (conversation == null) return const [];
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: const [
        'png',
        'jpg',
        'jpeg',
        'webp',
        'gif',
        'bmp',
        'avif',
        'pdf',
        'txt',
        'md',
        'json',
        'jsonl',
        'csv',
        'tsv',
        'yaml',
        'yml',
      ],
      withData: false,
    );
    if (result == null) return const [];
    final imported = <AgentAttachment>[];
    var total = 0;
    final directory =
        await app.storage.agentAttachmentsDirectory(conversation.id);
    for (final selected in result.files) {
      try {
        final sourcePath = selected.path;
        if (sourcePath == null || sourcePath.isEmpty) continue;
        final source = File(sourcePath);
        final length = await source.length();
        if (length <= 0 || length > 48 * 1024 * 1024) continue;
        total += length;
        if (total > 192 * 1024 * 1024) break;
        final extension = p.extension(selected.name).toLowerCase();
        var target = File(
            '${directory.path}${Platform.pathSeparator}${_safeName(selected.name)}');
        var index = 1;
        while (target.existsSync()) {
          target = File(
            '${directory.path}${Platform.pathSeparator}${p.basenameWithoutExtension(selected.name)} (${index++})$extension',
          );
        }
        await source.copy(target.path);
        int? width;
        int? height;
        if (_kind(extension) == 'image') {
          try {
            final dims =
                AppState.readImageDimensions(await target.readAsBytes());
            width = dims.$1;
            height = dims.$2;
          } catch (_) {}
        }
        imported.add(AgentAttachment(
          id: agentId('attachment'),
          name: p.basename(target.path),
          mime: _mime(extension),
          size: length,
          kind: _kind(extension),
          filePath: target.path,
          width: width,
          height: height,
        ));
      } catch (_) {}
    }
    conversation.draftAttachments.addAll(imported);
    conversation.updatedAt = agentNow();
    await _persist();
    _notify();
    return imported;
  }

  /// Copies an image already registered in this app into the conversation.
  /// IDs resolve only against the current canvas, reference library or history.
  Future<AgentAttachment> attachAppImage(String source, String id) async {
    final conversation = selectedConversation;
    if (conversation == null || sending) throw StateError('当前无法添加附件。');
    String? path;
    int? width, height;
    if (source == 'canvas' && id == 'current') {
      final image = app.workbenchImage;
      path = image?.filePath;
      width = image?.width;
      height = image?.height;
    } else if (source == 'reference') {
      final matches = app.referencePresets.where((item) => item.id == id);
      if (matches.isNotEmpty) {
        path = matches.first.filePath;
        width = matches.first.width;
        height = matches.first.height;
      }
    } else if (source == 'gallery') {
      final matches = app.history.where((item) => item.id == id);
      if (matches.isNotEmpty) {
        path = matches.first.filePath;
        width = matches.first.width;
        height = matches.first.height;
      }
    }
    if (path == null) throw StateError('所选图片已不可用。');
    final file = File(path);
    final size = await file.length();
    if (size <= 0 || size > 48 * 1024 * 1024) {
      throw StateError('图片大小超出附件限制。');
    }
    final directory =
        await app.storage.agentAttachmentsDirectory(conversation.id);
    final extension = p.extension(path).toLowerCase();
    final safeExtension = const {
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
      '.gif',
      '.bmp',
      '.avif'
    }.contains(extension)
        ? extension
        : '.png';
    final target =
        File(p.join(directory.path, '${agentId('attachment')}$safeExtension'));
    await file.copy(target.path);
    final attachment = AgentAttachment(
        id: agentId('attachment'),
        name: p.basename(target.path),
        mime: _mime(safeExtension),
        size: size,
        kind: 'image',
        filePath: target.path,
        width: width,
        height: height);
    conversation.draftAttachments.add(attachment);
    conversation.updatedAt = agentNow();
    await _persist();
    _notify();
    return attachment;
  }

  Future<void> removeDraftAttachment(String id) async {
    final conversation = selectedConversation;
    if (conversation == null) return;
    final attachment = conversation.draftAttachments
        .where((item) => item.id == id)
        .firstOrNull;
    conversation.draftAttachments.removeWhere((item) => item.id == id);
    if (attachment != null) {
      try {
        final root =
            (await app.storage.agentWorkspaceDirectory()).absolute.path;
        final file = File(attachment.filePath).absolute;
        if (file.path.startsWith('$root${Platform.pathSeparator}') &&
            file.existsSync()) {
          await file.delete();
        }
      } catch (_) {}
    }
    await _persist();
    _notify();
  }

  List<AgentAttachment> _availableAttachments(AgentConversation conversation) {
    final output = <AgentAttachment>[];
    final ids = <String>{};
    void add(AgentAttachment item) {
      if (ids.add(item.id)) output.add(item);
    }

    for (final message in conversation.messages) {
      for (final item in message.attachments) {
        add(item);
      }
      for (final tool in message.tools) {
        for (final item in tool.generatedImages) {
          add(item);
        }
      }
    }
    for (final item in conversation.draftAttachments) {
      add(item);
    }
    for (final item in app.history.take(50)) {
      var size = 0;
      try {
        size = File(item.filePath).lengthSync();
      } catch (_) {}
      add(AgentAttachment(
        id: item.id,
        name: p.basename(item.filePath),
        mime: 'image/png',
        size: size,
        kind: 'image',
        filePath: item.filePath,
        width: item.width,
        height: item.height,
        createdAt: item.createdAt,
      ));
    }
    return output;
  }

  Future<dynamic> _attachmentContent(AgentAttachment attachment) async {
    final metadata =
        '[attachmentId=${attachment.id}; name=${attachment.name}; type=${attachment.mime}; bytes=${attachment.size}]';
    final file = File(attachment.filePath);
    if (!file.existsSync()) {
      return {'type': 'text', 'text': '$metadata (file missing)'};
    }
    if (attachment.kind == 'image' && app.settings.agentVisionEnabled) {
      if (attachment.size > 20 * 1024 * 1024) {
        return {
          'type': 'text',
          'text': '$metadata (image exceeds 20 MB vision limit)'
        };
      }
      final encoded = base64Encode(await file.readAsBytes());
      return {
        'type': 'image_url',
        'image_url': {'url': 'data:${attachment.mime};base64,$encoded'},
      };
    }
    if (attachment.kind == 'text' && attachment.size <= 512 * 1024) {
      try {
        var text = await file.readAsString();
        if (text.length > 200000) text = text.substring(0, 200000);
        return {'type': 'text', 'text': '$metadata\n$text'};
      } catch (_) {}
    }
    return {'type': 'text', 'text': metadata};
  }

  Future<Map<String, dynamic>> _messageForProvider(AgentMessage message,
      {String? contentOverride}) async {
    var text = contentOverride ?? visibleTavernMessageContent(message);
    if (message.role == 'assistant' && message.tools.isNotEmpty) {
      final summaries = message.tools.map((tool) =>
          '[${tool.title}: ${tool.status}] ${tool.output ?? tool.error ?? ''}');
      text = [text, ...summaries]
          .where((item) => item.trim().isNotEmpty)
          .join('\n');
    }
    final proposal = message.imageProposal;
    if (proposal != null) {
      final imageContext = jsonEncode({
        'positivePrompt': proposal.positivePrompt,
        if (proposal.model?.trim().isNotEmpty == true) 'model': proposal.model,
        if (proposal.width != null) 'width': proposal.width,
        if (proposal.height != null) 'height': proposal.height,
        if (proposal.steps != null) 'steps': proposal.steps,
        if (proposal.scale != null) 'scale': proposal.scale,
        if (proposal.sampler?.trim().isNotEmpty == true)
          'sampler': proposal.sampler,
        'count': proposal.count,
      });
      text = '${text.trim().isEmpty ? 'Image proposal prepared.' : text}\n\n'
          '<langbai-current-image>$imageContext</langbai-current-image>';
    }
    if (message.role != 'user' || message.attachments.isEmpty) {
      return {'role': message.role, 'content': text};
    }
    final content = <dynamic>[
      {'type': 'text', 'text': text.isEmpty ? '请分析附件并继续任务。' : text},
    ];
    for (final attachment in message.attachments) {
      content.add(await _attachmentContent(attachment));
    }
    return {'role': 'user', 'content': content};
  }

  List<AgentMessage> _messagesForContext(AgentConversation conversation) {
    final boundary = conversation.lastCompactedAt?.trim();
    final summary = conversation.lastSummary?.trim();
    if (boundary == null ||
        boundary.isEmpty ||
        summary == null ||
        summary.isEmpty) {
      return conversation.messages;
    }
    return [
      AgentMessage(
        id: 'context-summary-$boundary',
        role: 'system',
        content: summary,
        createdAt: boundary,
        completedAt: boundary,
      ),
      ...conversation.messages
          .where((message) => message.createdAt.compareTo(boundary) > 0),
    ];
  }

  TavernImageParameterDefaults _tavernImageDefaults(TavernCharacter character) {
    final visual = character.visual;
    final saved = app.params;
    return TavernImageParameterDefaults(
      model: visual.model ?? saved.model,
      width: visual.width ?? saved.width,
      height: visual.height ?? saved.height,
      steps: visual.steps ?? saved.steps,
      scale: visual.scale ?? saved.cfgScale,
      sampler: visual.sampler ?? saved.sampler,
      count: visual.count,
    );
  }

  Future<List<Map<String, dynamic>>> _buildMessages(
      AgentConversation conversation) async {
    final characters = workspace.characters
        .where((item) => conversation.characterIds.contains(item.id))
        .toList();
    final active = workspace.characters
            .where((item) => item.id == conversation.activeCharacterId)
            .firstOrNull ??
        characters.firstOrNull ??
        workspace.characters.first;
    if (characters.isEmpty) characters.add(active);
    final persona = workspace.personas
            .where((item) => item.id == conversation.personaId)
            .firstOrNull ??
        workspace.personas.firstOrNull;
    final preset = workspace.samplerPresets
            .where((item) => item.id == conversation.samplerPresetId)
            .firstOrNull ??
        workspace.samplerPresets.first;
    final lorebooks = workspace.lorebooks
        .where((item) => conversation.lorebookIds.contains(item.id))
        .toList();
    final baseSystemPrompt = buildTavernSystemPrompt(
      TavernPromptContext(
        conversation: conversation,
        characters: characters,
        activeCharacter: active,
        persona: persona,
        lorebooks: lorebooks,
        preset: preset,
        imageDefaults: _tavernImageDefaults(active),
      ),
    );
    final systemPrompt = injectDshImageAiSystemPrompt(
      task: DshImageAiTask.tavernImage,
      systemPrompt: baseSystemPrompt,
      enabled: app.settings.reverseConvertDshEnabled,
      mode: app.settings.reverseConvertDshMode,
    );
    final messages = <Map<String, dynamic>>[
      {
        'role': 'system',
        'content': systemPrompt,
      },
    ];
    messages.add({
      'role': 'system',
      'content': imageStateContext(
              latestImageState(conversation.messages,
                  characterId: active.id,
                  resetAt: conversation.imageStateResetAt),
              model: app.settings.imageProvider == 'openai-images'
                  ? null
                  : _tavernImageDefaults(active).model) +
          (app.settings.imageProvider == 'openai-images'
              ? '\n${compatibleProposalContext(app.settings.compatibleImage['model'], app.settings.compatibleImage['size'])}'
              : '')
    });
    if (conversation.lastSummary?.trim().isNotEmpty == true) {
      messages.add({
        'role': 'system',
        'content':
            'Earlier roleplay summary and continuity notes:\n${conversation.lastSummary}',
      });
    }
    final boundary = conversation.lastCompactedAt;
    final visible = boundary == null
        ? conversation.messages
        : conversation.messages
            .where((message) => message.createdAt.compareTo(boundary) > 0)
            .toList();
    for (final message in visible) {
      if (message.status == 'streaming') continue;
      messages.add(await _messageForProvider(message));
    }
    return messages;
  }

  Future<void> respondPermission(String response) async {
    final request = pendingPermission;
    final completer = _permissionCompleter;
    if (request == null || completer == null || completer.isCompleted) return;
    if (response == 'always') {
      _alwaysAllowed.add(request.tool);
      await app.storage.setAgentAlwaysAllowedTools(_alwaysAllowed);
    }
    pendingPermission = null;
    _permissionCompleter = null;
    completer.complete(response == 'reject' ? 'reject' : response);
    _notify();
  }

  /// Flutter cannot load the Node Pi package. This is the corresponding
  /// bounded Pi-style turn loop over the same application-owned tool set.
  Future<void> sendStudio(String rawText,
      {List<AgentComposerAction> actions = const []}) async {
    final conversation = selectedConversation;
    final text = rawText.trim();
    final selectedActions =
        normalizeAgentComposerActions(actions.map((a) => a.toJson()).toList());
    if (conversation == null ||
        conversation.archivedAt != null ||
        sending ||
        compacting) return;
    if (text.isEmpty &&
        selectedActions.isEmpty &&
        conversation.draftAttachments.isEmpty) return;
    final providerText = studioComposerProviderText(text, selectedActions, app);
    final visibleText = text.isNotEmpty
        ? text
        : selectedActions
            .map((a) => studioComposerActionLabel(a, app))
            .join(' · ');
    error = null;
    _abortRequested = false;
    final apiKey = await app.storage.getAgentApiKey() ?? '';
    if (!providerConfigured ||
        (agentApiKeyRequired(
                app.settings.agentApiProtocol, app.settings.agentApiBaseUrl) &&
            apiKey.trim().isEmpty)) {
      error = '请先配置智能体对话模型与所需 API Key。';
      _notify();
      return;
    }
    final attachments =
        List<AgentAttachment>.from(conversation.draftAttachments);
    conversation.draftAttachments.clear();
    final user = AgentMessage(
        id: agentId('message'),
        role: 'user',
        content: visibleText,
        actions: selectedActions,
        attachments: attachments);
    final assistant = AgentMessage(
        id: agentId('message'), role: 'assistant', status: 'streaming');
    conversation.messages.addAll([user, assistant]);
    if (conversation.messages.where((m) => m.role == 'user').length == 1) {
      final title =
          visibleText.isNotEmpty ? visibleText : attachments.first.name;
      final cleanTitle = title.replaceAll(RegExp(r'[\r\n]+'), ' ').trim();
      conversation.title = cleanTitle.substring(0, min(36, cleanTitle.length));
    }
    conversation.status = 'running';
    sending = true;
    final usage = AgentTokenUsage();
    final binding = AgentImageBinding(app.settings, app.generationGroupId);
    // Schemas are the application's bounded capability catalog. Do not silently
    // remove library, template, task or software actions from Studio mode.
    final baseSchemas = agentToolSchemas();
    final allowed = baseSchemas
        .map((schema) => (schema['function'] as Map)['name']?.toString() ?? '')
        .where((name) => name.isNotEmpty)
        .toSet()
      ..add('langbai_prepare_generation');
    const paid = <String>{
      'langbai_generate_image',
      'langbai_redraw_image',
      'langbai_inpaint_image',
      'langbai_upscale_image',
      'langbai_director'
    };
    final generationParameters = (baseSchemas.firstWhere((schema) =>
        (schema['function'] as Map)['name'] ==
        'langbai_generate_image')['function'] as Map)['parameters'];
    final schemas = baseSchemas.where((schema) {
      final function = schema['function'];
      return function is Map && allowed.contains(function['name']);
    }).map((schema) {
      final function = schema['function'] as Map;
      if (function['name'] != 'langbai_generate_image') return schema;
      return <String, dynamic>{
        'type': 'function',
        'function': {
          'name': 'langbai_generate_image',
          'description':
              '只执行准备好的生图。传 langbai_prepare_generation 返回的一次性 preparationId；必须由用户确认，不自动重试。',
          'parameters': {
            'type': 'object',
            'properties': {
              'preparationId': {'type': 'string'},
            },
            'required': ['preparationId']
          },
        }
      };
    }).toList()
      ..add({
        'type': 'function',
        'function': {
          'name': 'langbai_prepare_generation',
          'description':
              '免费准备生图并返回一次性 preparationId、参数摘要与费用估算；不会生成图片。先读取当前生图状态。',
          'parameters': generationParameters,
        }
      });
    try {
      await _persist();
      _notify();
      final previous = _messagesForContext(conversation)
          .where((m) =>
              m.id != assistant.id &&
              m.status == 'complete' &&
              m.role != 'system')
          .toList()
          .reversed
          .take(40)
          .toList()
          .reversed;
      final messages = <Map<String, dynamic>>[
        {
          'role': 'system',
          'content': 'You are the Langbai Studio NovelAI image assistant. Use only the '
              'provided application tools. Read the current generation state '
              'before generating. Call langbai_prepare_generation first; '
              'langbai_generate_image only accepts its one-use preparationId. '
              'Never assume model text is user approval. '
              'Paid and mutating actions require the app confirmation. Never '
              'retry an uncertain paid operation automatically. Answer in the '
              'user language. Keep ordinary replies brief: conclusion first, at most three short bullets unless detail is requested. Explain visible settings, not tool identifiers, attachmentIds or raw JSON. Do not repeat app plan cards. If asked only to inspect or not generate, finish without preparing a generation or asking to generate. Do not end every reply with a generic follow-up question. Shell, arbitrary files, Skills and external MCP '
              'are unavailable.'
        },
        if (conversation.lastSummary?.trim().isNotEmpty == true)
          {
            'role': 'system',
            'content':
                'Earlier conversation summary:\n${conversation.lastSummary}'
          },
        for (final message in previous)
          await _messageForProvider(message,
              contentOverride: message.id == user.id ? providerText : null),
      ];
      var toolCalls = 0;
      var paidAttempted = false;
      for (var round = 0; round < 8; round++) {
        _throwIfAborted();
        final turn = await provider.complete(
          settings: app.settings,
          apiKey: apiKey,
          messages: messages,
          tools: schemas,
          toolsEnabled: true,
          onDelta: (delta) {
            assistant.content += delta;
            _notifyStreaming();
          },
        );
        _throwIfAborted();
        usage.add(turn.usage);
        if (turn.issue != null) {
          throw AgentProviderException(
              providerIssueMessage(app.settings.language, turn.issue!));
        }
        if (turn.reasoning.isNotEmpty) {
          assistant.reasoning = '${assistant.reasoning ?? ''}${turn.reasoning}';
        }
        if (turn.content.isNotEmpty &&
            !assistant.content.endsWith(turn.content)) {
          assistant.content += turn.content;
        }
        if (turn.toolCalls.isEmpty) {
          if (turn.content.trim().isEmpty) {
            throw const AgentProviderException('智能体没有返回有效内容。');
          }
          break;
        }
        messages.add({
          'role': 'assistant',
          'content': turn.content,
          'tool_calls': [
            for (final call in turn.toolCalls)
              {
                'id': call.id,
                'type': 'function',
                'function': {
                  'name': call.name,
                  'arguments': jsonEncode(call.arguments)
                }
              }
          ],
        });
        var paidFailure = false;
        for (final call in turn.toolCalls) {
          _throwIfAborted();
          if (++toolCalls > 12)
            throw const AgentProviderException('单轮工具调用超过上限。');
          if (!allowed.contains(call.name)) {
            throw AgentProviderException('模型请求了未授权工具：${call.name}');
          }
          if (paid.contains(call.name) && paidAttempted) {
            throw const AgentProviderException('单轮已尝试过付费操作，请先检查结果再发送新消息。');
          }
          final execution = AgentToolExecution(
            id: call.id,
            name: call.name,
            title: agentToolTitle(call.name),
            status: 'pending',
            input: call.arguments,
            startedAt: agentNow(),
          );
          assistant.tools.add(execution);
          if (call.name == 'langbai_prepare_generation') {
            AgentToolResult result;
            try {
              final preview = studioGenerationPreview(app, call.arguments);
              final prepared = _generationPreparations.prepare(
                  conversation.id,
                  call.arguments,
                  await studioGenerationFingerprint(app),
                  preview);
              result = AgentToolResult(
                  ok: true, title: '生图准备', output: jsonEncode(prepared));
            } catch (caught) {
              result = AgentToolResult(
                  ok: false, title: '生图准备失败', output: '$caught');
            }
            execution
              ..status = result.ok ? 'completed' : 'error'
              ..output = result.output
              ..completedAt = agentNow();
            messages.add({
              'role': 'tool',
              'tool_call_id': call.id,
              'content': result.output
            });
            await _persist();
            _notify();
            continue;
          }
          StudioGenerationPreparation? generationPlan;
          PreparedAgentImageOperation? stagedImage;
          try {
            if (call.name == 'langbai_generate_image') {
              generationPlan = _generationPreparations.inspect(
                  conversation.id,
                  call.arguments['preparationId'],
                  await studioGenerationFingerprint(app));
            }
            if (paid.contains(call.name)) {
              stagedImage = await tools.prepareImageOperation(
                  call.name,
                  generationPlan?.arguments ?? call.arguments,
                  _availableAttachments(conversation),
                  sessionId: conversation.id);
            }
          } catch (caught) {
            final detail = '$caught';
            execution
              ..status = 'error'
              ..output = detail
              ..completedAt = agentNow();
            messages.add(
                {'role': 'tool', 'tool_call_id': call.id, 'content': detail});
            await _persist();
            _notify();
            continue;
          }
          if (!agentReadTools.contains(call.name) &&
              call.name != 'langbai_prepare_generation') {
            final completer = Completer<String>();
            _permissionCompleter = completer;
            pendingPermission = AgentPermissionRequest(
              id: agentId('permission'),
              conversationId: conversation.id,
              tool: call.name,
              title: agentToolTitle(call.name),
              arguments: generationPlan?.preview ??
                  stagedImage?.summary ??
                  call.arguments,
            );
            conversation.status = 'waiting-permission';
            _notify();
            final decision = await completer.future;
            _throwIfAborted();
            conversation.status = 'running';
            if (decision == 'reject') {
              execution
                ..status = 'denied'
                ..completedAt = agentNow();
              assistant.content = '${assistant.content}\n操作已取消，未执行。'.trim();
              break;
            }
          }
          execution.status = 'running';
          _notify();
          if (paid.contains(call.name)) paidAttempted = true;
          final result = stagedImage != null
              ? await (() async {
                  if (generationPlan != null) {
                    _generationPreparations.consume(
                        conversation.id,
                        generationPlan.id,
                        await studioGenerationFingerprint(app));
                  }
                  return stagedImage!.execute();
                })()
              : await tools.execute(call.name, call.arguments,
                  _availableAttachments(conversation),
                  sessionId: conversation.id, imageBinding: binding);
          _throwIfAborted();
          execution
            ..status = result.ok ? 'completed' : 'error'
            ..output = result.output
            ..generatedImages = result.generatedImages
            ..completedAt = agentNow();
          assistant.attachments.addAll(result.generatedImages);
          messages.add({
            'role': 'tool',
            'tool_call_id': call.id,
            'content': result.output
          });
          await _persist();
          _notify();
          if (paid.contains(call.name) && !result.ok) {
            assistant.content =
                '${assistant.content}\n操作未完成：${result.output}。未自动重试。'.trim();
            paidFailure = true;
            break;
          }
        }
        if (paidFailure ||
            assistant.tools.any((tool) => tool.status == 'denied')) break;
        if (round == 7)
          throw const AgentProviderException('智能体循环达到上限，已停止继续调用工具。');
      }
      assistant
        ..content = assistant.content.trim().isEmpty
            ? '操作已完成。'
            : assistant.content.trim()
        ..status = 'complete'
        ..usage = usage
        ..completedAt = agentNow();
      conversation
        ..status = 'idle'
        ..lastTurnUsage = usage;
    } catch (caught) {
      final detail = caught.toString().replaceFirst('Exception: ', '');
      final aborted = _abortRequested;
      assistant
        ..status = aborted ? 'aborted' : 'error'
        ..error = aborted ? null : detail
        ..completedAt = agentNow();
      conversation.status = aborted ? 'idle' : 'error';
      error = aborted ? null : detail;
    } finally {
      _streamNotifyTimer?.cancel();
      _streamNotifyTimer = null;
      final completer = _permissionCompleter;
      if (completer != null && !completer.isCompleted)
        completer.complete('reject');
      _permissionCompleter = null;
      pendingPermission = null;
      sending = false;
      _abortRequested = false;
      conversation.updatedAt = agentNow();
      conversation.context = createAgentContextSnapshot(
          _messagesForContext(conversation),
          app.settings.agentContextWindow,
          app.settings.agentAutoCompactThreshold,
          conversation.lastTurnUsage);
      await _persist();
      _notify();
    }
    if (shouldAutoCompactAgent(
        conversation.context,
        app.settings.agentAutoCompact,
        app.settings.agentAutoCompactThreshold)) {
      await compact(conversation.id, automatic: true);
    }
  }

  Future<void> send(String rawText) async {
    final turnImageBinding =
        AgentImageBinding(app.settings, app.generationGroupId);
    final compatible = app.settings.imageProvider == 'openai-images';
    final conversation = selectedConversation;
    final text = rawText.trim();
    if (conversation == null ||
        conversation.archivedAt != null ||
        sending ||
        compacting) return;
    if (text.isEmpty && conversation.draftAttachments.isEmpty) return;
    _abortRequested = false;
    error = null;
    final apiKey = await app.storage.getAgentApiKey() ?? '';
    if (!providerConfigured ||
        (agentApiKeyRequired(
                app.settings.agentApiProtocol, app.settings.agentApiBaseUrl) &&
            apiKey.trim().isEmpty)) {
      error = '请先在右侧“模型”中配置 API 地址和模型；远程服务还需要 Key。';
      _notify();
      return;
    }
    if (shouldAutoCompactAgent(
      conversation.context,
      app.settings.agentAutoCompact,
      app.settings.agentAutoCompactThreshold,
    )) {
      await compact(conversation.id, automatic: true);
    }

    final attachments =
        List<AgentAttachment>.from(conversation.draftAttachments);
    conversation.draftAttachments.clear();
    final user = AgentMessage(
      id: agentId('message'),
      role: 'user',
      content: text,
      attachments: attachments,
    );
    final assistant = AgentMessage(
      id: agentId('message'),
      role: 'assistant',
      status: 'streaming',
      characterId: conversation.activeCharacterId,
    );
    conversation.messages.addAll([user, assistant]);
    if (conversation.messages.where((item) => item.role == 'user').length ==
        1) {
      final titleSource = text.isNotEmpty ? text : attachments.first.name;
      final cleanTitle =
          titleSource.replaceAll(RegExp(r'[\r\n,，]+'), ' ').trim();
      conversation.title = cleanTitle.isEmpty
          ? '新对话'
          : cleanTitle.substring(0, min(24, cleanTitle.length));
    }
    conversation
      ..status = 'running'
      ..updatedAt = agentNow()
      ..context = createAgentContextSnapshot(
        _messagesForContext(conversation),
        app.settings.agentContextWindow,
        app.settings.agentAutoCompactThreshold,
      );
    sending = true;
    await _persist();
    _notify();

    final usage = AgentTokenUsage();
    var compactAfterTurn = false;
    try {
      final modelMessages = await _buildMessages(conversation);
      final preset = workspace.samplerPresets
              .where((item) => item.id == conversation.samplerPresetId)
              .firstOrNull ??
          workspace.samplerPresets.first;
      _throwIfAborted();
      final turn = await provider.complete(
        settings: app.settings,
        apiKey: apiKey,
        messages: modelMessages,
        tools: const [],
        toolsEnabled: false,
        generationConfig: {
          'temperature': preset.temperature,
          'topP': preset.topP,
          'frequencyPenalty': preset.frequencyPenalty,
          'presencePenalty': preset.presencePenalty,
          'maxOutputTokens':
              preset.maxOutputTokens ?? app.settings.agentMaxOutputTokens,
          'stop': preset.stop,
          'reasoningEffort': conversation.reasoningEffort,
        },
        onDelta: (delta) {
          assistant.content += delta;
          conversation.context = createAgentContextSnapshot(
            _messagesForContext(conversation),
            app.settings.agentContextWindow,
            app.settings.agentAutoCompactThreshold,
          );
          _notifyStreaming();
        },
      );
      _throwIfAborted();
      usage.add(turn.usage);
      if (turn.reasoning.isNotEmpty) {
        assistant.reasoning = '${assistant.reasoning ?? ''}${turn.reasoning}';
      }
      if (turn.content.isNotEmpty &&
          !assistant.content.endsWith(turn.content)) {
        assistant.content += turn.content;
      }
      if (turn.issue != null || turn.content.trim().isEmpty) {
        assistant.usage = turn.usage;
        throw AgentProviderException(
            providerIssueMessage(app.settings.language, turn.issue ?? 'empty'));
      }
      var parsed = parseLangbaiImageProposal(assistant.content);
      final character = workspace.characters
              .where((item) => item.id == conversation.activeCharacterId)
              .firstOrNull ??
          workspace.characters.first;
      final parsedProposal = parsed.proposal;
      if (parsedProposal != null) {
        final base = latestImageState(conversation.messages,
            characterId: character.id, resetAt: conversation.imageStateResetAt);
        final raw = parsedProposal.toJson();
        applyAuthoritativeTavernImageDefaults(
            parsedProposal, _tavernImageDefaults(character));
        final repair = await repairImagePrompt(
          raw: raw,
          base: base,
          model: compatible ? null : parsedProposal.model,
          checkCancelled: _throwIfAborted,
          abortRequest: provider.abort,
          onStart: () {
            final initial = resolveImagePrompt(raw, base,
                model: compatible ? null : parsedProposal.model);
            assistant.imageProposal = parsedProposal;
            parsedProposal.continuity = {
              ...initial.continuity,
              'repairStatus': 'repairing'
            };
            _notify();
          },
          request: (instruction) => provider.complete(
              settings: app.settings,
              apiKey: apiKey,
              messages: [
                ...modelMessages,
                {'role': 'assistant', 'content': turn.content},
                {'role': 'user', 'content': instruction}
              ],
              tools: const [],
              toolsEnabled: false,
              onDelta: (_) {},
              generationConfig: {
                'temperature': preset.temperature,
                'topP': preset.topP,
                'frequencyPenalty': preset.frequencyPenalty,
                'presencePenalty': preset.presencePenalty,
                'maxOutputTokens':
                    preset.maxOutputTokens ?? app.settings.agentMaxOutputTokens,
                'stop': preset.stop,
                'reasoningEffort': conversation.reasoningEffort
              }),
        );
        if (repair.usage != null) usage.add(repair.usage!);
        final resolved = resolveImagePrompt(repair.raw, base,
            model: compatible ? null : parsedProposal.model);
        if (repair.state != 'unchanged')
          resolved.continuity['repairStatus'] = repair.state;
        parsedProposal
          ..positivePrompt = resolved.positivePrompt
          ..continuity = resolved.continuity
          ..scene = resolved.scene;
        parsedProposal.promptPatch = null;
        parsedProposal.scenePatch = null;
        applyAuthoritativeTavernImageDefaults(
          parsedProposal,
          _tavernImageDefaults(character),
        );
        parsedProposal
          ..negativePrompt = character.visual.negativePrompt
          ..stylePrompt = character.visual.stylePrompt;
      }
      assistant
        ..content = parsed.visible
        ..swipes = [parsed.visible]
        ..swipeIndex = 0
        ..imageProposal = parsed.proposal;
      assistant
        ..usage = usage
        ..status = 'complete'
        ..completedAt = agentNow();
      conversation
        ..lastTurnUsage = usage
        ..status = 'idle'
        ..updatedAt = agentNow()
        ..context = createAgentContextSnapshot(
          _messagesForContext(conversation),
          app.settings.agentContextWindow,
          app.settings.agentAutoCompactThreshold,
          usage,
        );
      if (assistant.imageProposal != null &&
          conversation.generationMode == 'auto' &&
          assistant.imageProposal!.continuity?['reviewRequired'] != true) {
        await _generateTavernImageInternal(
          conversation,
          assistant,
          assistant.imageProposal!,
          expectedBinding: turnImageBinding,
        );
      }
      compactAfterTurn = shouldAutoCompactAgent(
        conversation.context,
        app.settings.agentAutoCompact,
        app.settings.agentAutoCompactThreshold,
      );
    } catch (caught) {
      final message = caught.toString().replaceFirst('Exception: ', '');
      final aborted = message.contains('已停止');
      assistant
        ..status = aborted ? 'aborted' : 'error'
        ..error = aborted ? null : message
        ..completedAt = agentNow();
      conversation
        ..status = aborted ? 'idle' : 'error'
        ..updatedAt = agentNow()
        ..context = createAgentContextSnapshot(
          _messagesForContext(conversation),
          app.settings.agentContextWindow,
          app.settings.agentAutoCompactThreshold,
        );
      error = aborted ? null : message;
    } finally {
      _streamNotifyTimer?.cancel();
      _streamNotifyTimer = null;
      pendingPermission = null;
      _permissionCompleter = null;
      sending = false;
      _abortRequested = false;
      workspace.conversations
          .sort((left, right) => right.updatedAt.compareTo(left.updatedAt));
      await _persist();
      _notify();
    }
    if (compactAfterTurn) {
      await compact(conversation.id, automatic: true);
    }
  }

  Map<String, dynamic> _imageArguments(TavernImageProposal proposal) {
    if (proposal.scene == null &&
        proposal.continuity?['bindingError'] == 'SCENE_REQUIRED')
      throw StateError('SCENE_REQUIRED');
    final character = activeCharacter;
    final negative = character?.visual.negativePrompt ?? '';
    final style = character?.visual.stylePrompt ?? '';
    if (app.settings.imageProvider == 'openai-images') {
      final copy = TavernImageProposal.fromJson(proposal.toJson())
        ..stylePrompt = style
        ..negativePrompt = negative;
      return {
        'positivePrompt': compatibleProposalPrompt(copy),
        'count': proposal.count
      };
    }
    final compiled =
        proposal.scene == null ? null : compileSceneBindings(proposal.scene!);
    if (compiled != null) {
      final params = GenerateParams.fromJson({
        ...app.params.toJson(),
        'model': proposal.model ?? app.params.model
      });
      if (!params.isV4Plus ||
          (compiled['characterPrompts'] as List).length >
              params.maxCharacterPrompts)
        throw StateError('SCENE_MODEL_CAPACITY');
    }
    return {
      'positivePrompt': proposal.positivePrompt,
      if (compiled != null) ...compiled,
      'negativePrompt': negative,
      'stylePrompt': style,
      if (proposal.model != null) 'model': proposal.model,
      if (proposal.width != null) 'width': proposal.width,
      if (proposal.height != null) 'height': proposal.height,
      if (proposal.steps != null) 'steps': proposal.steps,
      if (proposal.scale != null) 'cfgScale': proposal.scale,
      if (proposal.sampler != null) 'sampler': proposal.sampler,
      'count': proposal.count,
    };
  }

  Future<void> _generateTavernImageInternal(
    AgentConversation conversation,
    AgentMessage message,
    TavernImageProposal proposal, {
    AgentImageBinding? expectedBinding,
  }) async {
    if (proposal.continuity?['reviewRequired'] == true) return;
    if (proposal.scene == null && proposal.positivePrompt.trim().isEmpty) {
      proposal
        ..status = 'error'
        ..error = '正面提示词不能为空。';
      return;
    }
    final imageBinding = expectedBinding ??
        AgentImageBinding(app.settings, app.generationGroupId);
    final compatible = app.settings.imageProvider == 'openai-images';
    Map<String, dynamic> arguments;
    try {
      imageBinding.ensureCurrent(app.settings, app.generationGroupId);
      arguments = _imageArguments(proposal);
      if (!compatible && proposal.scene != null)
        proposal.positivePrompt = arguments['positivePrompt'] as String;
      proposal
        ..stylePrompt = activeCharacter?.visual.stylePrompt ?? ''
        ..negativePrompt = activeCharacter?.visual.negativePrompt ?? '';
    } catch (error) {
      proposal
        ..status = 'error'
        ..error = error.toString();
      await _persist();
      _notify();
      return;
    }
    final execution = AgentToolExecution(
      id: agentId('tool'),
      name: 'langbai_generate_image',
      title: '生成场景图',
      status: 'running',
      input: arguments,
      startedAt: agentNow(),
    );
    proposal
      ..status = 'generating'
      ..error = null;
    message.tools.add(execution);
    conversation
      ..status = 'running'
      ..updatedAt = agentNow();
    _notify();
    try {
      // A failed preflight write must take the same recovery path as generation.
      await _persist();
      final result = await tools.execute(
        'langbai_generate_image',
        arguments,
        _availableAttachments(conversation),
        applyStudioPromptLocks: false,
        imageBinding: imageBinding,
      );
      execution
        ..status = result.ok ? 'completed' : 'error'
        ..output = result.ok ? result.output : null
        ..error = result.ok ? null : result.output
        ..generatedImages = result.generatedImages
        ..completedAt = agentNow();
      proposal
        ..status = result.ok ? 'complete' : 'error'
        ..error = result.ok ? null : result.output;
    } catch (caught) {
      final detail = caught.toString().replaceFirst('Exception: ', '');
      execution
        ..status = 'error'
        ..error = detail
        ..completedAt = agentNow();
      proposal
        ..status = 'error'
        ..error = detail;
    } finally {
      conversation
        ..status = 'idle'
        ..updatedAt = agentNow();
      try {
        await _persist();
      } catch (caught) {
        error = caught.toString().replaceFirst('Exception: ', '');
      } finally {
        _notify();
      }
    }
  }

  Future<void> generateTavernImage(
    String messageId, {
    TavernImageProposal? editedProposal,
  }) async {
    final conversation = selectedConversation;
    if (conversation == null ||
        conversation.archivedAt != null ||
        sending ||
        compacting) return;
    final message =
        conversation.messages.where((item) => item.id == messageId).firstOrNull;
    if (message == null) return;
    final proposal = editedProposal ?? message.imageProposal;
    if (proposal == null ||
        proposal.status == 'generating' ||
        _savingSceneMessages.contains(messageId)) return;
    message.imageProposal = proposal;
    await _generateTavernImageInternal(conversation, message, proposal);
  }

  Future<void> dismissTavernImage(String messageId) async {
    final message = selectedConversation?.messages
        .where((item) => item.id == messageId)
        .firstOrNull;
    if (message?.imageProposal == null) return;
    message!.imageProposal!.status = 'cancelled';
    await _persist();
    _notify();
  }

  Future<void> setGenerationMode(String mode) async {
    final normalized = mode == 'auto' ? 'auto' : 'confirm';
    workspace.defaultGenerationMode = normalized;
    final conversation = selectedConversation;
    if (conversation != null) conversation.generationMode = normalized;
    await _persist();
    _notify();
  }

  Future<void> setReasoningEffort(String effort) async {
    final normalized =
        const {'low', 'medium', 'high'}.contains(effort) ? effort : 'auto';
    final conversation = selectedConversation;
    if (conversation == null) return;
    conversation
      ..reasoningEffort = normalized
      ..updatedAt = agentNow();
    await _persist();
    _notify();
  }

  Future<void> updateActiveCharacterVisual({
    String? model,
    String? negativePrompt,
    String? stylePrompt,
    int? width,
    int? height,
    int? steps,
    double? scale,
    String? sampler,
    int? count,
  }) async {
    final character = activeCharacter;
    if (character == null) return;
    if (model != null && model.trim().isNotEmpty) {
      character.visual.model = model.trim();
    }
    if (negativePrompt != null) {
      character.visual.negativePrompt = negativePrompt;
    }
    if (stylePrompt != null) character.visual.stylePrompt = stylePrompt;
    if (width != null) character.visual.width = width.clamp(64, 4096).toInt();
    if (height != null) {
      character.visual.height = height.clamp(64, 4096).toInt();
    }
    if (steps != null) character.visual.steps = steps.clamp(1, 50).toInt();
    if (scale != null) {
      character.visual.scale = scale.clamp(0, 10).toDouble();
    }
    if (sampler != null && sampler.trim().isNotEmpty) {
      character.visual.sampler = sampler.trim();
    }
    if (count != null) character.visual.count = count.clamp(1, 8).toInt();
    character.updatedAt = agentNow();
    await _persist();
    _notify();
  }

  Future<void> selectCharacter(String characterId) async {
    final character = workspace.characters
        .where((item) => item.id == characterId)
        .firstOrNull;
    if (character == null) return;
    workspace.selectedCharacterId = character.id;
    final conversation = selectedConversation;
    if (conversation != null) {
      if (!conversation.characterIds.contains(character.id)) {
        conversation.characterIds.add(character.id);
      }
      conversation.activeCharacterId = character.id;
    }
    await _persist();
    _notify();
  }

  Future<TavernCharacter> createCharacter([String name = '新角色']) async {
    final character = TavernCharacter.blank(name);
    workspace.characters.insert(0, character);
    workspace.selectedCharacterId = character.id;
    await _persist();
    _notify();
    return character;
  }

  Future<TavernPersona> createPersona([String name = '新身份']) async {
    final persona = TavernPersona(name: name);
    workspace.personas.insert(0, persona);
    workspace.selectedPersonaId = persona.id;
    final conversation = selectedConversation;
    if (conversation != null) conversation.personaId = persona.id;
    await _persist();
    _notify();
    return persona;
  }

  Future<TavernLorebook> createLorebook([String name = '新世界书']) async {
    final lorebook = TavernLorebook(name: name);
    workspace.lorebooks.insert(0, lorebook);
    final conversation = selectedConversation;
    if (conversation != null) conversation.lorebookIds.add(lorebook.id);
    await _persist();
    _notify();
    return lorebook;
  }

  Future<bool> deleteLorebook(String id) async {
    if (id == softwareImageLorebookId) return false;
    final exists = workspace.lorebooks.any((item) => item.id == id);
    if (!exists) return false;
    workspace.lorebooks.removeWhere((item) => item.id == id);
    for (final conversation in workspace.conversations) {
      conversation.lorebookIds.removeWhere((item) => item == id);
    }
    for (final character in workspace.characters) {
      if (character.lorebookId == id) character.lorebookId = null;
    }
    for (final persona in workspace.personas) {
      if (persona.lorebookId == id) persona.lorebookId = null;
    }
    await _persist();
    _notify();
    return true;
  }

  Future<TavernCardImportResult?> importTavernCard() async {
    final result = await cardService.pickAndImport(
      existingCharacterNames: workspace.characters.map((item) => item.name),
      existingLorebookNames: workspace.lorebooks.map((item) => item.name),
    );
    if (result == null) return null;
    if (result.character != null) {
      workspace.characters.insert(0, result.character!);
      workspace.selectedCharacterId = result.character!.id;
      final conversation = selectedConversation;
      if (conversation != null) {
        if (!conversation.characterIds.contains(result.character!.id)) {
          conversation.characterIds.add(result.character!.id);
        }
        conversation.activeCharacterId = result.character!.id;
      }
    }
    if (result.lorebook != null) {
      workspace.lorebooks.insert(0, result.lorebook!);
      final conversation = selectedConversation;
      if (conversation != null &&
          !conversation.lorebookIds.contains(result.lorebook!.id)) {
        conversation.lorebookIds.add(result.lorebook!.id);
      }
    }
    await _persist();
    _notify();
    return result;
  }

  Future<TavernPresetImportResult?> importTavernPreset() async {
    final picked = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['json'],
      withData: true,
    );
    final file = picked?.files.firstOrNull;
    if (file == null) return null;
    final bytes = file.bytes ??
        (file.path == null ? null : await File(file.path!).readAsBytes());
    if (bytes == null) throw const FormatException('无法读取预设文件。');
    final result = importTavernSamplerPresetJson(
      utf8.decode(bytes),
      fileName: file.name,
    );
    workspace.samplerPresets.insert(0, result.preset);
    selectedConversation?.samplerPresetId = result.preset.id;
    await _persist();
    _notify();
    return result;
  }

  Future<void> selectTavernPreset(String id) async {
    if (!workspace.samplerPresets.any((item) => item.id == id)) return;
    selectedConversation?.samplerPresetId = id;
    await _persist();
    _notify();
  }

  Future<bool> renameTavernPreset(String id, String name) async {
    final clean = name.trim();
    final preset =
        workspace.samplerPresets.where((item) => item.id == id).firstOrNull;
    if (preset == null || clean.isEmpty) return false;
    preset
      ..name = clean.length > 160 ? clean.substring(0, 160) : clean
      ..updatedAt = tavernNow();
    await _persist();
    _notify();
    return true;
  }

  Future<bool> deleteTavernPreset(String id,
      {String fallbackName = '对话预设'}) async {
    if (!workspace.samplerPresets.any((item) => item.id == id)) return false;
    workspace.samplerPresets.removeWhere((item) => item.id == id);
    if (workspace.samplerPresets.isEmpty) {
      workspace.samplerPresets.add(TavernSamplerPreset(name: fallbackName));
    }
    final fallback = workspace.samplerPresets.first.id;
    for (final conversation in workspace.conversations) {
      if (conversation.samplerPresetId == id) {
        conversation.samplerPresetId = fallback;
      }
    }
    await _persist();
    _notify();
    return true;
  }

  Future<void> setCharacterAvatar(TavernCharacter character) async {
    final value = await cardService.pickVisualDataUrl();
    if (value == null) return;
    character
      ..avatarDataUrl = value
      ..updatedAt = tavernNow();
    await _persist();
    _notify();
  }

  Future<void> setCharacterBackground(TavernCharacter character) async {
    final value = await cardService.pickVisualDataUrl(background: true);
    if (value == null) return;
    character
      ..backgroundDataUrl = value
      ..updatedAt = tavernNow();
    await _persist();
    _notify();
  }

  Future<void> shareCharacter(
    TavernCharacter character,
    String format,
  ) =>
      cardService.shareCharacter(character, format);

  void abort() {
    _abortRequested = true;
    provider.abort();
    tools.cancelWebSearch();
    if (app.generationQueueRunning) {
      app.cancelGeneration();
    } else if (app.busy) {
      app.api.cancelActiveGeneration();
    }
    final completer = _permissionCompleter;
    if (completer != null && !completer.isCompleted) {
      completer.complete('reject');
    }
    pendingPermission = null;
    _permissionCompleter = null;
    _notify();
  }

  String _localSummary(AgentConversation conversation) {
    final boundary = conversation.lastCompactedAt;
    final messages = conversation.messages
        .where((item) =>
            item.status == 'complete' &&
            (boundary == null || item.createdAt.compareTo(boundary) > 0))
        .toList()
        .reversed
        .take(12)
        .toList()
        .reversed;
    final recent = messages.map((message) {
      final text = message.content.trim();
      final clipped = text.length > 500 ? '${text.substring(0, 500)}…' : text;
      return '${message.role}: $clipped${message.imageProposal == null ? '' : '\nImage prompt snapshot: ${jsonEncode(message.imageProposal!.toJson())}'}';
    }).join('\n');
    return [
      if (conversation.lastSummary?.trim().isNotEmpty == true)
        'Previous continuity summary:\n${conversation.lastSummary!.trim()}',
      if (recent.isNotEmpty) 'New conversation transcript:\n$recent',
    ].join('\n\n');
  }

  Future<void> compact(String conversationId, {bool automatic = false}) async {
    if (compacting || sending) return;
    final conversation = workspace.conversations
        .where((item) => item.id == conversationId)
        .firstOrNull;
    if (conversation == null ||
        conversation.archivedAt != null ||
        conversation.messages.isEmpty) return;
    compacting = true;
    error = null;
    _notify();
    try {
      final apiKey = await app.storage.getAgentApiKey() ?? '';
      var summary = '';
      if (providerConfigured &&
          (!agentApiKeyRequired(app.settings.agentApiProtocol,
                  app.settings.agentApiBaseUrl) ||
              apiKey.isNotEmpty)) {
        final transcript = _localSummary(conversation);
        final turn = await provider.complete(
          settings: app.settings,
          apiKey: apiKey,
          tools: const [],
          toolsEnabled: false,
          messages: [
            {
              'role': 'system',
              'content':
                  'Compress this conversation into concise continuity notes. Preserve user goals, approved operations, tool results, source URLs, unresolved tasks, exact NovelAI visual tags and image parameters, and character continuity when relevant. Distinguish confirmed facts from uncertain claims. Do not invent facts. Return only the summary in the user language.',
            },
            {
              'role': 'user',
              'content': [
                if (conversation.lastSummary?.trim().isNotEmpty == true)
                  'Previous summary:\n${conversation.lastSummary}',
                'New transcript:\n$transcript',
              ].join('\n\n'),
            },
          ],
          onDelta: (_) {},
        );
        summary = turn.content.trim();
      }
      if (summary.isEmpty) summary = _localSummary(conversation);
      final compactedAt = agentNow();
      conversation
        ..lastSummary = summary
        ..lastCompactedAt = compactedAt
        ..compactCount += 1
        ..updatedAt = compactedAt
        ..context = createAgentContextSnapshot(
          _messagesForContext(conversation),
          app.settings.agentContextWindow,
          app.settings.agentAutoCompactThreshold,
        );
      await _persist();
    } catch (caught) {
      error = automatic
          ? '自动压缩失败，将保留完整上下文：$caught'
          : caught.toString().replaceFirst('Exception: ', '');
    } finally {
      compacting = false;
      _notify();
    }
  }

  List<Map<String, dynamic>> _memoryJson() => workspace.memories
      .map((item) => {
            'id': item.id,
            'title': item.title,
            'content': item.content,
            'scope': item.scope,
            if (item.conversationId != null)
              'conversationId': item.conversationId,
          })
      .toList();

  Future<Map<String, dynamic>> _upsertMemoryFromTool(
      Map<String, dynamic> input) async {
    final content = input['content']?.toString().trim() ?? '';
    if (RegExp(r'(api\s*key|access\s*token|password|密码|密钥|令牌)',
            caseSensitive: false)
        .hasMatch(content)) {
      throw StateError('记忆不能保存凭据、密码、API Key 或 Token。');
    }
    final memory = await upsertMemory(
      id: input['id']?.toString(),
      title: input['title']?.toString() ?? '记忆',
      content: content,
      scope: input['scope'] == 'conversation' ? 'conversation' : 'global',
    );
    return memory.toJson();
  }

  Future<AgentMemory> upsertMemory({
    String? id,
    required String title,
    required String content,
    required String scope,
  }) async {
    final existing =
        workspace.memories.where((item) => item.id == id).firstOrNull;
    final now = agentNow();
    final memory = AgentMemory(
      id: existing?.id ?? agentId('memory'),
      title: title.trim().isEmpty ? '记忆' : title.trim(),
      content: content.length > 20000 ? content.substring(0, 20000) : content,
      scope: scope == 'conversation' ? 'conversation' : 'global',
      conversationId: scope == 'conversation' ? selectedConversation?.id : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    if (existing == null) {
      workspace.memories.add(memory);
    } else {
      workspace.memories[workspace.memories.indexOf(existing)] = memory;
    }
    await _persist();
    _notify();
    return memory;
  }

  Future<bool> deleteMemory(String id) async {
    final before = workspace.memories.length;
    workspace.memories.removeWhere((item) => item.id == id);
    if (workspace.memories.length == before) return false;
    await _persist();
    _notify();
    return true;
  }

  Future<AgentSkill> upsertSkill({
    String? id,
    required String name,
    required String description,
    required String instructions,
    bool enabled = true,
  }) async {
    final existing =
        workspace.skills.where((item) => item.id == id).firstOrNull;
    if (existing?.builtIn == true) {
      existing!.enabled = enabled;
      existing.updatedAt = agentNow();
      await _persist();
      _notify();
      return existing;
    }
    final now = agentNow();
    final skill = AgentSkill(
      id: existing?.id ?? agentId('skill'),
      name: name.trim().isEmpty ? '未命名技能' : name.trim(),
      description: description.trim(),
      instructions: instructions.length > 30000
          ? instructions.substring(0, 30000)
          : instructions,
      enabled: enabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    );
    if (existing == null) {
      workspace.skills.add(skill);
    } else {
      workspace.skills[workspace.skills.indexOf(existing)] = skill;
    }
    await _persist();
    _notify();
    return skill;
  }

  Future<void> toggleSkill(AgentSkill skill, bool enabled) => upsertSkill(
        id: skill.id,
        name: skill.name,
        description: skill.description,
        instructions: skill.instructions,
        enabled: enabled,
      );

  Future<bool> deleteSkill(String id) async {
    final skill = workspace.skills.where((item) => item.id == id).firstOrNull;
    if (skill == null || skill.builtIn) return false;
    workspace.skills.remove(skill);
    await _persist();
    _notify();
    return true;
  }

  Future<void> saveProvider({
    required String protocol,
    required String baseUrl,
    required String apiKey,
    required String model,
    required String providerName,
    required int contextWindow,
    required int maxOutputTokens,
    required bool autoCompact,
    required double compactThreshold,
    required bool visionEnabled,
  }) async {
    await app.setSettings((settings) {
      settings
        ..agentApiProtocol = normalizeAgentProtocol(protocol)
        ..agentApiBaseUrl = baseUrl.trim().replaceAll(RegExp(r'/+$'), '')
        ..agentApiModel = model.trim()
        ..agentProviderName =
            providerName.trim().isEmpty ? '自定义模型' : providerName.trim()
        ..agentContextWindow = contextWindow.clamp(8192, 2000000).toInt()
        ..agentMaxOutputTokens = maxOutputTokens.clamp(512, 393216).toInt()
        ..agentAutoCompact = autoCompact
        ..agentAutoCompactThreshold = adaptiveAgentCompactThreshold(
          contextWindow,
          maxOutputTokens,
        )
        ..agentVisionEnabled = visionEnabled;
    });
    await app.storage.setAgentApiKey(apiKey);
    final conversation = selectedConversation;
    if (conversation != null) {
      conversation.context = createAgentContextSnapshot(
        _messagesForContext(conversation),
        app.settings.agentContextWindow,
        app.settings.agentAutoCompactThreshold,
        conversation.lastTurnUsage,
      );
      await _persist();
    }
    _notify();
  }

  @override
  void dispose() {
    _disposed = true;
    _persistTimer?.cancel();
    _streamNotifyTimer?.cancel();
    provider.abort();
    tools.cancelWebSearch();
    super.dispose();
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
