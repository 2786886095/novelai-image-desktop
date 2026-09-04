import 'dart:convert';

import 'agent_models.dart';

class AgentMergeResult {
  final AgentWorkspace workspace;
  final int imported;
  final int skipped;
  final int renamed;

  const AgentMergeResult({
    required this.workspace,
    required this.imported,
    required this.skipped,
    required this.renamed,
  });
}

const _localOnlyKeys = <String>{
  'id',
  'filePath',
  'fileUrl',
  'runtimeSessionId',
  'context',
  'createdAt',
  'updatedAt',
};

Object? _comparableValue(Object? value) {
  if (value is List) return value.map(_comparableValue).toList();
  if (value is Map) {
    final entries = value.entries
        .where((entry) => !_localOnlyKeys.contains('${entry.key}'))
        .map((entry) => MapEntry('${entry.key}', _comparableValue(entry.value)))
        .toList()
      ..sort((left, right) => left.key.compareTo(right.key));
    return <String, Object?>{for (final entry in entries) entry.key: entry.value};
  }
  return value;
}

String _identity(Map<String, dynamic> value) =>
    jsonEncode(_comparableValue(value));

String _uniqueName(Set<String> occupied, String requested) {
  final base = requested.trim().isEmpty ? '未命名' : requested.trim();
  if (occupied.add(base.toLowerCase())) return base;
  var index = 1;
  while (!occupied.add('$base ($index)'.toLowerCase())) {
    index++;
  }
  return '$base ($index)';
}

String _freshId(String prefix, String id, Set<String> occupied) {
  if (id.isNotEmpty && occupied.add(id)) return id;
  var candidate = agentId(prefix);
  while (!occupied.add(candidate)) {
    candidate = agentId(prefix);
  }
  return candidate;
}

