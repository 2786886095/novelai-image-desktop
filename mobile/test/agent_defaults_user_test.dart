import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/studio_options.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';

class _MemoryStorage extends Storage {
  AgentWorkspace saved = AgentWorkspace();
  @override Future<AgentWorkspace> getAgentWorkspace() async => saved;
  @override Future<void> setAgentWorkspace(AgentWorkspace value) async { saved=value; }
  @override Future<Set<String>> getAgentAlwaysAllowedTools() async => {};
  @override Future<String?> getAgentApiKey() async => null;
  @override Future<String?> getToken() async => null;
}
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('fresh and missing legacy Studio choices default auto/web; explicit saved off stays off', () {
    final fresh=AgentConversation(id:'fresh',title:'fresh');
    expect(fresh.studioApprovalMode,'auto');
    expect(fresh.studioWebSearchEnabled,true);
    final legacy=AgentConversation.fromJson({'id':'old','title':'old'});
    expect(legacy.studioApprovalMode,'auto');
    expect(legacy.studioWebSearchEnabled,true);
    final saved=AgentConversation.fromJson({'id':'saved','title':'saved','studioApprovalMode':'confirm','studioWebSearchEnabled':false});
    expect(saved.studioApprovalMode,'confirm');
    expect(saved.studioWebSearchEnabled,false);
    final cold=AgentConversation.fromJson(jsonDecode(jsonEncode(saved.toJson())));
    expect(cold.studioApprovalMode,'confirm');
    expect(cold.studioWebSearchEnabled,false);
  });
  test('new chat inherits explicit choices, cold restart retains them', () async {
    final storage=_MemoryStorage();final app=AppState(storage:storage);
    final controller=AgentController(app:app);
    addTearDown(controller.dispose);addTearDown(app.dispose);
    await controller.load();
    final fresh=controller.createConversation('fresh');
    expect(fresh.studioApprovalMode,'auto');
    expect(fresh.studioWebSearchEnabled,true);
    await controller.setStudioOptions(approvalMode:'confirm',webSearchEnabled:false);
    final inherited=controller.createConversation('inherited');
    expect(inherited.studioApprovalMode,'confirm');
    expect(inherited.studioWebSearchEnabled,false);
    await controller.saveWorkspace();
    final cold=AgentWorkspace.fromJson(jsonDecode(jsonEncode(storage.saved.toJson())));
    expect(cold.studioDefaults['studioApprovalMode'],'confirm');
    expect(cold.studioDefaults['studioWebSearchEnabled'],false);
    expect(cold.conversations.firstWhere((c)=>c.id==inherited.id).studioWebSearchEnabled,false);
  });
  test('使用预设 supplies selected creative body only when enabled', () {
    final workspace=AgentWorkspace();
    final chat=AgentConversation(id:'one',title:'one');
    final enabled=jsonDecode(studioCreativeContext(workspace,chat)) as Map;
    expect(enabled['preset'],studioInfinitePrompt);
    chat.studioTemplateEnabled=false;
    final disabled=jsonDecode(studioCreativeContext(workspace,chat)) as Map;
    expect(disabled['preset'],isNull);
    expect(disabled['characters'],enabled['characters']);
  });
}