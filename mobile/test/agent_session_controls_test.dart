import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image/image.dart' as img;
import 'package:novelai_mobile/agent/session_controls.dart';
import 'package:novelai_mobile/agent/template_tools.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/models/nai_models.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 late AppState app;late AgentSessionControls sessions;late Directory dir;
 setUp(()async{SharedPreferences.setMockInitialValues({});app=AppState();sessions=AgentSessionControls(app);dir=Directory.systemTemp.createTempSync('agent-session-');await app.storage.setSettings(app.settings);});
 tearDown((){app.dispose();dir.deleteSync(recursive:true);});
 test('unlimited auto is default; stop persists across restart and other sessions remain automatic',()async{
  expect(await sessions.read('fresh'),containsPair('limit',0));
  for(var i=0;i<130;i++){expect(await sessions.authorize('langbai_generate_image',{'count':8},'fresh'),true);}
  await sessions.execute('studio_stop_generation',{},'fresh');
  final restarted=AgentSessionControls(app);
  expect(await restarted.authorize('langbai_generate_image',{},'fresh'),false);
  expect(await restarted.authorize('langbai_generate_image',{},'another'),true);
  await restarted.execute('studio_generation_policy',{'mode':'auto','limit':0},'fresh');
  expect(await restarted.authorize('langbai_generate_image',{'count':8},'fresh'),true);
 });
 test('session style is persisted, never changes workbench; automatic policies are isolated and persist on restart',()async{
  app.settings.stylePromptPresets.add(StylePromptPreset(id:'fixture',name:'雨夜',prompt:'rain',group:'Default',createdAt:'2026-09-27'));
  final old=app.params.stylePrompt;
  await sessions.execute('studio_set_session_style',{'presetId':'fixture'},'one');expect((await sessions.read('one'))['style']['prompt'],'rain');expect(app.params.stylePrompt,old);expect((await sessions.read('two'))['style'],null);
  expect(await sessions.authorize('langbai_generate_image',{'count':1},'one'),true);
  await sessions.execute('studio_generation_policy',{'mode':'auto','limit':2},'one');expect(await sessions.authorize('langbai_generate_image',{'count':2},'one'),true);await expectLater(sessions.authorize('langbai_generate_image',{'count':1},'one'),throwsStateError);expect(await sessions.authorize('langbai_generate_image',{'count':1},'two'),true);
  final restarted=AgentSessionControls(app);expect((await restarted.read('one'))['mode'],'auto');expect((await restarted.read('one'))['style']['name'],'雨夜');
  await sessions.execute('studio_stop_generation',{},'one');expect((await sessions.read('one'))['mode'],'confirm');
 });
 test('registered previews are bounded reencoded images; caller paths rejected',()async{
  final file=File('${dir.path}/preview.png');file.writeAsBytesSync(img.encodePng(img.Image(width:500,height:250)..clear(img.ColorRgb8(80,90,180))));
  app.settings.stylePromptPresets.add(StylePromptPreset(id:'fixture',name:'preview',prompt:'rain',group:'Default',createdAt:'2026-09-27',previewImages:[StylePromptPreviewImage(id:'pic',name:'image',filePath:file.path,createdAt:'2026-09-27')]));
  final preview=await sessions.execute('studio_style_preview',{'presetId':'fixture'},'studio-library-ui');final bytes=base64Decode((preview['dataUrl'] as String).split(',').last);final image=img.decodeJpg(bytes)!;expect(image.width,320);expect(image.height,160);await expectLater(sessions.execute('studio_style_preview',{'presetId':'fixture','filePath':'elsewhere'},'one'),throwsStateError);
 });
 test('same local software templates support both versions, custom edits, stale rejection and restore default',()async{
  final templates=AgentTemplateTools(app);
  for(final kind in ['convert','reverse']){for(final version in ['v5','v4.5']){
   final select={'kind':kind,'mode':'mixed','templateVersion':version};final initial=await templates.execute('studio_prompt_template',select);expect(initial['source'],'builtin');expect((initial['body'] as String).isNotEmpty,true);
   final updated=await templates.execute('studio_save_prompt_template',{...select,'body':'自定义 {{input}}','expectedRevision':initial['revision']});expect(updated['source'],'custom');expect(updated['body'],'自定义 {{input}}');expect((await app.storage.getSettings()).agentPromptTemplateMode,'mixed');
   await expectLater(templates.execute('studio_save_prompt_template',{...select,'body':'stale','expectedRevision':initial['revision']}),throwsStateError);
   final restored=await templates.execute('studio_save_prompt_template',{...select,'body':'','restoreDefault':true,'expectedRevision':updated['revision']});expect(restored['source'],'builtin');expect(restored['body'],initial['body']);
  }}
 });
 test('real executor reads current session style, shared defaults mixed; no generation on selection',()async{
  final executor=AgentToolExecutor(app:app,listMemories:()=>[],upsertMemory:(_)async=>throw UnimplementedError(),deleteMemory:(_)async=>false);
  app.settings.stylePromptPresets.add(StylePromptPreset(id:'fixture',name:'style',prompt:'style-from-session',group:'Default',createdAt:'2026-09-27'));
  var r=await executor.execute('studio_set_session_style',{'presetId':'fixture'},[],sessionId:'one');expect(r.ok,true);
  r=await executor.execute('langbai_get_generation_state',{},[],sessionId:'one');expect(jsonDecode(r.output)['params']['stylePrompt'],'style-from-session');expect(app.history,isEmpty);expect(app.settings.agentPromptTemplateMode,'mixed');
 });
 test('real bridge consumes automatic budget once; UI revoke is reachable; model cannot grant itself',()async{
  final client=HttpClient();int executed=0;
  final bridge=LocalAgentBridge(journal:Directory('${dir.path}/journal'),authorizeImage:sessions.authorize,executeScoped:(tool,args,session)async{if(AgentSessionControls.tools.contains(tool))return AgentToolResult(ok:true,title:'ui',output:jsonEncode(await sessions.execute(tool,args,session)));executed++;return const AgentToolResult(ok:true,title:'generated fixture',output:'fixture only');},execute:(_,__)async=>throw StateError('unscoped'));
  await bridge.start();addTearDown(()async{await bridge.close();client.close(force:true);});var n=0;
  Future<Map> call(String tool,Map<String,dynamic> args,{String? id})async{final req=await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));req.headers.set('Authorization','Bearer ${bridge.token}');req.write(jsonEncode({'tool':tool,'args':args,'callId':id??'session-${n++}','sessionId':'one'}));final res=await req.close();return jsonDecode(await utf8.decoder.bind(res).join()) as Map;}
  await call('studio_generation_policy',{'mode':'auto','limit':1});final args={'count':1};expect((await call('langbai_generate_image',args,id:'paid-one'))['ok'],true);expect((await call('langbai_generate_image',args,id:'paid-one'))['ok'],true);expect(executed,1);expect((await call('langbai_generate_image',args))['ok'],false);expect(executed,1);
  expect((await call('studio_stop_generation',{}))['ok'],true);expect((await sessions.read('one'))['mode'],'confirm');expect(agentReadTools.contains('studio_generation_policy'),false);expect(agentMutatingTools.contains('studio_generation_policy'),false);
 });
}
