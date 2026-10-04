import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/i18n/studio_agent_text.dart';
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
  test('Chinese Tavern label resolves through actual shared mobile localizations', () {
    expect(studioAgentText('zh-CN','presetToggle'),'使用酒馆');
    expect(studioAgentText('zh-TW','presetToggle'),'使用酒館');
    debugPrint('MOBILE_LABEL=${studioAgentText('zh-CN','presetToggle')}');
  });
  test('fresh and unset legacy choices default all three on', () {
    for(final chat in [AgentConversation(id:'fresh',title:'fresh'),AgentConversation.fromJson({'id':'old','title':'old'})]) {
      expect(chat.studioApprovalMode,'auto');
      expect(chat.studioWebSearchEnabled,true);
      expect(chat.studioTemplateEnabled,true);
    }
    debugPrint('MOBILE_UNSET=auto,true,true');
  });
  test('explicit manual all-off choices persist in new chat and cold restart', () async {
    final storage=_MemoryStorage();final app=AppState(storage:storage);
    final controller=AgentController(app:app);
    addTearDown(controller.dispose);addTearDown(app.dispose);
    await controller.load();
    await controller.setStudioOptions(approvalMode:'confirm',webSearchEnabled:false,templateEnabled:false);
    final next=controller.createConversation('inherit');
    expect(next.studioApprovalMode,'confirm');
    expect(next.studioWebSearchEnabled,false);
    expect(next.studioTemplateEnabled,false);
    await controller.saveWorkspace();
    final cold=AgentWorkspace.fromJson(jsonDecode(jsonEncode(storage.saved.toJson())));
    final chat=cold.conversations.firstWhere((c)=>c.id==next.id);
    expect(chat.studioApprovalMode,'confirm');
    expect(chat.studioWebSearchEnabled,false);
    expect(chat.studioTemplateEnabled,false);
    debugPrint('MOBILE_SAVED=confirm,false,false');
  });
}
