import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/batch/batch_redraw_controller.dart';
import 'package:novelai_mobile/batch/batch_redraw_models.dart';
import 'package:novelai_mobile/screens/batch_redraw_screen.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'dart:async';
import 'package:provider/provider.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/screens/prompt_assistant_dialog.dart';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/prompt_skill_v2.dart';
import 'package:novelai_mobile/prompts/prompt_skill_selection.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/agent/template_tools.dart';
import 'package:novelai_mobile/agent/template_workflow.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/agent/agent_controller.dart';
import 'package:novelai_mobile/screens/prompt_skill_selector.dart';

class _FixtureVault extends Storage {
 @override Future<String?> getConvertKey() async=>'fixture-only';
 @override Future<String?> getVisionKey() async=>'fixture-only';
 @override Future<void> setBatchRedrawProject(BatchRedrawProject project) async{}
 @override Future<void> setConvertHistory(List<TextToolHistoryItem> items) async{}
 @override Future<void> setReverseHistory(List<TextToolHistoryItem> items) async{}
}
class _WaitingApi extends NaiApi {
 final entered=Completer<void>(),gate=Completer<AiTextResult>();
 AppSettings? captured;String? capturedTemplate;ReversePromptMode? capturedMode;
 @override Future<AiTextResult> convertPrompt({required AppSettings settings,required String apiKey,required String text,required ReversePromptMode mode,required bool knownCharacter,required String systemTemplate}){entered.complete();return gate.future;}
 @override Future<AiTextResult> reversePrompt({required AppSettings settings,required String apiKey,required Uint8List image,required ReversePromptMode mode,required ReversePromptScope scope,required String hint,required bool knownCharacter,required String systemTemplate,String templateVersion=''}){captured=AppSettings.fromJson(settings.toJson());capturedTemplate=systemTemplate;capturedMode=mode;entered.complete();return gate.future;}
 @override Future<AiTextResult> assistPrompt({required AppSettings settings,required String apiKey,required String currentPrompt,required String instruction,required String kind,required ReversePromptMode mode,required String templateVersion,required String conversionTemplate}){entered.complete();return gate.future;}
}

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 final fixtures=(jsonDecode(File('../src/data/prompt-skill-audit-fixtures.json').readAsStringSync()) as List).cast<Map<String,dynamic>>();
 String output(ReversePromptMode mode)=>fixtures.firstWhere((x)=>x['mode']==mode.value)['prompt'];
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 test('independent defaults, legacy migration, separate V2 custom slots and roundtrip',(){
  final empty=AppSettings.fromJson({});expect(empty.reversePromptSkillVersion,'2.0.0');expect(empty.promptAssistantSkillVersion,'2.0.0');
  final old=AppSettings.fromJson({'reversePromptTemplates':{'tags':'MY OLD'},'convertPromptTemplates':{'mixed':'OLD CONVERT'},'promptOptimizeTemplate':'OLD OPTIMIZE','promptAssistantTemplate':'OLD EDIT'});
  expect(old.reversePromptSkillVersion,'1.0.0');expect(old.convertPromptSkillVersion,'1.0.0');expect(old.promptAssistantSkillVersion,'1.0.0');
  old.reversePromptTemplatesV2={'tags':'MY NEW'};old.convertPromptTemplatesV2={'mixed':'NEW CONVERT'};old.promptOptimizeTemplateV2='NEW OPTIMIZE';old.promptAssistantTemplateV2='NEW EDIT';
  final round=AppSettings.fromJson(jsonDecode(jsonEncode(old.toJson())));
  expect(round.reversePromptTemplates['tags'],'MY OLD');expect(round.reversePromptTemplatesV2['tags'],'MY NEW');expect(round.convertPromptTemplates['mixed'],'OLD CONVERT');expect(round.convertPromptTemplatesV2['mixed'],'NEW CONVERT');expect(round.promptOptimizeTemplate,'OLD OPTIMIZE');expect(round.promptOptimizeTemplateV2,'NEW OPTIMIZE');
  selectPromptSkill(round,'assistant','2.0.0','v5');expect(round.convertPromptSkillVersion,'1.0.0');expect(round.promptAssistantSkillVersion,'2.0.0');
  expect(()=>selectPromptSkill(round,'reverse','2.0.0','v4.5'),throwsFormatException);
  final v45=AppSettings.fromJson({'reversePromptTemplateVersion':'v4.5','reversePromptSkillVersion':'2.0.0'});expect(v45.reversePromptSkillVersion,'1.0.0');
 });
 test('catalog six original hashes and exact independent defaults; V1 unchanged',() async{
  final lib=await PromptTemplateLibrary.load();final catalog=jsonDecode(File('../shared/prompt-skill-catalog.json').readAsStringSync());
  for(final x in catalog['templates']){
   final mode=ReversePromptMode.values.byName(x['mode']);
   final body=lib.resolve(x['task'],mode,{},templateVersion:'v5',skillVersion:'2.0.0');
   expect(body,x['body']);expect(sha256.convert(utf8.encode(body)).toString(),x['sha256']);
   expect(body,isNot(contains('从同任务混合模板派生')));
   expect(lib.resolve(x['task'],mode,{'mixed':'NOT INHERITED',mode.value:'V2 CUSTOM'},templateVersion:'v5',skillVersion:'2.0.0'),'V2 CUSTOM');
  }
  expect(()=>lib.resolve('reverse',ReversePromptMode.tags,{},templateVersion:'v4.5',skillVersion:'2.0.0'),throwsFormatException);
  expect(lib.resolve('reverse',ReversePromptMode.mixed,{},templateVersion:'v5'),lib.reverse['mixed']);
  expect(lib.promptEditDefaultsV2['optimize'],contains('2.0.0'));expect(lib.promptEditDefaults['optimize'],isNotEmpty);expect(lib.legacyPure,isNotEmpty);expect(lib.modeSuffix,isNotEmpty);
  final shipped=AppSettings.fromJson({'reversePromptTemplates':lib.reverse,'convertPromptTemplates':lib.convert,'promptOptimizeTemplate':lib.promptEditDefaults['optimize']});expect(shipped.reversePromptSkillVersion,'2.0.0');expect(shipped.promptAssistantSkillVersion,'2.0.0');
 });
 for(final f in fixtures){test('shared V2 fixture ${f['name']} ${f['mode']} exact counts and words',(){
  final a=auditPromptSkillV2(f['prompt'],ReversePromptMode.values.byName(f['mode']));
  if(f['mode']=='natural'){expect(a.scope,'format-only');expect(a.effectiveUnits,isNull);expect(a.warnings.single,contains('人工'));}
  else{expect(a.effectiveUnits,f['declaredUnits']);expect(a.tagWords,f['tagWords']);expect(a.naturalWords,f['naturalWords']);}
 });}
 for(final count in [49,50,151]){test('pure tags $count no fixed 150 maximum',(){
  final text=List.generate(count,(i)=>'detail $i').join(', ');
  if(count<50){expect(()=>auditPromptSkillV2(text,ReversePromptMode.tags),throwsFormatException);}else{expect(auditPromptSkillV2(text,ReversePromptMode.tags).effectiveUnits,count);}
 });}
 test('controlled failure, malformed JSON, lettering, empty role and orphan anchors fail closed',(){
  for(final text in ['信息不足：请补充细节','模式能力不足：请用混合','json {bad','1girl | ',output(ReversePromptMode.tags).replaceFirst('target#giving','source#giving')]){expect(()=>parsePromptSkillV2Response(text,ReversePromptMode.tags),throwsFormatException);}
  expect(()=>parsePromptSkillV2Response(jsonEncode({'namePrompt':output(ReversePromptMode.tags),'featurePrompt':'信息不足：未知'}),ReversePromptMode.tags,knownCharacter:true),throwsFormatException);
  expect(parsePromptSkillV2Response('```json\n${jsonEncode({'namePrompt':output(ReversePromptMode.tags),'featurePrompt':output(ReversePromptMode.tags)})}\n```',ReversePromptMode.tags,knownCharacter:true).variants,isNotNull);
 });
 for(final task in ['reverse','convert','optimize','custom']){for(final mode in ReversePromptMode.values){
  test('loopback actual $task ${mode.value} sends exact V2 no legacy ratio/typed protocol and real AI model',() async{
   final lib=await PromptTemplateLibrary.load(),server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);
   final requests=<Map<String,dynamic>>[];
   server.listen((r)async{expect(r.uri.path,endsWith('/chat/completions'));requests.add(jsonDecode(await utf8.decoder.bind(r).join()));r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'choices':[{'message':{'content':output(mode)},'finish_reason':'stop'}]}));await r.response.close();});
   final s=AppSettings(proxyMode:'direct',visionApiUrl:'http://127.0.0.1:${server.port}',convertApiUrl:'http://127.0.0.1:${server.port}',visionApiModel:'fixture-vision',convertApiModel:'fixture-text',promptCodexEnhanceEnabled:false,tagServerEnabled:false);
   final api=NaiApi();late final AiTextResult result;
   if(task=='reverse'){result=await api.reversePrompt(settings:s,apiKey:'fixture-key',image:Uint8List.fromList([137,80,78,71]),mode:mode,scope:ReversePromptScope.full,hint:'synthetic input',knownCharacter:false,systemTemplate:'STALE');}
   else if(task=='convert'){result=await api.convertPrompt(settings:s,apiKey:'fixture-key',text:'synthetic input',mode:mode,knownCharacter:false,systemTemplate:'STALE');}
   else{result=await api.assistPrompt(settings:s,apiKey:'fixture-key',currentPrompt:output(mode),instruction:'keep scene',kind:task,mode:mode,templateVersion:'v5',conversionTemplate:lib.resolve('convert',mode,{},templateVersion:'v5',skillVersion:'2.0.0'));}
   expect(result.ok,true,reason:result.message);expect(result.text,output(mode));expect(requests,hasLength(1));expect(requests.single['model'],task=='reverse'?'fixture-vision':'fixture-text');
   final system=requests.single['messages'][0]['content'] as String,body=lib.resolve(task=='reverse'?'reverse':'convert',mode,{},templateVersion:'v5',skillVersion:'2.0.0').replaceAll('{{input}}','<provided in the user message>').replaceAll('{{image}}','<uploaded image>');
   expect(system,contains(body));expect(system,contains('没有可用的外部检索'));expect(system,isNot(contains('软件内部JSON输出协议')));expect(system,isNot(contains('STALE')));expect(system,isNot(contains('{{input}}')));expect(system,isNot(contains('{{image}}')));expect(requests.single.containsKey('response_format'),false);
   if(task=='reverse')expect(requests.single['messages'][1]['content'][0]['type'],'image_url');
  });
 }
 }
 for(final task in ['reverse','convert','optimize','custom']){for(final failure in ['信息不足：请补充细节','模式能力不足：改用混合','empty-length']){
  test('loopback $task $failure does not retry or accept/apply output',()async{
   final lib=await PromptTemplateLibrary.load(),server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;
   server.listen((r)async{calls++;await utf8.decoder.bind(r).join();r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'choices':[{'message':{'content':failure=='empty-length'?'':failure},'finish_reason':failure=='empty-length'?'length':'stop'}]}));await r.response.close();});
   final s=AppSettings(proxyMode:'direct',visionApiUrl:'http://127.0.0.1:${server.port}',convertApiUrl:'http://127.0.0.1:${server.port}');final api=NaiApi();late final AiTextResult result;
   if(task=='reverse'){result=await api.reversePrompt(settings:s,apiKey:'fixture-key',image:Uint8List(1),mode:ReversePromptMode.tags,scope:ReversePromptScope.full,hint:'',knownCharacter:false,systemTemplate:'');}
   else if(task=='convert'){result=await api.convertPrompt(settings:s,apiKey:'fixture-key',text:'source',mode:ReversePromptMode.tags,knownCharacter:false,systemTemplate:'');}
   else{result=await api.assistPrompt(settings:s,apiKey:'fixture-key',currentPrompt:'original',instruction:'keep',kind:task,mode:ReversePromptMode.tags,templateVersion:'v5',conversionTemplate:lib.resolve('convert',ReversePromptMode.tags,{},templateVersion:'v5',skillVersion:'2.0.0'));}
   expect(result.ok,false);expect(result.text,isEmpty);expect(calls,1);
  });
 }
 }
 test('Agent builtins selectable, revision-aware edition save/restore keeps V1 custom',()async{
  final app=AppState()..settings=AppSettings(reversePromptTemplates:{'tags':'LEGACY'});addTearDown(app.dispose);await app.storage.setSettings(app.settings);
  final tools=AgentTemplateTools(app),workflow=AgentTemplateWorkflow(app,templates:tools,backup:()async=>'/fixture-only/configuration');
  final before=await workflow.execute({'action':'read','kind':'reverse','mode':'tags','templateVersion':'v5','skillVersion':'2.0.0'});expect(before['source'],'builtin');
  final saved=await workflow.execute({'action':'save','kind':'reverse','mode':'tags','templateVersion':'v5','skillVersion':'2.0.0','expectedRevision':before['revision'],'body':'NEW CUSTOM'});expect(app.settings.reversePromptTemplates['tags'],'LEGACY');expect(app.settings.reversePromptTemplatesV2['tags'],'NEW CUSTOM');
  final restored=await workflow.execute({'action':'restore','kind':'reverse','mode':'tags','templateVersion':'v5','skillVersion':'2.0.0','expectedRevision':saved['revision']});expect(restored['source'],'builtin');expect(app.settings.reversePromptTemplates['tags'],'LEGACY');expect(app.settings.reversePromptTemplatesV2,isEmpty);
  final c=AgentController(app:app)..workspace=AgentWorkspace(conversations:[AgentConversation(id:'fixture',title:'Fixture')],selectedConversationId:'fixture')..loaded=true;addTearDown(c.dispose);
  await c.selectPromptTemplate('reverse',mode:'tags',version:'v5',skillVersion:'2.0.0');expect(c.selectedConversation!.selectedTemplateSkillVersion,'2.0.0');
  final skills=defaultAgentSkills();expect(skills,hasLength(6));expect(skills.every((s)=>s.builtIn&&!s.enabled),true);expect(skills.every((s)=>s.instructions.contains('skillVersion=2.0.0')),true);
  final restoredWorkspace=AgentWorkspace.fromJson(AgentWorkspace(skills:[...skills,AgentSkill(id:'custom',name:'Keep',instructions:'MY SKILL')]).toJson());expect(restoredWorkspace.skills.where((s)=>s.id=='custom').single.instructions,'MY SKILL');
 });
 testWidgets('360px selector shows independent model/edition and explicit V4.5 compatibility',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(360,800);addTearDown(tester.view.reset);
  var model='v5',edition='2.0.0';await tester.pumpWidget(MaterialApp(home:Scaffold(body:StatefulBuilder(builder:(context,setState)=>PromptSkillSelector(model:model,edition:edition,language:'zh-CN',onChanged:(m,e)=>setState((){model=m;edition=e;}))))));
  expect(find.text('目标生图模型'),findsOneWidget);expect(find.text('默认技能版本'),findsOneWidget);expect(tester.takeException(),isNull);
  await tester.tap(find.text('NovelAI V5 Full'));await tester.pumpAndSettle();await tester.tap(find.text('NovelAI V4.5').last);await tester.pumpAndSettle();expect(model,'v4.5');expect(edition,'1.0.0');expect(find.textContaining('V4.5 使用 1.0.0'),findsOneWidget);expect(tester.takeException(),isNull);
 });
 for(final task in ['reverse','convert']){for(final transition in ['edition','mode','body','input']){
  test('live $task result does not overwrite after $transition change during request',()async{
   final api=_WaitingApi(),app=AppState(storage:_FixtureVault(),api:api);addTearDown(app.dispose);
   app.promptTemplates=await PromptTemplateLibrary.load();app.convertInput='synthetic original';app.reverseHint='synthetic original';
   app.workbenchImage=WorkingImage(filePath:File('assets/icon/app_icon.png').absolute.path,width:1,height:1);
   app.reverseResult='KEEP REVERSE';app.convertResult='KEEP CONVERT';
   final pending=task=='reverse'?app.reversePrompt():app.convertPrompt();await api.entered.future;
   if(transition=='edition'){selectPromptSkill(app.settings,task,'1.0.0','v5');}
   else if(transition=='mode'){if(task=='reverse'){app.reverseMode=ReversePromptMode.mixed;}else{app.convertMode=ReversePromptMode.mixed;}}
   else if(transition=='body'){promptSkillOverrides(app.settings,task,'2.0.0','v5')[task=='reverse'?app.reverseMode.value:app.convertMode.value]='CHANGED BODY';}
   else{if(task=='reverse'){app.reverseHint='new hint';}else{app.convertInput='new input';}}
   api.gate.complete(const AiTextResult(ok:true,message:'fixture only',text:'OLD REQUEST COMPLETED'));final completed=await pending;expect(completed!.result,'OLD REQUEST COMPLETED');
   expect(task=='reverse'?app.reverseResult:app.convertResult,task=='reverse'?'KEEP REVERSE':'KEEP CONVERT');
   expect(task=='reverse'?app.reverseHistory.single.result:app.convertHistory.single.result,'OLD REQUEST COMPLETED');
  });
 }
 }
 testWidgets('assistant instruction edited while busy makes the old preview non-applicable',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(760,1100);addTearDown(tester.view.reset);
  final api=_WaitingApi(),app=AppState(storage:_FixtureVault(),api:api);addTearDown(app.dispose);app.promptTemplates=(await tester.runAsync(PromptTemplateLibrary.load))!;
  await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:PromptAssistantDialog(kind:'custom',source:'original',isCurrent:(_)=>true))));
  final field=find.byType(TextField);await tester.enterText(field,'first requirement');await tester.pump();await tester.tap(find.text('执行'));await tester.pump();expect(api.entered.isCompleted,true);
  await tester.enterText(field,'new requirement');api.gate.complete(const AiTextResult(ok:true,message:'fixture',text:'OLD RESPONSE'));await tester.pumpAndSettle();
  expect(find.text('OLD RESPONSE'),findsOneWidget);expect(find.text('原提示词已变化，请重新执行。'),findsOneWidget);
  final button=tester.widget<FilledButton>(find.widgetWithText(FilledButton,'应用'));expect(button.onPressed,isNull);expect(tester.takeException(),isNull);
 });

 for(final model in ['v5','v4.5']){
  test('batch exposes and freezes its own edition and target model $model independently',()async{
   final api=_WaitingApi(),app=AppState(storage:_FixtureVault(),api:api);addTearDown(app.dispose);app.promptTemplates=await PromptTemplateLibrary.load();
   app.settings..reversePromptTemplateVersion='v4.5'..reversePromptSkillVersion='1.0.0';
   final controller=BatchRedrawController(app)..loaded=true;addTearDown(controller.dispose);
   final edition=model=='v5'?'2.0.0':'1.0.0';
   controller.project=BatchRedrawProject(aiMode:ReversePromptMode.tags,aiTemplateVersion:model,aiSkillVersion:edition,items:[BatchRedrawItem(id:'fixture',name:'synthetic.png',base64:'iVBORw==')]);
   final pending=controller.reverseMissingPrompts();await api.entered.future;
   expect(api.captured!.reversePromptTemplateVersion,model);expect(api.captured!.reversePromptSkillVersion,edition);expect(api.capturedMode,ReversePromptMode.tags);
   expect(api.capturedTemplate,app.resolvedPromptTemplate('reverse',ReversePromptMode.tags,templateVersion:model,skillVersion:edition));
   api.gate.complete(const AiTextResult(ok:true,message:'fixture',text:'BATCH RESULT'));await pending;
   expect(controller.project.items.single.prompt,'BATCH RESULT');expect(app.settings.reversePromptTemplateVersion,'v4.5');
   final round=BatchRedrawProject.fromJson(controller.project.toJson(),GenerateParams());expect(round.aiTemplateVersion,model);expect(round.aiSkillVersion,edition);
  });
 }
 test('batch does not apply a previous version result after local selection changes',()async{
  final api=_WaitingApi(),app=AppState(storage:_FixtureVault(),api:api);addTearDown(app.dispose);app.promptTemplates=await PromptTemplateLibrary.load();
  final controller=BatchRedrawController(app)..loaded=true;addTearDown(controller.dispose);
  controller.project=BatchRedrawProject(aiTemplateVersion:'v5',aiSkillVersion:'2.0.0',items:[BatchRedrawItem(id:'fixture',name:'synthetic.png',base64:'iVBORw==')]);
  final pending=controller.reverseMissingPrompts();await api.entered.future;controller.project.aiSkillVersion='1.0.0';
  api.gate.complete(const AiTextResult(ok:true,message:'fixture',text:'OLD BATCH RESULT'));await pending;
  expect(controller.project.items.single.prompt,isEmpty);expect(controller.status,contains('已变化'));expect(controller.busy,false);
 });
 testWidgets('batch prompt step provides per-entry model and edition controls',(tester)async{
  tester.view.devicePixelRatio=1;tester.view.physicalSize=const Size(360,800);addTearDown(tester.view.reset);
  final app=AppState();addTearDown(app.dispose);final controller=BatchRedrawController(app)..project=BatchRedrawProject.empty(app.params)..loaded=true..step=BatchRedrawStep.prompts;addTearDown(controller.dispose);
  await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:MaterialApp(home:BatchRedrawScreen(controller:controller))));await tester.pump();
  expect(find.text('目标生图模型'),findsOneWidget);expect(find.text('默认技能版本'),findsOneWidget);expect(tester.takeException(),isNull);
 });

 test('Agent returns the bound completed job, never the unrelated old live editor result',()async{
  final api=_WaitingApi(),app=AppState(storage:_FixtureVault(),api:api);addTearDown(app.dispose);app.promptTemplates=await PromptTemplateLibrary.load();app.convertResult='UNRELATED CURRENT EDITOR';
  final executor=AgentToolExecutor(app:app,listMemories:()=>[],upsertMemory:(_)async=>{},deleteMemory:(_)async=>false);
  final pending=executor.execute('langbai_convert_prompt',{'text':'synthetic','mode':'tags','templateVersion':'v5','skillVersion':'2.0.0'},[]);await api.entered.future;
  app.settings.convertPromptSkillVersion='1.0.0';api.gate.complete(const AiTextResult(ok:true,message:'fixture only',text:'BOUND JOB OUTPUT'));
  final result=await pending;expect(result.ok,true,reason:result.output);expect(result.output,'BOUND JOB OUTPUT');expect(app.convertResult,'UNRELATED CURRENT EDITOR');
 });

}
