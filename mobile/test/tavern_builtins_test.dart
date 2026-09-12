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
    expect(workspace.samplerPresets, hasLength(1));
    expect(workspace.samplerPresets.first.name, '夏瑾 天琴座 Beta 3.8');
    expect(workspace.lorebooks.single.entries.length, greaterThanOrEqualTo(7));
  });

  test('renamed or deleted built-in presets stay persisted after migration',
      () {
    final renamed = createLyraImageSamplerPreset()..name = '我的图像预设';
    final workspace = AgentWorkspace.fromJson({
      'version': agentWorkspaceVersion,
      'presetLibraryVersion': tavernPresetLibraryVersion,
      'characters': [createSoftwareImageCharacter().toJson()],
      'personas': [createSoftwareImagePersona().toJson()],
      'lorebooks': [createSoftwareImageLorebook().toJson()],
      'samplerPresets': [renamed.toJson()],
      'conversations': const [],
    });

    expect(workspace.samplerPresets, hasLength(1));
    expect(workspace.samplerPresets.single.name, '我的图像预设');
    expect(workspace.samplerPresets.single.id, lyraImageSamplerId);
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

    expect(
        active.map((item) => item.$2.id),
        containsAll([
          'builtin-software-image-workflow',
          'builtin-software-image-protocol',
        ]));
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
      'samplerPresets': [createLyraImageSamplerPreset().toJson()],
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

  test('migration replaces the previous preset library with Lyra', () {
    final imported = createLyraImageSamplerPreset()
      ..id = 'sampler-imported'
      ..source = 'sillytavern-json';
    final workspace = AgentWorkspace.fromJson({
      'version': agentWorkspaceVersion,
      'presetLibraryVersion': 1,
      'characters': [createSoftwareImageCharacter().toJson()],
      'personas': [createSoftwareImagePersona().toJson()],
      'lorebooks': [createSoftwareImageLorebook().toJson()],
      'samplerPresets': [
        {
          ...createLyraImageSamplerPreset().toJson(),
          'id': 'builtin-darkside-image-sampler'
        },
        {
          ...createLyraImageSamplerPreset().toJson(),
          'id': 'builtin-software-image-sampler'
        },
        imported.toJson(),
      ],
      'conversations': const [],
    });
    expect(
        workspace.samplerPresets.map((item) => item.id), [lyraImageSamplerId]);
  });
}
