import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_provider.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/template_tools.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _MemorySettings extends Storage {
  AppSettings saved = AppSettings();
  AgentWorkspace workspace = AgentWorkspace();
  bool failNextSave = false;
  @override
  Future<String?> getConvertKey() async => 'fixture-local-only';
  @override
  Future<String?> getAgentApiKey() async => 'fixture-local-only';
  @override
  Future<Set<String>> getAgentAlwaysAllowedTools() async => {};
  @override
  Future<void> setAgentAlwaysAllowedTools(Set<String> value) async {}

  @override
  Future<AppSettings> getSettings() async =>
      AppSettings.fromJson(jsonDecode(jsonEncode(saved.toJson())));
  @override
  Future<void> setSettings(AppSettings next) async {
    if (failNextSave) {
      failNextSave = false;
      throw StateError('fixture disk failure');
    }
    saved = AppSettings.fromJson(jsonDecode(jsonEncode(next.toJson())));
  }
  @override
  Future<AgentWorkspace> getAgentWorkspace() async => workspace;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace next) async {
    workspace = next;
  }
}

class _CaptureEditApi extends NaiApi {
  int calls = 0;
  String? body, overlay, kind, version;
  ReversePromptMode? mode;
  @override
  Future<AiTextResult> assistPrompt({required AppSettings settings,
      required String apiKey, required String currentPrompt,
      required String instruction, required String kind,
      required ReversePromptMode mode, required String templateVersion,
      required String conversionTemplate}) async {
    calls++;
    body = conversionTemplate;
    overlay = kind == 'optimize' ? settings.promptOptimizeTemplate
        : settings.promptAssistantTemplate;
    this.kind = kind;
    this.mode = mode;
    version = templateVersion;
    return const AiTextResult(ok: true, message: 'fixture', text: 'revised prompt');
  }
}

