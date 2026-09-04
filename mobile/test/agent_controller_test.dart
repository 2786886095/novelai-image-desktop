import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_provider.dart';
import 'package:novelai_mobile/agent/tavern_builtins.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _ControllerStorage extends Storage {
  AgentWorkspace workspace = AgentWorkspace();
  Set<String> permissions = <String>{};

  @override
  Future<AgentWorkspace> getAgentWorkspace() async => workspace;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {
    workspace = value;
  }

  @override
  Future<Set<String>> getAgentAlwaysAllowedTools() async => permissions;
  @override
  Future<void> setAgentAlwaysAllowedTools(Set<String> value) async {
    permissions = Set<String>.from(value);
  }

  @override
  Future<String?> getAgentApiKey() async => 'agent-test-key';
  @override
  Future<void> setAgentApiKey(String value) async {}
  @override
  Future<void> setSettings(AppSettings settings) async {}
}

class _QueuedProvider extends AgentProviderClient {
  final List<AgentProviderTurn> turns;
  int calls = 0;
  final List<List<Map<String, dynamic>>> requests = [];
  _QueuedProvider(this.turns);

  @override
  Future<AgentProviderTurn> complete({
    required AppSettings settings,
    required String apiKey,
    required List<Map<String, dynamic>> messages,
    required List<Map<String, dynamic>> tools,
    required void Function(String delta) onDelta,
    bool toolsEnabled = true,
    Map<String, dynamic>? generationConfig,
  }) async {
    requests.add(messages);
    final turn = turns[calls++];
    if (turn.content.isNotEmpty) onDelta(turn.content);
    return turn;
  }
}

AppState _app(_ControllerStorage storage) => AppState(storage: storage)
  ..settings = AppSettings(
    agentApiBaseUrl: 'https://provider.invalid/v1',
    agentApiModel: 'test-model',
    agentContextWindow: 8192,
    agentAutoCompact: true,
    agentAutoCompactThreshold: .5,
  );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('automatically compacts after a turn crosses the danger threshold',
      () async {
    final storage = _ControllerStorage();
    final provider = _QueuedProvider([
      AgentProviderTurn(
        content: '完成。',
        usage: AgentTokenUsage(input: 5000, output: 20, total: 5020),
      ),
      AgentProviderTurn(
        content: '已确认目标：生成电影光照角色图。',
        usage: AgentTokenUsage(input: 800, output: 30, total: 830),
      ),
    ]);
    final controller = AgentController(app: _app(storage), provider: provider);
    addTearDown(controller.dispose);
    await controller.load();

    await controller.send('生成电影光照角色图');

    final conversation = controller.selectedConversation!;
    expect(provider.calls, 2);
    expect(conversation.compactCount, 1);
    expect(conversation.lastSummary, contains('已确认目标'));
    expect(conversation.context.danger, isFalse);
  });

  test('roleplay runtime ignores legacy tool calls and never mutates settings',
      () async {
    final storage = _ControllerStorage();
    final app = _app(storage);
    app.params.positivePrompt = 'original prompt';
    final provider = _QueuedProvider([
      AgentProviderTurn(
        toolCalls: const [
          AgentProviderToolCall(
            id: 'apply-call',
            name: 'langbai_apply_prompt',
            arguments: {'positivePrompt': 'must not apply'},
          ),
        ],
        usage: AgentTokenUsage(input: 20, output: 5, total: 25),
      ),
    ]);
    final controller = AgentController(app: app, provider: provider);
    addTearDown(controller.dispose);
    await controller.load();

    await controller.send('继续故事');

    expect(app.params.positivePrompt, 'original prompt');
    expect(controller.selectedConversation!.status, 'idle');
    expect(controller.selectedConversation!.messages.last.status, 'complete');
    expect(controller.selectedConversation!.messages.last.tools, isEmpty);
    expect(controller.pendingPermission, isNull);
  });

  test('image directive becomes a confirmation proposal without generating',
      () async {
    final storage = _ControllerStorage();
    final provider = _QueuedProvider([
      AgentProviderTurn(
        content:
            '*她站在雨中。*<langbai-image>{"positivePrompt":"1girl, rain","width":832,"height":1216,"count":1}</langbai-image>',
        usage: AgentTokenUsage(input: 20, output: 30, total: 50),
      ),
    ]);
    final controller = AgentController(app: _app(storage), provider: provider);
    addTearDown(controller.dispose);
    await controller.load();

    await controller.send('画出当前场景');

    final response = controller.selectedConversation!.messages.last;
    expect(response.content, '*她站在雨中。*');
    expect(response.imageProposal, isNotNull);
    expect(response.imageProposal!.positivePrompt, '1girl, rain');
    expect(response.imageProposal!.status, 'pending');
    expect(response.tools, isEmpty);
  });

  test('custom lorebooks can be deleted while the built-in is protected',
      () async {
    final storage = _ControllerStorage();
    final controller = AgentController(app: _app(storage));
    addTearDown(controller.dispose);
    await controller.load();

    expect(await controller.deleteLorebook(softwareImageLorebookId), isFalse);
    expect(
        controller.workspace.lorebooks
            .any((item) => item.id == softwareImageLorebookId),
        isTrue);

    final custom = await controller.createLorebook('可删除世界书');
    controller.activeCharacter!.lorebookId = custom.id;
    controller.activePersona!.lorebookId = custom.id;
    await controller.saveWorkspace();

    expect(await controller.deleteLorebook(custom.id), isTrue);
    expect(controller.workspace.lorebooks.any((item) => item.id == custom.id),
        isFalse);
    expect(controller.selectedConversation!.lorebookIds,
        isNot(contains(custom.id)));
    expect(controller.activeCharacter!.lorebookId, isNot(custom.id));
    expect(controller.activePersona!.lorebookId, isNot(custom.id));
  });

  test('image parameters can be edited and persist on the active character',
      () async {
    final storage = _ControllerStorage();
    final controller = AgentController(app: _app(storage));
    addTearDown(controller.dispose);
    await controller.load();

    await controller.updateActiveCharacterVisual(
      width: 832,
      height: 1216,
      steps: 30,
      scale: 5.5,
      count: 2,
      sampler: 'k_euler',
    );

    final visual = controller.activeCharacter!.visual;
    expect((visual.width, visual.height), (832, 1216));
    expect(visual.steps, 30);
    expect(visual.scale, 5.5);
    expect(visual.count, 2);
    expect(visual.sampler, 'k_euler');
    expect(storage.workspace.characters.first.visual.width, 832);
  });

  test('the next chat turn receives the last image plan for size-only edits',
      () async {
    final storage = _ControllerStorage();
    final provider = _QueuedProvider([
      AgentProviderTurn(
        content:
            '方案已整理。<langbai-image>{"positivePrompt":"1girl, rain","width":1024,"height":1024,"count":1}</langbai-image>',
        usage: AgentTokenUsage(),
      ),
      AgentProviderTurn(content: '已调整为竖图。', usage: AgentTokenUsage()),
    ]);
    final controller = AgentController(app: _app(storage), provider: provider);
    addTearDown(controller.dispose);
    await controller.load();

    await controller.send('画一张雨中少女');
    await controller.send('改成 832×1216');

    final secondRequest = provider.requests[1];
    final assistantContext = secondRequest
        .where((message) => message['role'] == 'assistant')
        .map((message) => '${message['content']}')
        .join('\n');
    expect(assistantContext, contains('<langbai-current-image>'));
    expect(assistantContext, contains('"positivePrompt":"1girl, rain"'));
    expect(secondRequest.last['content'], '改成 832×1216');
  });
}