AgentMergeResult mergeAgentWorkspaces(
  AgentWorkspace local,
  AgentWorkspace incoming,
) {
  final output = AgentWorkspace.fromJson(
    Map<String, dynamic>.from(jsonDecode(jsonEncode(local.toJson())) as Map),
  );
  final source = AgentWorkspace.fromJson(
    Map<String, dynamic>.from(jsonDecode(jsonEncode(incoming.toJson())) as Map),
  );
  var imported = 0;
  var skipped = 0;
  var renamed = 0;

  final lorebookMap = <String, String>{};
  final lorebookIds = output.lorebooks.map((item) => item.id).toSet();
  final lorebookNames = output.lorebooks
      .map((item) => item.name.toLowerCase())
      .toSet();
  final lorebookIdentity = <String, TavernLorebook>{
    for (final item in output.lorebooks) _identity(item.toJson()): item,
  };
  for (final raw in source.lorebooks) {
    final item = TavernLorebook.fromJson(raw.toJson());
    final oldId = item.id;
    final duplicate = lorebookIdentity[_identity(item.toJson())];
    if (duplicate != null) {
      lorebookMap[oldId] = duplicate.id;
      skipped++;
      continue;
    }
    final originalName = item.name;
    item.name = _uniqueName(lorebookNames, item.name);
    if (item.name != originalName || lorebookIds.contains(item.id)) renamed++;
    item.id = _freshId('lorebook', item.id, lorebookIds);
    lorebookMap[oldId] = item.id;
    output.lorebooks.add(item);
    lorebookIdentity[_identity(item.toJson())] = item;
    imported++;
  }

  final characterMap = <String, String>{};
  final characterIds = output.characters.map((item) => item.id).toSet();
  final characterNames = output.characters
      .map((item) => item.name.toLowerCase())
      .toSet();
  final characterIdentity = <String, TavernCharacter>{
    for (final item in output.characters) _identity(item.toJson()): item,
  };
  for (final raw in source.characters) {
    final item = TavernCharacter.fromJson(raw.toJson());
    final oldId = item.id;
    if (item.lorebookId != null) {
      item.lorebookId = lorebookMap[item.lorebookId] ?? item.lorebookId;
    }
    final duplicate = characterIdentity[_identity(item.toJson())];
    if (duplicate != null) {
      characterMap[oldId] = duplicate.id;
      skipped++;
      continue;
    }
    final originalName = item.name;
    item.name = _uniqueName(characterNames, item.name);
    if (item.name != originalName || characterIds.contains(item.id)) renamed++;
    item.id = _freshId('character', item.id, characterIds);
    characterMap[oldId] = item.id;
    output.characters.add(item);
    characterIdentity[_identity(item.toJson())] = item;
    imported++;
  }

  final personaMap = <String, String>{};
  final personaIds = output.personas.map((item) => item.id).toSet();
  final personaNames =
      output.personas.map((item) => item.name.toLowerCase()).toSet();
  final personaIdentity = <String, TavernPersona>{
    for (final item in output.personas) _identity(item.toJson()): item,
  };
  for (final raw in source.personas) {
    final item = TavernPersona.fromJson(raw.toJson());
    final oldId = item.id;
    if (item.lorebookId != null) {
      item.lorebookId = lorebookMap[item.lorebookId] ?? item.lorebookId;
    }
    final duplicate = personaIdentity[_identity(item.toJson())];
    if (duplicate != null) {
      personaMap[oldId] = duplicate.id;
      skipped++;
      continue;
    }
    final originalName = item.name;
    item.name = _uniqueName(personaNames, item.name);
    if (item.name != originalName || personaIds.contains(item.id)) renamed++;
    item.id = _freshId('persona', item.id, personaIds);
    personaMap[oldId] = item.id;
    output.personas.add(item);
    personaIdentity[_identity(item.toJson())] = item;
    imported++;
  }

  final samplerMap = <String, String>{};
  final samplerIds = output.samplerPresets.map((item) => item.id).toSet();
  final samplerNames = output.samplerPresets
      .map((item) => item.name.toLowerCase())
      .toSet();
  final samplerIdentity = <String, TavernSamplerPreset>{
    for (final item in output.samplerPresets) _identity(item.toJson()): item,
  };
  for (final raw in source.samplerPresets) {
    final item = TavernSamplerPreset.fromJson(raw.toJson());
    final oldId = item.id;
    final duplicate = samplerIdentity[_identity(item.toJson())];
    if (duplicate != null) {
      samplerMap[oldId] = duplicate.id;
      skipped++;
      continue;
    }
    final originalName = item.name;
    item.name = _uniqueName(samplerNames, item.name);
    if (item.name != originalName || samplerIds.contains(item.id)) renamed++;
    item.id = _freshId('sampler', item.id, samplerIds);
    samplerMap[oldId] = item.id;
    output.samplerPresets.add(item);
    samplerIdentity[_identity(item.toJson())] = item;
    imported++;
  }

  final conversationMap = <String, String>{};
  final conversationIds = output.conversations.map((item) => item.id).toSet();
  final conversationNames = output.conversations
      .map((item) => item.title.toLowerCase())
      .toSet();
  final conversationIdentity = <String, AgentConversation>{
    for (final item in output.conversations) _identity(item.toJson()): item,
  };
  for (final raw in source.conversations) {
    final item = AgentConversation.fromJson(raw.toJson());
    final oldId = item.id;
    item.characterIds = item.characterIds
        .map((id) => characterMap[id] ?? id)
        .toSet()
        .toList();
    if (item.activeCharacterId != null) {
      item.activeCharacterId =
          characterMap[item.activeCharacterId] ?? item.activeCharacterId;
    }
    if (item.personaId != null) {
      item.personaId = personaMap[item.personaId] ?? item.personaId;
    }
    item.lorebookIds = item.lorebookIds
        .map((id) => lorebookMap[id] ?? id)
        .toSet()
        .toList();
    if (item.samplerPresetId != null) {
      item.samplerPresetId =
          samplerMap[item.samplerPresetId] ?? item.samplerPresetId;
    }
    for (final message in item.messages) {
      if (message.characterId != null) {
        message.characterId =
            characterMap[message.characterId] ?? message.characterId;
      }
      if (message.status == 'streaming') message.status = 'aborted';
    }
    item.status = 'idle';
    final duplicate = conversationIdentity[_identity(item.toJson())];
    if (duplicate != null) {
      conversationMap[oldId] = duplicate.id;
      skipped++;
      continue;
    }
    final originalName = item.title;
    item.title = _uniqueName(conversationNames, item.title);
    if (item.title != originalName || conversationIds.contains(item.id)) {
      renamed++;
    }
    item.id = _freshId('conversation', item.id, conversationIds);
    conversationMap[oldId] = item.id;
    output.conversations.add(item);
    conversationIdentity[_identity(item.toJson())] = item;
    imported++;
  }

  final skillIds = output.skills.map((item) => item.id).toSet();
  final skillNames = output.skills.map((item) => item.name.toLowerCase()).toSet();
  final skillIdentities =
      output.skills.map((item) => _identity(item.toJson())).toSet();
  for (final raw in source.skills) {
    final item = AgentSkill.fromJson(raw.toJson());
    if (item.builtIn || !skillIdentities.add(_identity(item.toJson()))) {
      skipped++;
      continue;
    }
    final originalName = item.name;
    item.name = _uniqueName(skillNames, item.name);
    if (item.name != originalName || skillIds.contains(item.id)) renamed++;
    item.id = _freshId('skill', item.id, skillIds);
    output.skills.add(item);
    imported++;
  }

  final memoryIds = output.memories.map((item) => item.id).toSet();
  final memoryNames =
      output.memories.map((item) => item.title.toLowerCase()).toSet();
  final memoryIdentities =
      output.memories.map((item) => _identity(item.toJson())).toSet();
  for (final raw in source.memories) {
    final item = AgentMemory.fromJson(raw.toJson());
    if (item.scope == 'conversation' && item.conversationId != null) {
      item.conversationId =
          conversationMap[item.conversationId] ?? item.conversationId;
    }
    if (!memoryIdentities.add(_identity(item.toJson()))) {
      skipped++;
      continue;
    }
    final originalName = item.title;
    item.title = _uniqueName(memoryNames, item.title);
    if (item.title != originalName || memoryIds.contains(item.id)) renamed++;
    item.id = _freshId('memory', item.id, memoryIds);
    output.memories.add(item);
    imported++;
  }

  output.conversations
      .sort((left, right) => right.updatedAt.compareTo(left.updatedAt));
  if (!output.characters
      .any((item) => item.id == output.selectedCharacterId)) {
    output.selectedCharacterId = output.characters.firstOrNull?.id;
  }
  if (!output.personas.any((item) => item.id == output.selectedPersonaId)) {
    output.selectedPersonaId = output.personas.firstOrNull?.id;
  }
  if (!output.conversations
      .any((item) => item.id == output.selectedConversationId)) {
    output.selectedConversationId = output.conversations.firstOrNull?.id;
  }
  output.updatedAt = agentNow();
  return AgentMergeResult(
    workspace: output,
    imported: imported,
    skipped: skipped,
    renamed: renamed,
  );
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull {
    final iterator = this.iterator;
    return iterator.moveNext() ? iterator.current : null;
  }
}
