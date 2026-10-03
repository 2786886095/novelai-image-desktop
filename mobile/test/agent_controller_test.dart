import 'dart:async';
import 'dart:convert';
import 'dart:io';
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
  int failures = 0;
  Completer<void>? pauseNext;
  Directory? attachmentRoot;
  @override
  Future<Directory> agentAttachmentsDirectory([String? conversationId]) async =>
      attachmentRoot ?? await super.agentAttachmentsDirectory(conversationId);

  @override
  Future<String?> getToken() async => null;

  @override
  Future<AgentWorkspace> getAgentWorkspace() async => workspace;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async {
    if (failures > 0) {
      failures--;
      throw StateError('test disk failure');
    }
    final pause = pauseNext;
    pauseNext = null;
    if (pause != null) await pause.future;
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
  @override
  Future<void> setParams(GenerateParams params) async {}
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

class _PreparedGenerationProvider extends AgentProviderClient {
  int calls = 0;

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
    calls++;
    if (calls == 1) {
      return AgentProviderTurn(toolCalls: const [
        AgentProviderToolCall(
          id: 'prepare-1',
          name: 'langbai_prepare_generation',
          arguments: {
            'positivePrompt': '1girl, rain',
            'width': 832,
            'height': 1216
          },
        )
      ], usage: AgentTokenUsage());
    }
    final toolOutput = messages.last['content'] as String;
    final id = (jsonDecode(toolOutput) as Map<String, dynamic>)['preparationId']
        as String;
    return AgentProviderTurn(toolCalls: [
      AgentProviderToolCall(
        id: 'generate-1',
        name: 'langbai_generate_image',
        arguments: {'preparationId': id},
      )
    ], usage: AgentTokenUsage());
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

class _CaptureSceneApp extends AppState {
  final requests = <Map<String, dynamic>>[];
  _CaptureSceneApp({required super.storage});
  @override
  Future<void> generate() async {
    requests.add({
      ...params.toJson(),
      'characterPrompts': extras.charCaptions.map((c) => c.toJson()).toList()
    });
    status = 'generated';
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
      'legacy Studio options migrate narrowly; invalid ids and imported authority never become new-chat defaults',
      () async {
    final source = AgentWorkspace(conversations: [
      AgentConversation(
          id: 'selected',
          title: 'legacy fixture',
          studioApprovalMode: 'auto',
          studioWebSearchEnabled: true,
          studioTemplateEnabled: false,
          studioPresetId: 'studio-complete')
    ], selectedConversationId: 'selected');
    final data =
        jsonDecode(jsonEncode(source.toJson())) as Map<String, dynamic>;
    data.remove('studioDefaults');
    final restored = AgentWorkspace.fromJson(data);
    expect(restored.studioDefaults['studioApprovalMode'], 'auto');
    expect(restored.studioDefaults['studioPresetId'], 'studio-complete');
    final storage = _ControllerStorage()..workspace = restored;
    final app = _app(storage),
        controller =
            AgentController(app: _app(storage), provider: _QueuedProvider([]));
    addTearDown(app.dispose);
    addTearDown(controller.dispose);
    await controller.load();
    final next = controller.createConversation('inherited');
    expect(next.studioApprovalMode, 'auto');
    expect(next.studioTemplateEnabled, false);
    expect(next.studioPresetId, 'studio-complete');
    expect(next.studioWebSearchEnabled, true);
    data['studioDefaults'] = {
      'studioApprovalMode': true,
      'studioWebSearchEnabled': 'true',
      'studioPresetId': 'removed',
      'characterIds': [
        'missing',
        restored.characters.first.id,
        restored.characters.first.id
      ],
      'lorebookIds': ['missing'],
      'alwaysAllowed': ['everything'],
      'apiKey': 'FIXTURE-NOT-A-REAL-KEY'
    };
    final narrow = AgentWorkspace.fromJson(data).studioDefaults;
    expect(narrow.keys, isNot(contains('alwaysAllowed')));
    expect(narrow.keys, isNot(contains('apiKey')));
    expect(narrow.keys, isNot(contains('studioApprovalMode')));
    expect(narrow.keys, isNot(contains('studioWebSearchEnabled')));
    expect(narrow.keys, isNot(contains('studioPresetId')));
    expect(narrow['characterIds'], [restored.characters.first.id]);
    expect(narrow['lorebookIds'], isEmpty);
  });
  test(
      'archive/delete storage failure restores chat and files; pending index commit locks chat identity',
      () async {
    final root =
        await Directory.systemTemp.createTemp('studio-delete-transaction-');
    addTearDown(() => root.delete(recursive: true));
    final storage = _ControllerStorage()..attachmentRoot = root;
    final app = _app(storage), provider = _QueuedProvider([]);
    final controller = AgentController(app: app, provider: provider);
    addTearDown(app.dispose);
    addTearDown(controller.dispose);
    await controller.load();
    final selected = controller.selectedConversation!.id;
    final attachment = File('${root.path}/$selected/owned.txt');
    await attachment.parent.create(recursive: true);
    await attachment.writeAsString('PRISTINE FIXTURE');
    controller.workspace.memories.add(AgentMemory(
        id: 'm',
        title: 'fixture',
        content: 'owned',
        scope: 'conversation',
        conversationId: selected));
    await controller.saveWorkspace();
    storage.failures = 1;
    await expectLater(
        controller.setConversationArchived(selected, true), throwsStateError);
    expect(controller.selectedConversation!.id, selected);
    expect(controller.selectedConversation!.archivedAt, isNull);
    storage.failures = 1;
    await expectLater(
        controller.deleteConversation(selected), throwsStateError);
    expect(
        controller.workspace.conversations.any((c) => c.id == selected), true);
    expect(controller.workspace.memories.any((m) => m.id == 'm'), true);
    expect(await attachment.readAsString(), 'PRISTINE FIXTURE');
    expect(controller.studioOptionsSaving, false);
    final gate = Completer<void>();
    storage.pauseNext = gate;
    final deleting = controller.deleteConversation(selected);
    expect(controller.studioOptionsSaving, true);
    expect(() => controller.createConversation('blocked'), throwsStateError);
    await controller.sendStudio('must not race');
    expect(provider.calls, 0);
    expect(await attachment.exists(), true);
    gate.complete();
    await deleting;
    expect(
        controller.workspace.conversations.any((c) => c.id == selected), false);
    expect(controller.workspace.memories.any((m) => m.id == 'm'), false);
    expect(await attachment.exists(), false);
    expect(controller.selectedConversation!.archivedAt, isNull);
    expect(controller.studioOptionsSaving, false);
  });
  test(
      'Studio options survive new chats and serialized restart; write failure rolls back; in-flight save locks chat identity',
      () async {
    final storage = _ControllerStorage(), app = _app(_ControllerStorage());
    final controller =
        AgentController(app: _app(storage), provider: _QueuedProvider([]));
    addTearDown(controller.dispose);
    addTearDown(app.dispose);
    await controller.load();
    await controller.setStudioOptions(
        approvalMode: 'auto',
        webSearchEnabled: true,
        templateEnabled: false,
        presetId: 'studio-complete');
    final chat = controller.createConversation('inherits');
    await controller.saveWorkspace();
    expect(chat.studioApprovalMode, 'auto');
    expect(chat.studioWebSearchEnabled, true);
    expect(chat.studioTemplateEnabled, false);
    expect(chat.studioPresetId, 'studio-complete');
    final restoredStorage = _ControllerStorage()
      ..workspace = AgentWorkspace.fromJson(
          jsonDecode(jsonEncode(storage.workspace.toJson())));
    final restored = AgentController(
        app: _app(restoredStorage), provider: _QueuedProvider([]));
    addTearDown(restored.dispose);
    await restored.load();
    final next = restored.createConversation('after restart');
    expect(next.studioApprovalMode, 'auto');
    expect(next.studioPresetId, 'studio-complete');
    storage.failures = 1;
    final before = jsonEncode(controller.workspace.studioDefaults);
    await expectLater(
        controller.setStudioOptions(
            approvalMode: 'confirm', presetId: 'dsh-infinite-gen-4'),
        throwsStateError);
    expect(chat.studioApprovalMode, 'auto');
    expect(chat.studioPresetId, 'studio-complete');
    expect(jsonEncode(controller.workspace.studioDefaults), before);
    expect(controller.studioOptionsSaving, false);
    final gate = Completer<void>();
    storage.pauseNext = gate;
    final change = controller.setStudioOptions(webSearchEnabled: false);
    expect(controller.studioOptionsSaving, true);
    expect(() => controller.createConversation('not while writing'),
        throwsStateError);
    gate.complete();
    await change;
    expect(controller.studioOptionsSaving, false);
  });

  Future<(AgentController, _ControllerStorage, _CaptureSceneApp)>
      preparedScene() async {
    final fixture = jsonDecode(
        File('../shared/tavern-scene-fixtures.json').readAsStringSync());
    final storage = _ControllerStorage();
    final app = _CaptureSceneApp(storage: storage)
      ..settings = _app(storage).settings;
    final controller = AgentController(
        app: app,
        provider: _QueuedProvider([
          AgentProviderTurn(
              content: '<langbai-image>${jsonEncode({
                    'scene': fixture['scene']
                  })}</langbai-image>',
              usage: AgentTokenUsage())
        ]));
    addTearDown(controller.dispose);
    await controller.load();
    await controller.updateActiveCharacterVisual(
        model: 'nai-diffusion-5-full',
        stylePrompt: '',
        negativePrompt: '',
        count: 1);
    await controller.setGenerationMode('confirm');
    await controller.send('Two adult hikers');
    return (controller, storage, app);
  }

  test(
      'preflight and final persistence failures release generation state and allow retry',
      () async {
    final (controller, storage, app) = await preparedScene();
    final conversation = controller.selectedConversation!;
    final message = conversation.messages.last;
    storage.failures = 2;
    await controller.generateTavernImage(message.id);
    expect(app.requests, isEmpty);
    expect(conversation.status, 'idle');
    expect(message.imageProposal!.status, 'error');
    expect(message.tools.last.status, 'error');
    expect(controller.error, contains('test disk failure'));
    await controller.generateTavernImage(message.id);
    expect(app.requests, hasLength(1));
    // This capture-only fixture has no image file; retry reaches the tool and settles.
    expect(message.imageProposal!.error, isNot(contains('test disk failure')));
    expect(conversation.status, 'idle');
  });
  test('scene save failure rolls back; saved scene rejects stale overwrite',
      () async {
    final (controller, storage, _) = await preparedScene();
    final conversation = controller.selectedConversation!;
    final message = conversation.messages.last,
        proposal = conversation.messages.last.imageProposal!;
    final expected =
        Map<String, dynamic>.from(jsonDecode(jsonEncode(proposal.scene)));
    final updated = Map<String, dynamic>.from(jsonDecode(jsonEncode(expected)))
      ..['revision'] = 1;
    updated['facts'][1]['prompt'] = 'black hair';
    final oldPrompt = proposal.positivePrompt;
    storage.failures = 1;
    await expectLater(
        controller.saveTavernScene(
            conversation.id, message.id, expected, updated),
        throwsStateError);
    expect(proposal.scene, expected);
    expect(proposal.positivePrompt, oldPrompt);
    await controller.saveTavernScene(
        conversation.id, message.id, expected, updated);
    expect(proposal.scene, updated);
    await expectLater(
        controller.saveTavernScene(
            conversation.id, message.id, expected, updated),
        throwsStateError);
    expect(proposal.scene, updated);
  });
  test(
      'deferred workspace persistence surfaces failures without an unhandled future',
      () async {
    final (controller, storage, _) = await preparedScene();
    storage.failures = 1;
    controller.createConversation('second');
    await Future<void>.delayed(const Duration(milliseconds: 250));
    expect(controller.error, contains('test disk failure'));
  });
  test('scene saving blocks generation and duplicate commit until durable',
      () async {
    final (controller, storage, app) = await preparedScene();
    final conversation = controller.selectedConversation!;
    final message = conversation.messages.last;
    final expected = Map<String, dynamic>.from(
        jsonDecode(jsonEncode(message.imageProposal!.scene)));
    final updated = Map<String, dynamic>.from(jsonDecode(jsonEncode(expected)))
      ..['revision'] = 1;
    final pause = Completer<void>();
    storage.pauseNext = pause;
    final save = controller.saveTavernScene(
        conversation.id, message.id, expected, updated);
    await controller.generateTavernImage(message.id);
    expect(app.requests, isEmpty);
    await expectLater(
        controller.saveTavernScene(
            conversation.id, message.id, updated, updated),
        throwsStateError);
    pause.complete();
    await save;
    await controller.generateTavernImage(message.id);
    expect(app.requests, hasLength(1));
  });

  for (final issue in [null, 'limit', 'incomplete', 'failed']) {
    test('empty or incomplete reply stays recoverable: $issue', () async {
      final storage = _ControllerStorage();
      final app = _CaptureSceneApp(storage: storage)
        ..settings = _app(storage).settings;
      final provider = _QueuedProvider([
        AgentProviderTurn(
            content: '',
            reasoning: 'thinking only',
            issue: issue,
            usage: AgentTokenUsage()),
        AgentProviderTurn(content: '正常回复', usage: AgentTokenUsage()),
      ]);
      final controller = AgentController(app: app, provider: provider);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.setGenerationMode('auto');
      await controller.send('画两名成年徒步者');
      expect(controller.selectedConversation!.messages.last.status, 'error');
      expect(controller.selectedConversation!.messages.last.reasoning,
          'thinking only');
      expect(controller.error, isNotEmpty);
      expect(controller.sending, false);
      expect(app.requests, isEmpty);
      await controller.send('你好');
      expect(controller.selectedConversation!.messages.last.status, 'complete');
    });
  }

  for (final mode in ['confirm', 'auto']) {
    test('bound native request survives persistence in $mode mode', () async {
      final fixture = jsonDecode(
          File('../shared/tavern-scene-fixtures.json').readAsStringSync());
      final storage = _ControllerStorage();
      final app = _CaptureSceneApp(storage: storage)
        ..settings = _app(storage).settings;
      final provider = _QueuedProvider([
        AgentProviderTurn(
            content: '<langbai-image>${jsonEncode({
                  'scene': fixture['scene']
                })}</langbai-image>',
            usage: AgentTokenUsage())
      ]);
      final controller = AgentController(app: app, provider: provider);
      addTearDown(controller.dispose);
      await controller.load();
      await controller.updateActiveCharacterVisual(
          model: 'nai-diffusion-5-full',
          stylePrompt: '',
          negativePrompt: '',
          count: 1);
      await controller.setGenerationMode(mode);
      final captured = app;
      await controller.send('A 和 B 穿各自的外套，A 用右手搭住 B 的左肩');
      final message = controller.selectedConversation!.messages.last;
      expect(message.imageProposal!.scene, fixture['scene']);
      storage.workspace = AgentWorkspace.fromJson(
          jsonDecode(jsonEncode(storage.workspace.toJson())));
      expect(
          storage
              .workspace.conversations.first.messages.last.imageProposal!.scene,
          fixture['scene']);
      if (mode == 'confirm') await controller.generateTavernImage(message.id);
      expect(captured.requests, hasLength(1));
      final args = captured.requests.single;
      expect(args['characterPrompts'], hasLength(2));
      expect(args['characterPrompts'][0]['prompt'],
          contains('Wearing coat, red, leather.'));
      expect(args['characterPrompts'][1]['prompt'],
          contains('Wearing jacket, blue.'));
      expect(
          args['characterPrompts'][1]['prompt'], isNot(contains('red hair')));
      expect(args['negativePrompt'], '');
      expect(args['stylePrompt'], '');
    });
  }

  for (final negative in ['', '   ', 'custom negative']) {
    test('image proposal preserves explicit user negative "$negative"',
        () async {
      final storage = _ControllerStorage();
      final app = _app(storage);
      app.params.negativePrompt = 'generation-page-must-not-leak';
      final provider = _QueuedProvider([
        AgentProviderTurn(
          content:
              '<langbai-image>{"positivePrompt":"blue coat, park","count":1}</langbai-image>',
          usage: AgentTokenUsage(input: 20, output: 20, total: 40),
        ),
      ]);
      final controller = AgentController(app: app, provider: provider);
      addTearDown(controller.dispose);
      await controller.load();
      controller.activeCharacter!.visual.negativePrompt = negative;
      controller.activeCharacter!.visual.stylePrompt = '';
      await controller.send('Draw a character in a blue coat in a park');
      final proposal =
          controller.selectedConversation!.messages.last.imageProposal!;
      expect(proposal.negativePrompt, negative);
      expect(proposal.stylePrompt, '');
      expect(controller.activeCharacter!.visual.negativePrompt, negative);
    });
  }

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
    expect(controller.selectedConversation!.status, 'error');
    expect(controller.selectedConversation!.messages.last.status, 'error');
    expect(controller.error, isNotEmpty);
    expect(controller.selectedConversation!.messages.last.tools, isEmpty);
    expect(controller.pendingPermission, isNull);
  });

  test('studio loop executes only an allowlisted read tool and continues',
      () async {
    final storage = _ControllerStorage();
    final provider = _QueuedProvider([
      AgentProviderTurn(toolCalls: const [
        AgentProviderToolCall(
          id: 'state-1',
          name: 'langbai_get_generation_state',
          arguments: {},
        )
      ], usage: AgentTokenUsage(input: 10, output: 4, total: 14)),
      AgentProviderTurn(
          content: '当前配置已读取。',
          usage: AgentTokenUsage(input: 15, output: 7, total: 22)),
    ]);
    final controller = AgentController(app: _app(storage), provider: provider);
    addTearDown(controller.dispose);
    await controller.load();
    await controller.sendStudio('查看当前生图设置');
    expect(provider.calls, 2);
    expect(controller.selectedConversation!.messages.last.tools.single.name,
        'langbai_get_generation_state');
    expect(controller.selectedConversation!.messages.last.status, 'complete');
    expect(provider.requests[1].last['role'], 'tool');
  });

  test('studio loop asks before mutation and reject leaves prompt intact',
      () async {
    final storage = _ControllerStorage();
    final app = _app(storage);
    app.params.positivePrompt = 'original';
    final provider = _QueuedProvider([
      AgentProviderTurn(toolCalls: const [
        AgentProviderToolCall(
          id: 'apply-1',
          name: 'langbai_apply_prompt',
          arguments: {'positivePrompt': 'changed'},
        )
      ], usage: AgentTokenUsage(input: 10, output: 4, total: 14)),
    ]);
    final controller = AgentController(app: app, provider: provider);
    addTearDown(controller.dispose);
    await controller.load();
    await controller.setStudioOptions(approvalMode: 'confirm');
    final running = controller.sendStudio('替换提示词');
    for (var i = 0; i < 100 && controller.pendingPermission == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    expect(controller.pendingPermission?.tool, 'langbai_apply_prompt');
    expect(app.params.positivePrompt, 'original');
    await controller.respondPermission('reject');
    await running;
    expect(app.params.positivePrompt, 'original');
    expect(controller.selectedConversation!.messages.last.tools.single.status,
        'denied');
  });

  test(
      'studio generation without a prepared ID never reaches approval or billing',
      () async {
    final storage = _ControllerStorage();
    final app = _CaptureSceneApp(storage: storage)
      ..settings = _app(storage).settings;
    final provider = _QueuedProvider([
      AgentProviderTurn(toolCalls: const [
        AgentProviderToolCall(
          id: 'unprepared-1',
          name: 'langbai_generate_image',
          arguments: {'positivePrompt': '1girl'},
        )
      ], usage: AgentTokenUsage()),
      AgentProviderTurn(content: '需要先准备生图。', usage: AgentTokenUsage()),
    ]);
    final controller = AgentController(app: app, provider: provider);
    addTearDown(controller.dispose);
    await controller.load();
    await controller.sendStudio('画一张图');
    expect(app.requests, isEmpty);
    expect(controller.pendingPermission, isNull);
    expect(controller.selectedConversation!.messages.last.tools.single.status,
        'error');
    expect(provider.calls, 2);
  });

  test(
      'studio prepared generation shows frozen preview and rejection spends nothing',
      () async {
    final storage = _ControllerStorage();
    final app = _CaptureSceneApp(storage: storage)
      ..settings = _app(storage).settings;
    final provider = _PreparedGenerationProvider();
    final controller = AgentController(app: app, provider: provider);
    addTearDown(controller.dispose);
    await controller.load();
    await controller.setStudioOptions(approvalMode: 'confirm');
    final running = controller.sendStudio('画一张竖图');
    for (var i = 0; i < 100 && controller.pendingPermission == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    final pending = controller.pendingPermission;
    expect(pending?.tool, 'langbai_generate_image');
    expect(pending?.arguments['positivePrompt'], '1girl, rain');
    expect(pending?.arguments['width'], 832);
    expect(pending?.arguments['estimateSource'], isNotNull);
    expect(app.requests, isEmpty);
    await controller.respondPermission('reject');
    await running;
    expect(app.requests, isEmpty);
    expect(controller.selectedConversation!.messages.last.tools.last.status,
        'denied');
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

    await controller.updateActiveCharacterVisual(
      model: 'nai-diffusion-5-full',
      width: 1088,
      height: 1920,
      steps: 31,
      scale: 4.5,
      sampler: 'k_euler_ancestral',
      count: 3,
    );

    await controller.send('画出当前场景');

    final response = controller.selectedConversation!.messages.last;
    expect(response.content, '*她站在雨中。*');
    expect(response.imageProposal, isNotNull);
    expect(response.imageProposal!.positivePrompt, '1girl, rain');
    expect((response.imageProposal!.width, response.imageProposal!.height),
        (1088, 1920));
    expect((response.imageProposal!.steps, response.imageProposal!.scale),
        (31, 4.5));
    expect(response.imageProposal!.count, 3);
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

    // This test explicitly covers legacy flat-image continuity; V4+ first
    // scenes have separate repair/structured integration tests above.
    await controller.updateActiveCharacterVisual(model: 'nai-diffusion-3');
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
  test('first flat reply is repaired once before auto image generation',
      () async {
    final fixture = jsonDecode(
        File('../shared/tavern-scene-fixtures.json').readAsStringSync());
    final storage = _ControllerStorage();
    final app = _CaptureSceneApp(storage: storage)
      ..settings = _app(storage).settings;
    final provider = _QueuedProvider([
      AgentProviderTurn(
          content:
              '<langbai-image>{"positivePrompt":"two adults","width":64}</langbai-image>',
          usage: AgentTokenUsage()),
      AgentProviderTurn(
          content: '<langbai-image>${jsonEncode({
                'scene': fixture['scene'],
                'width': 64,
                'stylePrompt': 'injected'
              })}</langbai-image>',
          usage: AgentTokenUsage()),
    ]);
    final controller = AgentController(app: app, provider: provider);
    addTearDown(controller.dispose);
    await controller.load();
    await controller.updateActiveCharacterVisual(
        model: 'nai-diffusion-5-full',
        width: 832,
        height: 1216,
        stylePrompt: '',
        negativePrompt: '',
        count: 1);
    await controller.setGenerationMode('auto');
    await controller.send('画两名成年徒步者，各自穿自己的外套');
    final p = controller.selectedConversation!.messages.last.imageProposal!;
    expect(provider.calls, 2);
    expect(p.scene, fixture['scene']);
    expect(p.continuity?['repairStatus'], 'repaired');
    expect(app.requests, hasLength(1));
    expect(app.requests.first['characterPrompts'], hasLength(2));
    expect(app.requests.first['width'], 832);
  });
  test('second flat reply stays pending and never calls image generation',
      () async {
    final storage = _ControllerStorage();
    final app = _CaptureSceneApp(storage: storage)
      ..settings = _app(storage).settings;
    final provider = _QueuedProvider(List.generate(
        2,
        (_) => AgentProviderTurn(
            content:
                '<langbai-image>{"positivePrompt":"two adults"}</langbai-image>',
            usage: AgentTokenUsage())));
    final controller = AgentController(app: app, provider: provider);
    addTearDown(controller.dispose);
    await controller.load();
    await controller.updateActiveCharacterVisual(model: 'nai-diffusion-5-full');
    await controller.setGenerationMode('auto');
    await controller.send('画两名成年人');
    expect(provider.calls, 2);
    expect(app.requests, isEmpty);
    expect(
        controller.selectedConversation!.messages.last.imageProposal!
            .continuity?['bindingError'],
        'SCENE_REQUIRED');
  });
}