class _EditProvider extends AgentProviderClient {
  int calls = 0;
  @override
  Future<AgentProviderTurn> complete({required AppSettings settings,
      required String apiKey, required List<Map<String, dynamic>> messages,
      required List<Map<String, dynamic>> tools,
      required void Function(String delta) onDelta, bool toolsEnabled = true,
      Map<String, dynamic>? generationConfig}) async {
    calls++;
    if (calls == 1) {
      return AgentProviderTurn(usage: AgentTokenUsage(), toolCalls: const [
        AgentProviderToolCall(id: 'edit-1', name: 'langbai_edit_prompt',
          arguments: {'kind': 'optimize', 'currentPrompt': 'blue umbrella',
            'mode': 'tags', 'templateVersion': 'v5'})]);
    }
    return AgentProviderTurn(content: 'done', usage: AgentTokenUsage());
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('four derived Agent reads equal the runtime resolver', () async {
    final storage = _MemorySettings();
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    app.promptTemplates = await PromptTemplateLibrary.load();
    const mixed = '保留蓝伞、左手、前景遮挡 AUDIT_SOURCE_DETAIL；Tag 65–75%';
    app.settings.convertPromptTemplates = {'mixed': mixed};
    app.settings.reversePromptTemplates = {'mixed': mixed};
    await storage.setSettings(app.settings);
    final tools = AgentTemplateTools(app);
    for (final kind in ['convert', 'reverse']) {
      for (final mode in [ReversePromptMode.tags, ReversePromptMode.natural]) {
        final actual = await tools.execute('studio_prompt_template',
            {'kind': kind, 'mode': mode.value, 'templateVersion': 'v5'});
        final expected = app.resolvedPromptTemplate(kind, mode,
            templateVersion: 'v5');
        expect(actual['body'], expected, reason: '$kind ${mode.value}');
        expect(actual['body'], contains('AUDIT_SOURCE_DETAIL'));
      }
    }
  });

  test('Agent optimize and assistant use the actual Settings overlay', () async {
    final storage = _MemorySettings();
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    app.settings
      ..promptOptimizeTemplate = 'ACTUAL_OPTIMIZE_POLICY'
      ..promptAssistantTemplate = 'ACTUAL_CUSTOM_POLICY';
    await storage.setSettings(app.settings);
    final tools = AgentTemplateTools(app);
    for (final entry in {
      'optimize': 'ACTUAL_OPTIMIZE_POLICY',
      'assistant': 'ACTUAL_CUSTOM_POLICY'
    }.entries) {
      final read = await tools.execute('studio_prompt_template',
          {'kind': entry.key});
      expect(read['body'], entry.value);
      expect(read['source'], 'custom');
    }
  });

  test('actual edit service is registered as approval-required, not read-only', () {
    final names = agentToolSchemas()
        .map((schema) => (schema['function'] as Map)['name'])
        .toSet();
    expect(names, contains('langbai_edit_prompt'));
    expect(agentMutatingTools, contains('langbai_edit_prompt'));
    expect(agentReadTools, isNot(contains('langbai_edit_prompt')));
  });

  test('save then read uses Settings; failed persistence preserves old overlay', () async {
    final storage = _MemorySettings();
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    app.settings.promptOptimizeTemplate = 'old saved policy';
    await storage.setSettings(app.settings);
    final tools = AgentTemplateTools(app);
    final before = await tools.execute('studio_prompt_template', {'kind': 'optimize'});
    final saved = await tools.execute('studio_save_prompt_template', {
      'kind': 'optimize', 'expectedRevision': before['revision'],
      'body': 'new saved policy'});
    expect(saved['body'], 'new saved policy');
    expect(app.settings.promptOptimizeTemplate, 'new saved policy');
    expect((await storage.getSettings()).promptOptimizeTemplate, 'new saved policy');
    storage.failNextSave = true;
    await expectLater(tools.execute('studio_save_prompt_template', {
      'kind': 'optimize', 'expectedRevision': saved['revision'],
      'body': 'must not commit'}), throwsStateError);
    expect(app.settings.promptOptimizeTemplate, 'new saved policy');
    expect((await tools.execute('studio_prompt_template', {'kind': 'optimize'}))['body'],
        'new saved policy');
  });

  test('edit tool calls real prompt assistant route without changing locks or mode', () async {
    final storage = _MemorySettings();
    final api = _CaptureEditApi();
    final app = AppState(storage: storage, api: api);
    addTearDown(app.dispose);
    app.promptTemplates = await PromptTemplateLibrary.load();
    app.settings
      ..convertPromptTemplates = {'mixed': 'PRESERVE_DETAIL source mixed'}
      ..promptOptimizeTemplate = 'saved optimization overlay'
      ..promptAssistantMode = 'natural'
      ..convertPromptTemplateVersion = 'v4.5'
      ..lockStylePrompt = true
      ..lockNegativePrompt = true;
    app.params = GenerateParams(positivePrompt: 'original',
        negativePrompt: 'locked negative', stylePrompt: 'locked style');
    await storage.setSettings(app.settings);
    final executor = AgentToolExecutor(app: app, listMemories: () => [],
        upsertMemory: (_) async => {}, deleteMemory: (_) async => false);
    final result = await executor.execute('langbai_edit_prompt', {
      'kind': 'optimize', 'currentPrompt': 'blue umbrella',
      'mode': 'tags', 'templateVersion': 'v5'}, const []);
    expect(result.ok, true, reason: result.output);
    expect(result.output, contains('revised prompt'));
    expect(api.calls, 1);
    expect(api.kind, 'optimize');
    expect(api.mode, ReversePromptMode.tags);
    expect(api.version, 'v5');
    expect(api.body, contains('PRESERVE_DETAIL'));
    expect(api.overlay, 'saved optimization overlay');
    expect(app.params.positivePrompt, 'original');
    expect(app.params.negativePrompt, 'locked negative');
    expect(app.params.stylePrompt, 'locked style');
    expect(app.settings.promptAssistantMode, 'natural');
    expect(app.settings.convertPromptTemplateVersion, 'v4.5');
    expect(app.history, isEmpty);
  });

  test('confirm preview can cancel edit before the service is called', () async {
    final storage = _MemorySettings();
    final api = _CaptureEditApi();
    final app = AppState(storage: storage, api: api);
    addTearDown(app.dispose);
    app.settings
      ..agentApiBaseUrl = 'https://provider.invalid/v1'
      ..agentApiModel = 'fixture';
    await storage.setSettings(app.settings);
    final controller = AgentController(app: app, provider: _EditProvider());
    addTearDown(controller.dispose);
    await controller.load();
    await controller.setStudioOptions(approvalMode: 'confirm');
    final sending = controller.sendStudio('optimize this prompt');
    for (var i = 0; i < 100 && controller.pendingPermission == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
    expect(controller.pendingPermission?.tool, 'langbai_edit_prompt');
    expect(controller.pendingPermission?.arguments['kind'], 'optimize');
    expect(api.calls, 0);
    await controller.respondPermission('reject');
    await sending;
    expect(api.calls, 0);
    expect(app.history, isEmpty);
  });

  test('approved edit executes once with no image or locked-field mutation', () async {
    final storage = _MemorySettings();
    final api = _CaptureEditApi();
    final app = AppState(storage: storage, api: api);
    addTearDown(app.dispose);
    app.settings
      ..agentApiBaseUrl = 'https://provider.invalid/v1'
      ..agentApiModel = 'fixture'
      ..convertPromptTemplates = {'mixed': 'PRESERVE_DETAIL approved'}
      ..promptOptimizeTemplate = 'SAVED_EDIT_RULE'
      ..lockStylePrompt = true
      ..lockNegativePrompt = true;
    app.params = GenerateParams(positivePrompt: 'before',
        negativePrompt: 'locked negative', stylePrompt: 'locked style');
    await storage.setSettings(app.settings);
    final controller = AgentController(app: app, provider: _EditProvider());
    addTearDown(controller.dispose);
    await controller.load();
    await controller.setStudioOptions(approvalMode: 'confirm');
    final sending = controller.sendStudio('optimize this prompt');
    for (var i = 0; i < 100 && controller.pendingPermission == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
    final preview = controller.pendingPermission?.arguments;
    expect(preview?['estimateSource'], 'provider-unknown');
    expect(preview?['warning'], contains('可能收费'));
    expect(preview.toString(), isNot(contains('fixture-local-only')));
    expect(api.calls, 0);
    await controller.respondPermission('allow');
    await sending;
    expect(api.calls, 1);
    expect(api.body, contains('PRESERVE_DETAIL'));
    expect(api.overlay, 'SAVED_EDIT_RULE');
    expect(app.params.positivePrompt, 'before');
    expect(app.params.negativePrompt, 'locked negative');
    expect(app.params.stylePrompt, 'locked style');
    expect(app.history, isEmpty);
  });

  test('template drift during confirmation cancels the paid edit', () async {
    final storage = _MemorySettings();
    final api = _CaptureEditApi();
    final app = AppState(storage: storage, api: api);
    addTearDown(app.dispose);
    app.settings
      ..agentApiBaseUrl = 'https://provider.invalid/v1'
      ..agentApiModel = 'fixture';
    await storage.setSettings(app.settings);
    final controller = AgentController(app: app, provider: _EditProvider());
    addTearDown(controller.dispose);
    await controller.load();
    await controller.setStudioOptions(approvalMode: 'confirm');
    final sending = controller.sendStudio('optimize this prompt');
    for (var i = 0; i < 100 && controller.pendingPermission == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 2));
    }
    expect(controller.pendingPermission, isNotNull);
    app.settings.promptOptimizeTemplate = 'changed during approval';
    await controller.respondPermission('allow');
    await sending;
    expect(api.calls, 0);
    expect(controller.error, contains('模板已变化'));
  });

  test('legacy Agent-only rules migrate once without overwriting Settings', () async {
    final storage = _MemorySettings()
      ..workspace = AgentWorkspace(agentTemplates: {
        'optimize': 'legacy optimize rule',
        'assistant': 'legacy custom rule'});
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    app.settings.promptAssistantTemplate = 'new Settings custom rule';
    await storage.setSettings(app.settings);
    final controller = AgentController(app: app);
    addTearDown(controller.dispose);
    await controller.load();
    expect(app.settings.promptOptimizeTemplate, 'legacy optimize rule');
    expect(app.settings.promptAssistantTemplate, 'new Settings custom rule');
    expect(storage.workspace.agentTemplates['optimize'], 'legacy optimize rule');
    expect(storage.workspace.agentTemplates['assistant'], 'legacy custom rule');
    expect(storage.workspace.agentTemplates['_settingsSourceMigrated'], '1');
    app.settings.promptOptimizeTemplate = '';
    await storage.setSettings(app.settings);
    await controller.load();
    expect(app.settings.promptOptimizeTemplate, isEmpty);
  });

  test('failed legacy migration leaves both stores unchanged', () async {
    final storage = _MemorySettings()
      ..workspace = AgentWorkspace(agentTemplates: {'optimize': 'legacy rule'})
      ..failNextSave = true;
    final app = AppState(storage: storage);
    addTearDown(app.dispose);
    final controller = AgentController(app: app);
    addTearDown(controller.dispose);
    await expectLater(controller.load(), throwsStateError);
    expect(app.settings.promptOptimizeTemplate, isEmpty);
    expect(storage.saved.promptOptimizeTemplate, isEmpty);
    expect(storage.workspace.agentTemplates['optimize'], 'legacy rule');
    expect(storage.workspace.agentTemplates.containsKey('_settingsSourceMigrated'), false);
  });
}
