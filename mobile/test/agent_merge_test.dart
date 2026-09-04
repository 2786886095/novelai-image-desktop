import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_merge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';

AgentConversation conversation(
  String id,
  String title,
  String content, {
  String path = '',
}) =>
    AgentConversation(
      id: id,
      title: title,
      messages: [
        AgentMessage(
          id: '$id-message',
          role: 'user',
          content: content,
          attachments: path.isEmpty
              ? []
              : [
                  AgentAttachment(
                    id: '$id-file',
                    name: 'reference.png',
                    mime: 'image/png',
                    size: 3,
                    kind: 'image',
                    filePath: path,
                  ),
                ],
        ),
      ],
    );

void main() {
  test('never overwrites a conflicting conversation', () {
    final local = AgentWorkspace(
      conversations: [conversation('same-id', 'Project', 'local')],
    );
    final incoming = AgentWorkspace(
      conversations: [conversation('same-id', 'Project', 'incoming')],
      memories: [
        AgentMemory(
          id: 'memory',
          title: 'Scoped',
          content: 'keep composition',
          scope: 'conversation',
          conversationId: 'same-id',
        ),
      ],
    );

    final result = mergeAgentWorkspaces(local, incoming);
    expect(result.workspace.conversations, hasLength(2));
    final imported = result.workspace.conversations
        .firstWhere((item) => item.messages.first.content == 'incoming');
    expect(imported.id, isNot('same-id'));
    expect(imported.title, 'Project (1)');
    expect(result.workspace.memories.single.conversationId, imported.id);
    expect(result.renamed, greaterThanOrEqualTo(1));
  });

  test('device-local attachment paths do not create duplicates', () {
    final root = Directory.systemTemp.createTempSync('agent-merge-');
    addTearDown(() => root.deleteSync(recursive: true));
    final local = AgentWorkspace(
      conversations: [
        conversation('one', 'Chat', 'same', path: '${root.path}/a.png'),
      ],
    );
    final incoming = AgentWorkspace(
      conversations: [
        conversation('two', 'Chat', 'same', path: '${root.path}/b.png'),
      ],
    );

    final result = mergeAgentWorkspaces(local, incoming);
    expect(result.workspace.conversations, hasLength(1));
    expect(result.skipped, greaterThanOrEqualTo(1));
  });

  test('duplicate conversations remap scoped memories idempotently', () {
    final local = AgentWorkspace(
      conversations: [conversation('local-chat', 'Chat', 'same')],
    );
    final incoming = AgentWorkspace(
      conversations: [conversation('remote-chat', 'Chat', 'same')],
      memories: [
        AgentMemory(
          id: 'remote-memory',
          title: 'Composition',
          content: 'Prefer centered portraits',
          scope: 'conversation',
          conversationId: 'remote-chat',
        ),
      ],
    );

    final first = mergeAgentWorkspaces(local, incoming);
    expect(first.workspace.conversations, hasLength(1));
    expect(first.workspace.memories.single.conversationId, 'local-chat');

    final second = mergeAgentWorkspaces(first.workspace, incoming);
    expect(second.workspace.conversations, hasLength(1));
    expect(second.workspace.memories, hasLength(1));
    expect(second.skipped, greaterThanOrEqualTo(2));
  });

  test('merge remaps character, persona, lorebook and sampler references', () {
    final character = TavernCharacter.blank('Alice');
    final persona = TavernPersona(name: 'Traveler');
    final lorebook = TavernLorebook(name: 'City');
    final sampler = TavernSamplerPreset(name: 'Story');
    final chat = AgentConversation(
      id: 'chat',
      title: 'Roleplay',
      characterIds: [character.id],
      activeCharacterId: character.id,
      personaId: persona.id,
      lorebookIds: [lorebook.id],
      samplerPresetId: sampler.id,
    );
    final incoming = AgentWorkspace(
      characters: [character],
      personas: [persona],
      lorebooks: [lorebook],
      samplerPresets: [sampler],
      conversations: [chat],
    );
    final local = AgentWorkspace(
      characters: [TavernCharacter.blank('Alice')],
      personas: [TavernPersona(name: 'Traveler')],
      lorebooks: [TavernLorebook(name: 'City')],
      samplerPresets: [TavernSamplerPreset(name: 'Story')],
    );

    final result = mergeAgentWorkspaces(local, incoming);
    final importedChat = result.workspace.conversations.single;
    expect(result.workspace.characters.any(
        (item) => item.id == importedChat.activeCharacterId), isTrue);
    expect(result.workspace.personas.any(
        (item) => item.id == importedChat.personaId), isTrue);
    expect(result.workspace.lorebooks.any(
        (item) => importedChat.lorebookIds.contains(item.id)), isTrue);
    expect(result.workspace.samplerPresets.any(
        (item) => item.id == importedChat.samplerPresetId), isTrue);
  });
}
