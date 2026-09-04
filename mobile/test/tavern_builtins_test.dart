import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/tavern_builtins.dart';
import 'package:novelai_mobile/agent/tavern_prompt.dart';

void main() {
  test('fresh workspace includes the software intelligent image kit', () {
    final workspace = AgentWorkspace();

    expect(workspace.version, agentWorkspaceVersion);
    expect(workspace.characters.single.name, '软件智能生图');
    expect(
        workspace.characters.single.lorebookId, workspace.lorebooks.single.id);
    expect(workspace.personas.single.lorebookId, workspace.lorebooks.single.id);
    expect(workspace.samplerPresets.single.name, '软件智能生图');
    expect(workspace.lorebooks.single.entries.length, greaterThanOrEqualTo(7));
  });

  test('unreleased legacy Agent workspace is reset instead of migrated', () {
    final workspace = AgentWorkspace.fromJson({
      'version': 2,
      'characters': [
        {'id': 'legacy', 'name': '旧 Agent'}
      ],
      'conversations': [
        {'id': 'legacy-chat', 'title': '旧对话'}
      ],
    });

    expect(workspace.characters.single.name, '软件智能生图');
    expect(workspace.conversations, isEmpty);
  });

  test('built-in lorebook activates the image workflow contract', () {
    final book = createSoftwareImageLorebook();
    final active = activeTavernLorebookEntries([book], const []);

    expect(active.length, 2);
    expect(
        active.map((item) => item.$2.comment), containsAll(['核心工作流', '生图协议']));
  });

  test('workspace restores protected built-ins without losing runtime choices',
      () {
    final workspace = AgentWorkspace.fromJson({
      'version': agentWorkspaceVersion,
      'characters': [
        {
          ...createSoftwareImageCharacter().toJson(),
          'name': '被误改的名称',
          'description': '被误改的描述',
          'visual': {
            ...createSoftwareImageCharacter().visual.toJson(),
            'width': 832,
            'height': 1216,
          },
        },
      ],
      'personas': [createSoftwareImagePersona().toJson()],
      'lorebooks': [
        {
          ...createSoftwareImageLorebook().toJson(),
          'name': '被误改的世界书',
        },
      ],
      'samplerPresets': [createSoftwareImageSamplerPreset().toJson()],
      'conversations': const [],
    });

    final character = workspace.characters
        .singleWhere((item) => item.id == softwareImageCharacterId);
    final lorebook = workspace.lorebooks
        .singleWhere((item) => item.id == softwareImageLorebookId);
    expect(character.name, '软件智能生图');
    expect(character.description, contains('视觉导演'));
    expect(character.visual.width, 832);
    expect(character.visual.height, 1216);
    expect(lorebook.name, '软件智能生图 · 世界书');
  });
}
