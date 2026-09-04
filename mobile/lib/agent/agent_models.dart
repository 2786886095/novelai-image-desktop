import 'dart:math';

import 'tavern_builtins.dart';
import 'tavern_models.dart';
export 'tavern_models.dart';

// Version 3 existed only in unreleased local Tavern builds. Keep desktop and
// mobile on the corrected schema so a broken empty starter card is reset.
const int agentWorkspaceVersion = 4;
const int defaultAgentContextWindow = 1048576;
const int defaultAgentMaxOutputTokens = 32768;
const double defaultAgentCompactThreshold = 0.88;

String agentNow() => DateTime.now().toUtc().toIso8601String();

String agentId([String prefix = 'agent']) {
  final now = DateTime.now().microsecondsSinceEpoch;
  final random = Random.secure().nextInt(1 << 32).toRadixString(16);
  return '$prefix-$now-$random';
}

int _int(Object? value, [int fallback = 0]) =>
    value is num ? value.round() : int.tryParse('$value') ?? fallback;

double _double(Object? value, [double fallback = 0]) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? fallback;

String _text(Object? value, [String fallback = '']) =>
    value == null ? fallback : value.toString();

Map<String, dynamic> _map(Object? value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

class AgentTokenUsage {
  int input;
  int output;
  int reasoning;
  int cacheRead;
  int cacheWrite;
  int total;
  double? cost;
  bool estimated;

  AgentTokenUsage({
    this.input = 0,
    this.output = 0,
    this.reasoning = 0,
    this.cacheRead = 0,
    this.cacheWrite = 0,
    int? total,
    this.cost,
    this.estimated = false,
  }) : total = total ?? input + output + reasoning;

  factory AgentTokenUsage.fromJson(Map<String, dynamic> json) {
    final input = max(0, _int(json['input'] ?? json['prompt_tokens']));
    final output = max(0, _int(json['output'] ?? json['completion_tokens']));
    final reasoning = max(0, _int(json['reasoning']));
    return AgentTokenUsage(
      input: input,
      output: output,
      reasoning: reasoning,
      cacheRead: max(0, _int(json['cacheRead'])),
      cacheWrite: max(0, _int(json['cacheWrite'])),
      total: max(
          0,
          _int(json['total'] ?? json['total_tokens'],
              input + output + reasoning)),
      cost: json['cost'] is num ? (json['cost'] as num).toDouble() : null,
      estimated: json['estimated'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'input': input,
        'output': output,
        'reasoning': reasoning,
        'cacheRead': cacheRead,
        'cacheWrite': cacheWrite,
        'total': total,
        if (cost != null) 'cost': cost,
        'estimated': estimated,
      };

  void add(AgentTokenUsage other) {
    input += other.input;
    output += other.output;
    reasoning += other.reasoning;
    cacheRead += other.cacheRead;
    cacheWrite += other.cacheWrite;
    total += other.total;
    if (other.cost != null) cost = (cost ?? 0) + other.cost!;
    estimated = estimated || other.estimated;
  }
}

class AgentContextSnapshot {
  int used;
  int limit;
  double percent;
  bool danger;
  bool estimated;
  String updatedAt;

  AgentContextSnapshot({
    this.used = 0,
    this.limit = defaultAgentContextWindow,
    this.percent = 0,
    this.danger = false,
    this.estimated = true,
    String? updatedAt,
  }) : updatedAt = updatedAt ?? agentNow();

  factory AgentContextSnapshot.fromJson(Map<String, dynamic> json) =>
      AgentContextSnapshot(
        used: max(0, _int(json['used'])),
        limit: max(8192, _int(json['limit'], defaultAgentContextWindow)),
        percent: _double(json['percent']).clamp(0, 100).toDouble(),
        danger: json['danger'] == true,
        estimated: json['estimated'] != false,
        updatedAt: _text(json['updatedAt'], agentNow()),
      );

  Map<String, dynamic> toJson() => {
        'used': used,
        'limit': limit,
        'percent': percent,
        'danger': danger,
        'estimated': estimated,
        'updatedAt': updatedAt,
      };
}

class AgentAttachment {
  String id;
  String name;
  String mime;
  int size;
  String kind;
  String filePath;
  int? width;
  int? height;
  String createdAt;

  AgentAttachment({
    required this.id,
    required this.name,
    required this.mime,
    required this.size,
    required this.kind,
    required this.filePath,
    this.width,
    this.height,
    String? createdAt,
  }) : createdAt = createdAt ?? agentNow();

  factory AgentAttachment.fromJson(Map<String, dynamic> json) =>
      AgentAttachment(
        id: _text(json['id'], agentId('attachment')),
        name: _text(json['name'], 'attachment'),
        mime: _text(json['mime'], 'application/octet-stream'),
        size: max(0, _int(json['size'])),
        kind:
            const {'image', 'document', 'text', 'other'}.contains(json['kind'])
                ? json['kind'].toString()
                : 'other',
        filePath: _text(json['filePath']),
        width: json['width'] is num ? _int(json['width']) : null,
        height: json['height'] is num ? _int(json['height']) : null,
        createdAt: _text(json['createdAt'], agentNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'mime': mime,
        'size': size,
        'kind': kind,
        'filePath': filePath,
        if (width != null) 'width': width,
        if (height != null) 'height': height,
        'createdAt': createdAt,
      };

  String get portableIdentity => '$name\u241f$mime\u241f$size\u241f$kind';
}

class AgentToolExecution {
  String id;
  String name;
  String title;
  String status;
  Map<String, dynamic>? input;
  String? output;
  String? error;
  String? startedAt;
  String? completedAt;
  List<AgentAttachment> generatedImages;

  AgentToolExecution({
    required this.id,
    required this.name,
    required this.title,
    this.status = 'pending',
    this.input,
    this.output,
    this.error,
    this.startedAt,
    this.completedAt,
    List<AgentAttachment>? generatedImages,
  }) : generatedImages = generatedImages ?? [];

  factory AgentToolExecution.fromJson(Map<String, dynamic> json) =>
      AgentToolExecution(
        id: _text(json['id'], agentId('tool')),
        name: _text(json['name']),
        title: _text(json['title'], _text(json['name'], 'Tool')),
        status: _text(json['status'], 'complete'),
        input: json['input'] is Map ? _map(json['input']) : null,
        output: json['output']?.toString(),
        error: json['error']?.toString(),
        startedAt: json['startedAt']?.toString(),
        completedAt: json['completedAt']?.toString(),
        generatedImages: (json['generatedImages'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => AgentAttachment.fromJson(_map(item)))
            .toList(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'title': title,
        'status': status,
        if (input != null) 'input': input,
        if (output != null) 'output': output,
        if (error != null) 'error': error,
        if (startedAt != null) 'startedAt': startedAt,
        if (completedAt != null) 'completedAt': completedAt,
        if (generatedImages.isNotEmpty)
          'generatedImages':
              generatedImages.map((item) => item.toJson()).toList(),
      };
}

class AgentMessage {
  String id;
  String role;
  String content;
  String? reasoning;
  List<AgentAttachment> attachments;
  List<AgentToolExecution> tools;
  AgentTokenUsage? usage;
  String status;
  String? error;
  String createdAt;
  String? completedAt;
  String? characterId;
  List<String> swipes;
  int swipeIndex;
  TavernImageProposal? imageProposal;

  AgentMessage({
    required this.id,
    required this.role,
    this.content = '',
    this.reasoning,
    List<AgentAttachment>? attachments,
    List<AgentToolExecution>? tools,
    this.usage,
    this.status = 'complete',
    this.error,
    String? createdAt,
    this.completedAt,
    this.characterId,
    List<String>? swipes,
    this.swipeIndex = 0,
    this.imageProposal,
  })  : attachments = attachments ?? [],
        tools = tools ?? [],
        swipes = swipes ?? [],
        createdAt = createdAt ?? agentNow();

  factory AgentMessage.fromJson(Map<String, dynamic> json) => AgentMessage(
        id: _text(json['id'], agentId('message')),
        role: const {'user', 'assistant', 'system'}.contains(json['role'])
            ? json['role'].toString()
            : 'assistant',
        content: _text(json['content']),
        reasoning: json['reasoning']?.toString(),
        attachments: (json['attachments'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => AgentAttachment.fromJson(_map(item)))
            .toList(),
        tools: (json['tools'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => AgentToolExecution.fromJson(_map(item)))
            .toList(),
        usage: json['usage'] is Map
            ? AgentTokenUsage.fromJson(_map(json['usage']))
            : null,
        status: _text(json['status'], 'complete'),
        error: json['error']?.toString(),
        createdAt: _text(json['createdAt'], agentNow()),
        completedAt: json['completedAt']?.toString(),
        characterId: json['characterId']?.toString(),
        swipes: (json['swipes'] as List? ?? const [])
            .map((item) => '$item')
            .toList(),
        swipeIndex: max(0, _int(json['swipeIndex'])),
        imageProposal: json['imageProposal'] is Map
            ? TavernImageProposal.fromJson(_map(json['imageProposal']))
            : null,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'role': role,
        'content': content,
        if (reasoning != null && reasoning!.isNotEmpty) 'reasoning': reasoning,
        'attachments': attachments.map((item) => item.toJson()).toList(),
        'tools': tools.map((item) => item.toJson()).toList(),
        if (usage != null) 'usage': usage!.toJson(),
        'status': status,
        if (error != null) 'error': error,
        'createdAt': createdAt,
        if (completedAt != null) 'completedAt': completedAt,
        if (characterId != null) 'characterId': characterId,
        if (swipes.isNotEmpty) 'swipes': swipes,
        if (swipes.isNotEmpty) 'swipeIndex': swipeIndex,
        if (imageProposal != null) 'imageProposal': imageProposal!.toJson(),
      };
}

class AgentConversation {
  String id;
  String title;
  List<AgentMessage> messages;
  List<AgentAttachment> draftAttachments;
  String status;
  AgentContextSnapshot context;
  AgentTokenUsage? lastTurnUsage;
  int compactCount;
  String? lastCompactedAt;
  String? lastSummary;
  String createdAt;
  String updatedAt;
  List<String> characterIds;
  String? activeCharacterId;
  String? personaId;
  List<String> lorebookIds;
  String? samplerPresetId;
  String generationMode;
  String reasoningEffort;
  bool autoPlayGroup;
  String? backgroundDataUrl;
  bool pinned;

  AgentConversation({
    required this.id,
    required this.title,
    List<AgentMessage>? messages,
    List<AgentAttachment>? draftAttachments,
    this.status = 'idle',
    AgentContextSnapshot? context,
    this.lastTurnUsage,
    this.compactCount = 0,
    this.lastCompactedAt,
    this.lastSummary,
    String? createdAt,
    String? updatedAt,
    List<String>? characterIds,
    this.activeCharacterId,
    this.personaId,
    List<String>? lorebookIds,
    this.samplerPresetId,
    this.generationMode = 'confirm',
    this.reasoningEffort = 'auto',
    this.autoPlayGroup = false,
    this.backgroundDataUrl,
    this.pinned = false,
  })  : messages = messages ?? [],
        draftAttachments = draftAttachments ?? [],
        characterIds = characterIds ?? [],
        lorebookIds = lorebookIds ?? [],
        context = context ?? AgentContextSnapshot(),
        createdAt = createdAt ?? agentNow(),
        updatedAt = updatedAt ?? agentNow();

  factory AgentConversation.fromJson(Map<String, dynamic> json) =>
      AgentConversation(
        id: _text(json['id'], agentId('conversation')),
        title: _text(json['title'], '新对话'),
        messages: (json['messages'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => AgentMessage.fromJson(_map(item)))
            .toList(),
        draftAttachments: (json['draftAttachments'] as List? ?? const [])
            .whereType<Map>()
            .map((item) => AgentAttachment.fromJson(_map(item)))
            .toList(),
        status: const {'idle', 'running', 'waiting-permission', 'error'}
                .contains(json['status'])
            ? json['status'].toString()
            : 'idle',
        context: json['context'] is Map
            ? AgentContextSnapshot.fromJson(_map(json['context']))
            : AgentContextSnapshot(),
        lastTurnUsage: json['lastTurnUsage'] is Map
            ? AgentTokenUsage.fromJson(_map(json['lastTurnUsage']))
            : null,
        compactCount: max(0, _int(json['compactCount'])),
        lastCompactedAt: json['lastCompactedAt']?.toString(),
        lastSummary: json['lastSummary']?.toString(),
        createdAt: _text(json['createdAt'], agentNow()),
        updatedAt: _text(json['updatedAt'], agentNow()),
        characterIds: (json['characterIds'] as List? ?? const [])
            .map((item) => '$item')
            .toList(),
        activeCharacterId: json['activeCharacterId']?.toString(),
        personaId: json['personaId']?.toString(),
        lorebookIds: (json['lorebookIds'] as List? ?? const [])
            .map((item) => '$item')
            .toList(),
        samplerPresetId: json['samplerPresetId']?.toString(),
        generationMode: json['generationMode'] == 'auto' ? 'auto' : 'confirm',
        reasoningEffort:
            const {'low', 'medium', 'high'}.contains(json['reasoningEffort'])
                ? json['reasoningEffort'].toString()
                : 'auto',
        autoPlayGroup: json['autoPlayGroup'] == true,
        backgroundDataUrl: json['backgroundDataUrl']?.toString(),
        pinned: json['pinned'] == true,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'messages': messages.map((item) => item.toJson()).toList(),
        'draftAttachments':
            draftAttachments.map((item) => item.toJson()).toList(),
        'status': status,
        'context': context.toJson(),
        if (lastTurnUsage != null) 'lastTurnUsage': lastTurnUsage!.toJson(),
        'compactCount': compactCount,
        if (lastCompactedAt != null) 'lastCompactedAt': lastCompactedAt,
        if (lastSummary != null) 'lastSummary': lastSummary,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        'characterIds': characterIds,
        if (activeCharacterId != null) 'activeCharacterId': activeCharacterId,
        if (personaId != null) 'personaId': personaId,
        'lorebookIds': lorebookIds,
        if (samplerPresetId != null) 'samplerPresetId': samplerPresetId,
        'generationMode': generationMode,
        'reasoningEffort': reasoningEffort,
        'autoPlayGroup': autoPlayGroup,
        if (backgroundDataUrl != null) 'backgroundDataUrl': backgroundDataUrl,
        'pinned': pinned,
      };
}

class AgentSkill {
  String id;
  String name;
  String description;
  String instructions;
  bool enabled;
  bool builtIn;
  String createdAt;
  String updatedAt;

  AgentSkill({
    required this.id,
    required this.name,
    this.description = '',
    required this.instructions,
    this.enabled = true,
    this.builtIn = false,
    String? createdAt,
    String? updatedAt,
  })  : createdAt = createdAt ?? agentNow(),
        updatedAt = updatedAt ?? agentNow();

  factory AgentSkill.fromJson(Map<String, dynamic> json) => AgentSkill(
        id: _text(json['id'], agentId('skill')),
        name: _text(json['name'], '未命名技能'),
        description: _text(json['description']),
        instructions: _text(json['instructions']),
        enabled: json['enabled'] != false,
        builtIn: json['builtIn'] == true,
        createdAt: _text(json['createdAt'], agentNow()),
        updatedAt: _text(json['updatedAt'], agentNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'instructions': instructions,
        'enabled': enabled,
        if (builtIn) 'builtIn': true,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

class AgentMemory {
  String id;
  String title;
  String content;
  String scope;
  String? conversationId;
  String createdAt;
  String updatedAt;

  AgentMemory({
    required this.id,
    required this.title,
    required this.content,
    this.scope = 'global',
    this.conversationId,
    String? createdAt,
    String? updatedAt,
  })  : createdAt = createdAt ?? agentNow(),
        updatedAt = updatedAt ?? agentNow();

  factory AgentMemory.fromJson(Map<String, dynamic> json) => AgentMemory(
        id: _text(json['id'], agentId('memory')),
        title: _text(json['title'], '记忆'),
        content: _text(json['content']),
        scope: json['scope'] == 'conversation' ? 'conversation' : 'global',
        conversationId: json['conversationId']?.toString(),
        createdAt: _text(json['createdAt'], agentNow()),
        updatedAt: _text(json['updatedAt'], agentNow()),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'content': content,
        'scope': scope,
        if (scope == 'conversation' && conversationId != null)
          'conversationId': conversationId,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

List<AgentSkill> defaultAgentSkills() {
  return [];
}

class AgentWorkspace {
  int version;
  String? selectedConversationId;
  List<AgentConversation> conversations;
  List<AgentSkill> skills;
  List<AgentMemory> memories;
  List<TavernCharacter> characters;
  List<TavernPersona> personas;
  List<TavernLorebook> lorebooks;
  List<TavernSamplerPreset> samplerPresets;
  String? selectedCharacterId;
  String? selectedPersonaId;
  String defaultGenerationMode;
  String updatedAt;

  AgentWorkspace({
    this.version = agentWorkspaceVersion,
    this.selectedConversationId,
    List<AgentConversation>? conversations,
    List<AgentSkill>? skills,
    List<AgentMemory>? memories,
    List<TavernCharacter>? characters,
    List<TavernPersona>? personas,
    List<TavernLorebook>? lorebooks,
    List<TavernSamplerPreset>? samplerPresets,
    this.selectedCharacterId,
    this.selectedPersonaId,
    this.defaultGenerationMode = 'confirm',
    String? updatedAt,
  })  : conversations = conversations ?? [],
        skills = skills ?? defaultAgentSkills(),
        memories = memories ?? [],
        characters = characters ?? [createSoftwareImageCharacter()],
        personas = personas ?? [createSoftwareImagePersona()],
        lorebooks = lorebooks ?? [createSoftwareImageLorebook()],
        samplerPresets = samplerPresets ?? [createSoftwareImageSamplerPreset()],
        updatedAt = updatedAt ?? agentNow();

  factory AgentWorkspace.fromJson(Map<String, dynamic> json) {
    if (_int(json['version'], 0) != agentWorkspaceVersion) {
      return AgentWorkspace();
    }
    final characters = (json['characters'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => TavernCharacter.fromJson(_map(item)))
        .toList();
    final protectedCharacter = createSoftwareImageCharacter();
    final protectedCharacterIndex =
        characters.indexWhere((item) => item.id == softwareImageCharacterId);
    if (protectedCharacterIndex >= 0) {
      final existing = characters[protectedCharacterIndex];
      protectedCharacter
        ..visual = existing.visual
        ..createdAt = existing.createdAt
        ..updatedAt = existing.updatedAt;
      characters[protectedCharacterIndex] = protectedCharacter;
    } else {
      characters.insert(0, protectedCharacter);
    }
    final personas = (json['personas'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => TavernPersona.fromJson(_map(item)))
        .toList();
    final protectedPersonaIndex =
        personas.indexWhere((item) => item.id == softwareImagePersonaId);
    if (protectedPersonaIndex >= 0) {
      final existing = personas[protectedPersonaIndex];
      final protectedPersona = createSoftwareImagePersona()
        ..avatarDataUrl = existing.avatarDataUrl
        ..createdAt = existing.createdAt
        ..updatedAt = existing.updatedAt;
      personas[protectedPersonaIndex] = protectedPersona;
    } else {
      personas.insert(0, createSoftwareImagePersona());
    }
    final lorebooks = (json['lorebooks'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => TavernLorebook.fromJson(_map(item)))
        .toList();
    final protectedLorebook = createSoftwareImageLorebook();
    final protectedLorebookIndex =
        lorebooks.indexWhere((item) => item.id == softwareImageLorebookId);
    if (protectedLorebookIndex >= 0) {
      final existing = lorebooks[protectedLorebookIndex];
      final enabledById = <String, bool>{
        for (final entry in existing.entries) entry.id: entry.enabled,
      };
      for (final entry in protectedLorebook.entries) {
        entry.enabled = enabledById[entry.id] ?? entry.enabled;
      }
      protectedLorebook
        ..createdAt = existing.createdAt
        ..updatedAt = existing.updatedAt;
      lorebooks[protectedLorebookIndex] = protectedLorebook;
    } else {
      lorebooks.insert(0, protectedLorebook);
    }
    final samplerPresets = (json['samplerPresets'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => TavernSamplerPreset.fromJson(_map(item)))
        .toList();
    if (!samplerPresets.any((item) => item.id == softwareImageSamplerId)) {
      samplerPresets.insert(0, createSoftwareImageSamplerPreset());
    }
    final conversations = (json['conversations'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => AgentConversation.fromJson(_map(item)))
        .toList();
    final selectedCharacter = json['selectedCharacterId']?.toString();
    final selectedPersona = json['selectedPersonaId']?.toString();
    for (final conversation in conversations) {
      conversation.characterIds
          .removeWhere((id) => !characters.any((item) => item.id == id));
      if (conversation.characterIds.isEmpty) {
        conversation.characterIds.add(characters.first.id);
      }
      if (!conversation.characterIds.contains(conversation.activeCharacterId)) {
        conversation.activeCharacterId = conversation.characterIds.first;
      }
      if (!personas.any((item) => item.id == conversation.personaId)) {
        conversation.personaId = personas.first.id;
      }
      conversation.lorebookIds
          .removeWhere((id) => !lorebooks.any((item) => item.id == id));
      if (!samplerPresets
          .any((item) => item.id == conversation.samplerPresetId)) {
        conversation.samplerPresetId = samplerPresets.first.id;
      }
    }
    final incomingSkills = (json['skills'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => AgentSkill.fromJson(_map(item)))
        .toList();
    final byId = <String, AgentSkill>{
      for (final item in defaultAgentSkills()) item.id: item,
    };
    for (final skill in incomingSkills) {
      final builtIn = byId[skill.id];
      if (builtIn != null) {
        builtIn.enabled = skill.enabled;
      } else if (skill.instructions.trim().isNotEmpty) {
        byId[skill.id] = skill;
      }
    }
    final selected = json['selectedConversationId']?.toString();
    return AgentWorkspace(
      selectedConversationId: conversations.any((item) => item.id == selected)
          ? selected
          : conversations.firstOrNull?.id,
      conversations: conversations,
      skills: byId.values.toList(),
      memories: (json['memories'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => AgentMemory.fromJson(_map(item)))
          .where((item) => item.content.trim().isNotEmpty)
          .toList(),
      characters: characters,
      personas: personas,
      lorebooks: lorebooks,
      samplerPresets: samplerPresets,
      selectedCharacterId:
          characters.any((item) => item.id == selectedCharacter)
              ? selectedCharacter
              : characters.first.id,
      selectedPersonaId: personas.any((item) => item.id == selectedPersona)
          ? selectedPersona
          : personas.first.id,
      defaultGenerationMode:
          json['defaultGenerationMode'] == 'auto' ? 'auto' : 'confirm',
      updatedAt: _text(json['updatedAt'], agentNow()),
    );
  }

  Map<String, dynamic> toJson() => {
        'version': agentWorkspaceVersion,
        if (selectedConversationId != null)
          'selectedConversationId': selectedConversationId,
        'conversations': conversations.map((item) => item.toJson()).toList(),
        'skills': skills.map((item) => item.toJson()).toList(),
        'memories': memories.map((item) => item.toJson()).toList(),
        'characters': characters.map((item) => item.toJson()).toList(),
        'personas': personas.map((item) => item.toJson()).toList(),
        'lorebooks': lorebooks.map((item) => item.toJson()).toList(),
        'samplerPresets': samplerPresets.map((item) => item.toJson()).toList(),
        if (selectedCharacterId != null)
          'selectedCharacterId': selectedCharacterId,
        if (selectedPersonaId != null) 'selectedPersonaId': selectedPersonaId,
        'defaultGenerationMode': defaultGenerationMode,
        'updatedAt': updatedAt,
      };
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}

class AgentPermissionRequest {
  final String id;
  final String conversationId;
  final String tool;
  final String title;
  final Map<String, dynamic> arguments;
  final String createdAt;

  AgentPermissionRequest({
    required this.id,
    required this.conversationId,
    required this.tool,
    required this.title,
    required this.arguments,
    String? createdAt,
  }) : createdAt = createdAt ?? agentNow();
}

class AgentToolResult {
  final bool ok;
  final String title;
  final String output;
  final List<AgentAttachment> generatedImages;

  const AgentToolResult({
    required this.ok,
    required this.title,
    required this.output,
    this.generatedImages = const [],
  });
}
