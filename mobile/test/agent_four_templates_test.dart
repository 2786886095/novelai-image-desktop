import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_merge.dart';
import 'package:novelai_mobile/agent/agent_provider.dart';
import 'package:novelai_mobile/agent/template_tools.dart';
import 'package:novelai_mobile/agent/template_workflow.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _Vault extends Storage {
  AgentWorkspace saved = AgentWorkspace();
  @override
  Future<AgentWorkspace> getAgentWorkspace() async => saved;
  @override
  Future<void> setAgentWorkspace(AgentWorkspace value) async { saved = value; }
  @override
  Future<String?> getAgentApiKey() async => 'fixture-only';
  @override
  Future<Set<String>> getAgentAlwaysAllowedTools() async => {};
}

class _CaptureProvider extends AgentProviderClient {
  final requests = <List<Map<String, dynamic>>>[];
  String kind = 'convert';
  bool requestedRead = false;
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
    if (!requestedRead) {
      requestedRead = true;
      return AgentProviderTurn(usage: AgentTokenUsage(), toolCalls: [
        AgentProviderToolCall(id: 'read-$kind', name: 'studio_prompt_template',
            arguments: {'kind': kind,
              if (kind == 'convert' || kind == 'reverse') ...{
                'mode': 'mixed', 'templateVersion': 'v5'
              }})
      ]);
    }
    return AgentProviderTurn(content: 'fixture answer', usage: AgentTokenUsage());
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Agent workspace backup merge restores saved assistant templates', () {
    final restored = mergeAgentWorkspaces(
        AgentWorkspace(agentTemplates: {'assistant': 'new body'}),
        AgentWorkspace(agentTemplates: {'assistant': 'saved old body'}));
    expect(restored.workspace.agentTemplates['assistant'], 'saved old body');
  });

  test('optimize/assistant are durable read-save-restore tools, not UI-only labels',
      () async {
    final storage = _Vault();
    final app = AppState(storage: storage);
    await storage.setSettings(app.settings);
    final tools = AgentTemplateTools(app);
    final workflow = AgentTemplateWorkflow(app,
        templates: tools,
        backup: () async => '/fixture/configuration.backup');
    for (final kind in ['optimize', 'assistant']) {
      final before = await workflow.execute({'action': 'read', 'kind': kind});
      expect(before['source'], 'builtin');
      final saved = await workflow.execute({
        'action': 'save', 'kind': kind,
        'expectedRevision': before['revision'],
        'body': 'saved $kind instruction'
      });
      expect(saved['source'], 'custom');
      expect(saved['body'], 'saved $kind instruction');
      expect(kind == 'optimize' ? app.settings.promptOptimizeTemplate
          : app.settings.promptAssistantTemplate, 'saved $kind instruction');
      final restored = await workflow.execute({
        'action': 'restore', 'kind': kind,
        'expectedRevision': saved['revision'],
      });
      expect(restored['source'], 'builtin');
      expect(kind == 'optimize' ? app.settings.promptOptimizeTemplate
          : app.settings.promptAssistantTemplate, isEmpty);
    }
    app.dispose();
  });

  test('explicit template actions inject saved bodies for all four kinds', () async {
    final storage = _Vault();
    final app = AppState(storage: storage)
      ..settings = AppSettings(
        agentApiBaseUrl: 'https://example.invalid/v1',
        agentApiModel: 'fixture',
        convertPromptTemplates: {'mixed': 'saved convert body'},
        reversePromptTemplates: {'mixed': 'saved reverse body'},
        promptOptimizeTemplate: 'saved optimize body',
        promptAssistantTemplate: 'saved assistant body');
    final provider = _CaptureProvider();
    await storage.setSettings(app.settings);
    final controller = AgentController(app: app, provider: provider)
      ..workspace = AgentWorkspace(
        conversations: [AgentConversation(id: 'chat', title: 'Fixture')],
        selectedConversationId: 'chat')
      ..loaded = true;
    for (final kind in ['convert', 'reverse', 'optimize', 'assistant']) {
      provider..kind = kind..requestedRead = false;
      await controller.selectPromptTemplate(kind,
          mode: kind == 'convert' || kind == 'reverse' ? 'mixed' : null,
          version: kind == 'convert' || kind == 'reverse' ? 'v5' : null);
      await controller.sendStudio('use selected template', actions: [
        AgentComposerAction(kind == 'reverse' ? 'template-read' : 'template-apply',
            templateKind: kind, mode: 'mixed', templateVersion: 'v5')
      ]);
      expect(provider.requests.last
          .map((message) => message['content'].toString())
          .join('\n'), contains('saved $kind body'));
    }
    expect(controller.selectedConversation?.selectedTemplateKind, 'assistant');
    controller.dispose();
    app.dispose();
  });
}
