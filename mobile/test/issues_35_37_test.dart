import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/agent/model_selections.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/screens/studio_agent_screen.dart';
import 'package:novelai_mobile/screens/studio_model_collection.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/services/composer_transfers.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/i18n/studio_agent_text.dart';

class OwnedStorage extends Storage {
  Directory? root;
  AppSettings? saved;
  AgentWorkspace? persisted;
  @override Future<void> setSettings(AppSettings value) async {
    saved=AppSettings.fromJson(jsonDecode(jsonEncode(value.toJson())));
  }
  @override Future<void> setAgentWorkspace(AgentWorkspace value) async {persisted=value;}
  @override Future<Directory> agentAttachmentsDirectory([String? id]) async {
    final directory=Directory('${root!.path}/attachments/$id');
    await directory.create(recursive:true);return directory;
  }
}
class PickController extends AgentController {
  int picks=0;final dropped=<String>[];
  PickController({required super.app});
  @override Future<List<AgentAttachment>> pickAttachments() async {picks++;return [];}
  @override Future<List<AgentAttachment>> importAttachmentPaths(List<String> paths,{String? conversationId}) async {
    dropped.addAll(paths);return [AgentAttachment(id:'next-file',name:'fixture.txt',kind:'text',mime:'text/plain',size:3,filePath:paths.first)];
  }
}
void main(){
  TestWidgetsFlutterBinding.ensureInitialized();
  test('selected model migration and JSON persistence never add all provider models',(){
    final settings=AppSettings(agentApiProtocol:'openai-compatible',agentApiBaseUrl:'https://fixture.invalid/v1/',agentApiModel:'legacy');
    expect(selectedAgentModels(settings).map((m)=>m['id']),['legacy']);
    settings.savedAgentModels=normalizeSavedAgentModels([
      {'providerKey':agentProviderKey(settings),'id':'selected','contextWindow':96000,'reasoningEffort':'high','apiKey':'DO-NOT-PERSIST'},
      {'providerKey':'openai-compatible|https://other.invalid/v1','id':'other','contextWindow':64000,'reasoningEffort':'low'},
    ]);
    applyAgentModel(settings,settings.savedAgentModels.first);
    final reopened=AppSettings.fromJson(jsonDecode(jsonEncode(settings.toJson())));
    expect(selectedAgentModels(reopened).map((m)=>m['id']),['selected']);
    expect(reopened.agentContextWindow,96000);expect(reopened.agentReasoningEffort,'high');
    expect(reopened.savedAgentModels,hasLength(2));expect(reopened.savedAgentModels.first.containsKey('apiKey'),false);
  });
  test('real file copy during reply preserves current message and queues next-message attachment',() async {
    final root=await Directory.systemTemp.createTemp('issues-35-37-');
    final storage=OwnedStorage()..root=root,app=AppState(storage:OwnedStorage());
    final actualApp=AppState(storage:storage),controller=AgentController(app:actualApp)..loaded=true..sending=true;
    final chat=AgentConversation(id:'owned',title:'reply',status:'running',messages:[AgentMessage(id:'assistant',role:'assistant',content:'fresh output',status:'streaming')]);
    controller.workspace=AgentWorkspace(conversations:[chat],selectedConversationId:chat.id);
    try{
      final source=File('${root.path}/pasted.md');await source.writeAsString('actual attachment bytes');
      final result=await controller.importAttachmentPaths([source.path]);
      expect(result,hasLength(1));expect(await File(result.single.filePath).readAsString(),'actual attachment bytes');
      expect(chat.messages.single.content,'fresh output');expect(chat.messages.single.attachments,isEmpty);
      expect(chat.status,'running');expect(controller.sending,true);expect(chat.draftAttachments,hasLength(1));
      final invalid=File('${root.path}/blocked.exe');await invalid.writeAsString('invalid');
      expect(await controller.importAttachmentPaths([invalid.path]),isEmpty);
      chat.archivedAt=agentNow();expect(await controller.importAttachmentPaths([source.path]),isEmpty);
    }finally{controller.dispose();actualApp.dispose();app.dispose();await root.delete(recursive:true);}
  });
  testWidgets('manual models and removing active model update settings draft',(tester) async {
    var settings=AppSettings(language:'zh-CN',agentApiBaseUrl:'https://fixture.invalid/v1',agentApiModel:'manual-model');
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:StatefulBuilder(builder:(context,setState)=>SingleChildScrollView(child:StudioModelCollection(draft:settings,apiKey:'fixture',disabled:false,onChanged:(s)=>setState(()=>settings=s)))))));
    await tester.tap(find.text(studioAgentText('zh-CN','addModel')));await tester.pumpAndSettle();
    expect(settings.savedAgentModels.single['id'],'manual-model');
    final input=find.byType(TextFormField);await tester.enterText(input,'96000');await tester.pump();
    expect(settings.savedAgentModels.single['contextWindow'],96000);
    await tester.tap(find.byTooltip(studioAgentText('zh-CN','removeModel')));await tester.pumpAndSettle();
    expect(settings.savedAgentModels,isEmpty);expect(settings.agentApiModel,'');expect(tester.takeException(),isNull);
  });
  testWidgets('plus is usable during output; explicit native paste and drop reach next-turn importer',(tester) async {
    final app=AppState(storage:OwnedStorage())..settings=AppSettings(language:'zh-CN');
    final controller=PickController(app:app)..loaded=true..sending=true;
    controller.workspace=AgentWorkspace(conversations:[AgentConversation(id:'owned',title:'stream',status:'running',messages:[AgentMessage(id:'assistant',role:'assistant',content:'reply',status:'streaming')])],selectedConversationId:'owned');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(ComposerTransfers.channel,(call) async=>call.method=='paste'?['owned-native-fixture.txt']:null);
    await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:StudioAgentScreen(controller:controller))));
    await tester.pump();await tester.pump(const Duration(milliseconds:400));
    final plus=find.byTooltip(studioAgentText('zh-CN','addAttachment'));
    expect(tester.widget<IconButton>(find.ancestor(of:plus,matching:find.byType(IconButton)).first).onPressed,isNotNull);
    await tester.tap(plus);await tester.pump();await tester.pump(const Duration(milliseconds:400));
    await tester.tap(find.text(studioAgentText('zh-CN','chooseFile')));await tester.pump();await tester.pump(const Duration(milliseconds:400));expect(controller.picks,1);
    await tester.tap(plus);await tester.pump();await tester.pump(const Duration(milliseconds:400));
    await tester.tap(find.text(studioAgentText('zh-CN','pasteFiles')));await tester.pump();await tester.pump(const Duration(milliseconds:400));
    expect(controller.dropped,['owned-native-fixture.txt']);
    await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.handlePlatformMessage(ComposerTransfers.channel.name,const StandardMethodCodec().encodeMethodCall(const MethodCall('drop',['owned-drop-fixture.md'])),(_){ });await tester.pump();
    expect(controller.dropped,['owned-native-fixture.txt','owned-drop-fixture.md']);
    expect(controller.workspace.conversations.single.messages.single.content,'reply');expect(controller.sending,true);
    await tester.pumpWidget(const SizedBox());await tester.pump();controller.dispose();app.dispose();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(ComposerTransfers.channel,null);
    expect(tester.takeException(),isNull);
  });
}
