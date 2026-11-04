import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/prompts/prompt_skill_v2.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/screens/inspect_screen.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';

const warning='检查未通过，已保留结果供手动确认：有效单元不足';
class _Vault extends Storage {
 @override Future<String?> getConvertKey() async=>'synthetic-only';
 @override Future<String?> getVisionKey() async=>'synthetic-only';
 @override Future<void> setConvertHistory(List<TextToolHistoryItem> items) async{}
 @override Future<void> setReverseHistory(List<TextToolHistoryItem> items) async{}
}
class _DraftApi extends NaiApi {
 @override Future<AiTextResult> reversePrompt({required AppSettings settings,required String apiKey,required Uint8List image,required ReversePromptMode mode,required ReversePromptScope scope,required String hint,required bool knownCharacter,required String systemTemplate,String templateVersion=''})async=>const AiTextResult(ok:true,text:'red cup',message:warning);
 @override Future<AiTextResult> convertPrompt({required AppSettings settings,required String apiKey,required String text,required ReversePromptMode mode,required bool knownCharacter,required String systemTemplate})async=>const AiTextResult(ok:true,text:'red cup',message:warning);
}

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 final fixtures=(jsonDecode(File('../src/data/prompt-skill-audit-fixtures.json').readAsStringSync()) as List).cast<Map<String,dynamic>>();
 String prompt(ReversePromptMode mode)=>fixtures.firstWhere((x)=>x['mode']==mode.value&&x['name']=='still_life')['prompt'] as String;
 String fence(String text)=>'```text\n$text\n```';
 final tags=List.generate(50,(i)=>'object $i').join(', ');
 for(final mode in ReversePromptMode.values){
  for(final language in ['','text','txt','plaintext','TEXT']){for(final eol in ['\n','\r\n']){
   test('${mode.value}/$language/${jsonEncode(eol)} unwraps exact body, direct audit stays strict',(){
    final body=prompt(mode),raw=' \n```$language$eol$body$eol```\n ';
    expect(parsePromptSkillV2Response(raw,mode).prompt,body);
    expect(()=>auditPromptSkillV2(raw,mode),throwsFormatException);
   });
  }}
 }
 final bad={
  'incomplete':'```text\n$tags','inline':'```text $tags```','prefix':'Here is the prompt: ${fence(tags)}',
  'suffix':'${fence(tags)}\nExplanation','json':'```json\n${jsonEncode({'prompt':tags})}\n```',
  'multiline':fence('$tags\nmore facts'),'multiple':'${fence(tags)}\n${fence(tags)}',
  'short':fence('red cup'),'weight':fence('$tags, 1.2::unclosed'),'duplicate':fence('$tags, object 0'),
  'anchor':fence('$tags, source#giving'),'chinese':fence('$tags, 一个杯子'),
  'quote':fence('$tags, Text: "unclosed'),'artist':fence('$tags, artist:test'),'quality':fence('$tags, best quality'),
 };
 for(final entry in bad.entries){test('rejects ${entry.key} after transport handling',()=>expect(()=>parsePromptSkillV2Response(entry.value,ReversePromptMode.tags),throwsFormatException));}
 for(final refusal in ['信息不足：请补充事实','模式能力不足：请改用混合模式']){test('preserves refusal $refusal',()=>expect(()=>parsePromptSkillV2Response(fence(refusal),ReversePromptMode.tags),throwsA(isA<FormatException>().having((e)=>e.message,'message',refusal))));}
 test('preserves quoted Chinese lettering, weights, comma and pipe',(){
  final body='$tags, 1.2::red cup ::, text, chinese text, Text: "你好, 世界 | 再见"';
  expect(parsePromptSkillV2Response(fence(body),ReversePromptMode.tags).prompt,body);
 });
 test('known-character JSON remains separate and complete',(){
  expect(()=>parsePromptSkillV2Response(fence(tags),ReversePromptMode.tags,knownCharacter:true),throwsFormatException);
  final dual=jsonEncode({'namePrompt':tags,'featurePrompt':tags});
  expect(parsePromptSkillV2Response('```json\n$dual\n```',ReversePromptMode.tags,knownCharacter:true).variants?.featurePrompt,tags);
 });
 for(final mode in ReversePromptMode.values){test('Chinese conversion/${mode.value} through actual loopback keeps exact input and one request',() async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);
  final requests=<Map<String,dynamic>>[];
  server.listen((r)async{
   expect(r.uri.path,endsWith('/chat/completions'));
   requests.add(jsonDecode(await utf8.decoder.bind(r).join()) as Map<String,dynamic>);
   r.response.headers.contentType=ContentType.json;
   r.response.write(jsonEncode({'choices':[{'message':{'content':fence(prompt(mode))},'finish_reason':'stop'}]}));
   await r.response.close();
  });
  final settings=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'synthetic-text',promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  const input='白色花瓶旁边放着一本红色书，保持用户提供的场景，不补造细节。';
  final result=await NaiApi().convertPrompt(settings:settings,apiKey:'synthetic-local-only',text:input,mode:mode,knownCharacter:false,systemTemplate:'unused');
  expect(result.ok,true,reason:result.message);expect(result.text,prompt(mode));expect(requests,hasLength(1));
  expect(jsonDecode(requests.single['messages'][1]['content'] as String)['input'],input);
 });}
 for(final mode in ReversePromptMode.values){test('conversion advisory ${mode.value} preserves rejected draft and warning',(){
  final body=mode==ReversePromptMode.natural?'A cat sleeps.':'red cup';
  expect(()=>parsePromptSkillV2Response(body,mode),throwsFormatException);
  final result=parsePromptSkillV2Response(body,mode,validationWarningOnly:true);
  expect(result.prompt,body);expect(result.warnings.join(''),contains('检查未通过'));
 });}
 test('advisory paired variants stay actual strings',(){
  final result=parsePromptSkillV2Response(jsonEncode({'namePrompt':'1girl, blue hair','featurePrompt':'girl, blue hair'}),ReversePromptMode.tags,knownCharacter:true,validationWarningOnly:true);
  expect(result.variants?.namePrompt,'1girl, blue hair');expect(result.variants?.featurePrompt,'girl, blue hair');expect(result.warnings.join(''),contains('检查未通过'));
 });
 for(final bad in ['','   ','a'*60001,'信息不足：请补充','模式能力不足：不能表达','抱歉，无法完成','I am sorry, I cannot assist with this request.',"I can't help with that.",'```text\nred cup','{"prompt":"red cup"}']){
  test('advisory rejects unusable output ${bad.substring(0,bad.length>12?12:bad.length)}',()=>expect(()=>parsePromptSkillV2Response(bad,ReversePromptMode.tags,validationWarningOnly:true),throwsFormatException));
 }
 for(final mode in ReversePromptMode.values){test('actual mobile conversion ${mode.value} delivers short reply with warning in one request',() async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;
  server.listen((request)async{calls++;await utf8.decoder.bind(request).join();request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'choices':[{'message':{'content':mode==ReversePromptMode.natural?'A cat sleeps.':'red cup'},'finish_reason':'stop'}]}));await request.response.close();});
  final settings=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'synthetic',promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  final result=await NaiApi().convertPrompt(settings:settings,apiKey:'synthetic-only',text:'红色杯子',mode:mode,knownCharacter:false,systemTemplate:'unused');
  expect(result.ok,true,reason:result.message);expect(result.message,contains('检查未通过'));expect(result.text,mode==ReversePromptMode.natural?'A cat sleeps.':'red cup');expect(calls,1);
 });}
 for(final reply in ['',"I'm sorry, but I can't assist with this request.",'信息不足：请补充','TRUNCATED']){test('actual mobile conversion rejects unusable output ${reply.substring(0,reply.length>12?12:reply.length)} without retry',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;
  server.listen((request)async{calls++;await utf8.decoder.bind(request).join();request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'choices':[{'message':{'content':reply},'finish_reason':reply=='TRUNCATED'?'length':'stop'}]}));await request.response.close();});
  final settings=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'synthetic',promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  final result=await NaiApi().convertPrompt(settings:settings,apiKey:'synthetic-only',text:'红色杯子',mode:ReversePromptMode.tags,knownCharacter:false,systemTemplate:'unused');
  expect(result.ok,false);expect(result.text,isEmpty);expect(calls,1);
 });}
 test('completed advisory draft reaches editor, history and retained warning',()async{
  final app=AppState(storage:_Vault(),api:_DraftApi());addTearDown(app.dispose);app.promptTemplates=await PromptTemplateLibrary.load();app.convertInput='红色杯子';
  final job=await app.convertPrompt();expect(job!.status,TextToolJobStatus.done);expect(app.convertResult,'red cup');expect(app.convertHistory.single.result,'red cup');expect(app.convertResultWarning,warning);
 });
 for(final mode in ReversePromptMode.values){test('mobile reverse ${mode.value} retains failed-check draft with warning in one actual loopback request',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;final draft=mode==ReversePromptMode.natural?'A cat sleeps.':'red cup';
  server.listen((request)async{calls++;final body=jsonDecode(await utf8.decoder.bind(request).join());expect(body['messages'][1]['content'][0]['image_url']['url'],startsWith('data:image/'));request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'choices':[{'message':{'content':draft},'finish_reason':'stop'}]}));await request.response.close();});
  final settings=AppSettings(proxyMode:'direct',visionApiUrl:'http://127.0.0.1:${server.port}',visionApiModel:'synthetic',promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  final r=await NaiApi().reversePrompt(settings:settings,apiKey:'synthetic-only',image:Uint8List.fromList([137,80,78,71]),mode:mode,scope:ReversePromptScope.full,hint:'只描述可见内容',knownCharacter:false,systemTemplate:'unused');
  expect(r.ok,true,reason:r.message);expect(r.text,draft);expect(r.message,contains('检查未通过'));expect(calls,1);
 });}
 test('mobile legacy reverse typed short draft is advisory, not repeated count repair',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;
  server.listen((request)async{calls++;await utf8.decoder.bind(request).join();request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'choices':[{'message':{'content':jsonEncode({'segments':[{'units':[{'kind':'tag','text':'red cup'}]}]})},'finish_reason':'stop'}]}));await request.response.close();});
  const template='有效语义单元 50–150；Tag 65–75%';
  final settings=AppSettings(proxyMode:'direct',visionApiUrl:'http://127.0.0.1:${server.port}',visionApiModel:'synthetic',reversePromptSkillVersion:'1.0.0',reversePromptTemplates:{'mixed':template},promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  final r=await NaiApi().reversePrompt(settings:settings,apiKey:'synthetic-only',image:Uint8List.fromList([137,80,78,71]),mode:ReversePromptMode.mixed,scope:ReversePromptScope.full,hint:'',knownCharacter:false,systemTemplate:template);
  expect(r.ok,true,reason:r.message);expect(r.text,'red cup');expect(r.message,contains('检查未通过'));expect(calls,1);
 });
 test('reverse warning draft reaches current editor and history',()async{
  final app=AppState(storage:_Vault(),api:_DraftApi());addTearDown(app.dispose);app.promptTemplates=await PromptTemplateLibrary.load();app.workbenchImage=WorkingImage(filePath:File('assets/icon/app_icon.png').absolute.path,width:1,height:1);
  final job=await app.reversePrompt();expect(job!.status,TextToolJobStatus.done);expect(app.reverseResult,'red cup');expect(app.reverseHistory.single.result,'red cup');expect(app.reverseResultWarning,warning);
 });
 testWidgets('reverse warning is readable next to result and clears after editing',(tester)async{
  final app=AppState();addTearDown(app.dispose);app.promptTemplates=(await tester.runAsync(PromptTemplateLibrary.load))!;app.reverseResult='red cup';app.reverseResultWarning=warning;
  await tester.pumpWidget(ChangeNotifierProvider.value(value:app,child:const MaterialApp(home:InspectScreen(kind:InspectPageKind.reverse))));await tester.pumpAndSettle();
  await tester.scrollUntilVisible(find.text(warning),250,scrollable:find.byType(Scrollable).first);await tester.pumpAndSettle();expect(find.text(warning),findsOneWidget);
  final field=find.byWidgetPredicate((w)=>w is TextField&&w.controller?.text=='red cup');await tester.ensureVisible(field);await tester.enterText(field,'blue cup');await tester.pump();expect(app.reverseResultWarning,isEmpty);expect(find.text(warning),findsNothing);expect(tester.takeException(),isNull);
 });
 test('legacy typed conversion retains draft and warnings while strict reverse is unchanged',(){
  final protocol=ReverseTemplateProtocol.resolve('有效语义单元 50–150；Tag 65–75%',ReversePromptMode.mixed,false,conversion:true)!;
  final raw=jsonEncode({'segments':[{'units':[{'kind':'tag','text':'red cup'}]}]});
  expect(()=>protocol.parse(raw),throwsFormatException);
  final draft=protocol.parse(raw,validationWarningOnly:true);expect(draft.prompt,'red cup');expect(draft.warnings.join(''),contains('检查未通过'));
  for(final raw in ['{}','{bad','{"segments":[]}','{"segments":[{"units":[{"kind":"tag"}]}]}']){expect(()=>protocol.parse(raw,validationWarningOnly:true),throwsFormatException);}
  for(final text in ['信息不足：请补充',"I'm sorry, I cannot help.",'a'*60001]){expect(()=>protocol.parse(jsonEncode({'segments':[{'units':[{'kind':'tag','text':text}]}]}),validationWarningOnly:true),throwsFormatException);}
 });
 test('legacy conversion API returns typed short prompt with warning in one request',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;
  server.listen((request)async{calls++;await utf8.decoder.bind(request).join();request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'choices':[{'message':{'content':jsonEncode({'segments':[{'units':[{'kind':'tag','text':'red cup'}]}]})},'finish_reason':'stop'}]}));await request.response.close();});
  const template='有效语义单元 50–150；Tag 65–75%';
  final settings=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'synthetic',convertPromptSkillVersion:'1.0.0',convertPromptTemplates:{'mixed':template},promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  final result=await NaiApi().convertPrompt(settings:settings,apiKey:'synthetic-only',text:'红色杯子',mode:ReversePromptMode.mixed,knownCharacter:false,systemTemplate:template);
  expect(result.ok,true,reason:result.message);expect(result.text,'red cup');expect(result.message,contains('检查未通过'));expect(calls,1);
 });
 test('mobile conversion HTTP error never becomes a warning-only prompt',()async{
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);var calls=0;
  server.listen((request)async{calls++;await utf8.decoder.bind(request).join();request.response.statusCode=503;request.response.headers.contentType=ContentType.json;request.response.write(jsonEncode({'error':{'message':'synthetic unavailable'}}));await request.response.close();});
  final settings=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'synthetic',promptCodexEnhanceEnabled:false,tagServerEnabled:false);
  final result=await NaiApi().convertPrompt(settings:settings,apiKey:'synthetic-only',text:'红色杯子',mode:ReversePromptMode.tags,knownCharacter:false,systemTemplate:'unused');
  expect(result.ok,false);expect(result.text,isEmpty);expect(calls,1);
 });
 testWidgets('conversion warning remains beside applicable draft, not reverse UI, and clears on manual edit',(tester)async{
  final app=AppState();addTearDown(app.dispose);app.promptTemplates=(await tester.runAsync(PromptTemplateLibrary.load))!;app.convertResult='red cup';app.convertResultWarning=warning;
  Widget panel(InspectPageKind kind)=>ChangeNotifierProvider.value(value:app,child:MaterialApp(home:InspectScreen(kind:kind)));
  await tester.pumpWidget(panel(InspectPageKind.convert));await tester.pumpAndSettle();
  await tester.scrollUntilVisible(find.text(warning),250,scrollable:find.byType(Scrollable).first);await tester.pumpAndSettle();
  expect(find.text(warning),findsOneWidget);expect(find.byIcon(Icons.warning_amber_rounded),findsOneWidget);
  final resultField=find.byWidgetPredicate((w)=>w is TextField&&w.controller?.text=='red cup');
  await tester.ensureVisible(resultField);await tester.enterText(resultField,'blue cup');await tester.pump();expect(app.convertResultWarning,isEmpty);expect(find.text(warning),findsNothing);
  app.convertResultWarning=warning;await tester.pumpWidget(panel(InspectPageKind.reverse));await tester.pumpAndSettle();expect(find.text(warning),findsNothing);expect(tester.takeException(),isNull);
 });
}
