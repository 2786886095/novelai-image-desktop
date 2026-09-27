import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/agent/api_tools.dart';
import 'package:novelai_mobile/agent/local_agent_bridge.dart';
import 'package:novelai_mobile/agent/agent_tools.dart';

class TestVault extends Storage{
 final keys=<String,String>{'convert':'private-test-value'};
 @override Future<String?> getToken()async=>keys['nai'];
 @override Future<String?> getVisionKey()async=>keys['reverse'];
 @override Future<String?> getConvertKey()async=>keys['convert'];
 @override Future<String?> getAgentApiKey()async=>keys['agent'];
 @override Future<String?> getTagKey()async=>keys['tags'];
 @override Future<void> setConvertKey(String v)async{keys['convert']=v;}
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 late AppState app;late TestVault storage;late AgentApiTools tools;
 setUp(()async{SharedPreferences.setMockInitialValues({});storage=TestVault();app=AppState(storage:storage);app.settings=AppSettings()..proxyMode='direct';await storage.setSettings(app.settings);tools=AgentApiTools(app);});
 tearDown(()=>app.dispose());
 Future<dynamic> call(Map<String,dynamic> args)=>tools.execute('langbai_api',args,'one');
 test('real settings persist; key never in read; clear and stale CAS',()async{
  final before=await call({'action':'read','profile':'convert'});expect(jsonEncode(before),isNot(contains('private-test-value')));
  final saved=await call({'action':'configure','profile':'convert','expectedRevision':before['revision'],'patch':{'model':'new-model'}});
  expect(saved['saved'],true);expect((await storage.getSettings()).convertApiModel,'new-model');expect(app.settings.convertApiModel,'new-model');
  await expectLater(call({'action':'clearCredential','profile':'convert','expectedRevision':before['revision']}),throwsStateError);
  final clear=await call({'action':'clearCredential','profile':'convert','expectedRevision':saved['revision']});expect(clear['credentialConfigured'],false);expect(await storage.getConvertKey(),'');
 });
 test('private input expires, matches session, and is consumed exactly once',()async{
  final before=await call({'action':'read','profile':'convert'});await call({'action':'credential','profile':'convert','expectedRevision':before['revision']});
  final input=await tools.execute('studio_api_input',{},'one');expect(jsonEncode(input),isNot(contains('private-test-value')));
  await expectLater(tools.execute('studio_resolve_api_input',{'id':input['id'],'value':'new-private'},'two'),throwsStateError);
  final one=tools.execute('studio_resolve_api_input',{'id':input['id'],'value':'new-private'},'one');final two=tools.execute('studio_resolve_api_input',{'id':input['id'],'value':'second'},'one');
  await expectLater(two,throwsStateError);expect((await one)['saved'],true);expect(await storage.getConvertKey(),'new-private');
 });
 test('connection uses saved address; no redirects or model error body leakage',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));var redirected=0;server.listen((req)async{expect(req.headers.value('Authorization'),'Bearer private-test-value');if(req.uri.path=='/models'){req.response.write(jsonEncode({'data':[{'id':'model-a'},{'id':'private-test-value'}]}));}else if(req.uri.path=='/redirect/models'){req.response.statusCode=302;req.response.headers.set('location','/leak');}else{redirected++;}await req.response.close();});
  app.settings.convertApiUrl='http://127.0.0.1:${server.port}';await storage.setSettings(app.settings);
  final result=await call({'action':'test','profile':'convert'});expect(result['connected'],true);expect(result['models'],['model-a']);
  app.settings.convertApiUrl='http://127.0.0.1:${server.port}/redirect';await storage.setSettings(app.settings);
  await expectLater(call({'action':'test','profile':'convert'}),throwsStateError);expect(redirected,0);
  await expectLater(call({'action':'test','profile':'convert','secret':'private-test-value'}),throwsStateError);
 });
 test('real HTTP bridge confirms config once; private field never in journal',()async{
  final dir=Directory.systemTemp.createTempSync('api-agent-bridge-');final client=HttpClient();
  final executor=AgentToolExecutor(app:app,listMemories:()=>[],upsertMemory:(_)async=>throw UnimplementedError(),deleteMemory:(_)async=>false);
  final bridge=LocalAgentBridge(journal:dir,execute:(t,a)=>executor.execute(t,a,[]),executeScoped:(t,a,s)=>executor.execute(t,a,[],sessionId:s),describeApproval:(t,a,s)=>executor.approvalSummary(t,a,s));
  await bridge.start();addTearDown(()async{await bridge.close();client.close(force:true);dir.deleteSync(recursive:true);});
  var n=0;
  Future<Map> request(String tool,Map<String,dynamic> args)async{final req=await client.postUrl(Uri.parse('${bridge.url}/v1/tool'));req.headers.set('Authorization','Bearer ${bridge.token}');req.write(jsonEncode({'tool':tool,'args':args,'sessionId':'one','callId':'api-${n++}'}));final res=await req.close();expect(res.statusCode,200);return jsonDecode(await utf8.decoder.bind(res).join()) as Map;}
  var read=await request('langbai_api',{'action':'read','profile':'convert'});expect(read['ok'],true);
  final updating=request('langbai_api',{'action':'configure','profile':'convert','expectedRevision':read['data']['revision'],'patch':{'model':'bridge-model'}});
  Map? pending;for(var i=0;i<100;i++){final poll=await request('studio_image_approval',{});if(poll['data'] is Map){pending=poll['data'];break;}await Future<void>.delayed(const Duration(milliseconds:10));}
  expect(pending,isNotNull);await request('studio_resolve_image_approval',{'id':pending!['id'],'approved':true});expect((await updating)['ok'],true);
  read=await request('langbai_api',{'action':'read','profile':'convert'});
  expect((await request('langbai_api',{'action':'credential','profile':'convert','expectedRevision':read['data']['revision']}))['ok'],true);
  final input=await request('studio_api_input',{});final done=await request('studio_resolve_api_input',{'id':input['data']['id'],'value':'ui-private-only'});expect(done['ok'],true);expect(jsonEncode(done),isNot(contains('ui-private-only')));expect(await storage.getConvertKey(),'ui-private-only');
  for(final file in dir.listSync().whereType<File>()){expect(file.readAsStringSync(),isNot(contains('ui-private-only')));expect(file.readAsStringSync(),isNot(contains('private-test-value')));}
 });
}
