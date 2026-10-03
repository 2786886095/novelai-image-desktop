import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/services/nai_api.dart';

void main(){
 TestWidgetsFlutterBinding.ensureInitialized();HttpOverrides.global=null;
 final fixture=jsonDecode(File('../tests/fixtures/prompt-edit-saved-mixed.json').readAsStringSync());
 Map<String,dynamic> envelope({bool wrongEyes=false,bool changedHair=false})=>{'segments':[{'units':[
  for(var i=0;i<42;i++){'kind':'tag','text':i==0?'1girl':i==1?(changedHair?'white hair':'black hair'):i==2?(wrongEyes?'red eyes':'blue eyes'):i==3?'upper body':'fixture tag $i'},
  for(var i=0;i<18;i++){'kind':'natural','text':'her visible sleeve catches light $i'},
 ]}]};
 test('editor mode and independent overlays round-trip without changing converter mode',(){
  final s=AppSettings.fromJson({'convertPromptMode':'tags'});expect(s.promptAssistantMode,'mixed');
  s.promptAssistantMode='natural';s.promptOptimizeTemplate='MY OPTIMIZE';s.promptAssistantTemplate='MY CUSTOM';
  final restored=AppSettings.fromJson(jsonDecode(jsonEncode(s.toJson())));expect(restored.promptAssistantMode,'natural');expect(restored.convertPromptMode,'tags');expect(restored.promptOptimizeTemplate,'MY OPTIMIZE');expect(restored.promptAssistantTemplate,'MY CUSTOM');
 });
 for(final task in ['reverse','convert']){for(final mode in [ReversePromptMode.tags,ReversePromptMode.natural]){
  test('$task ${mode.value} inherits the saved mixed source; custom override is retained',() async{
   final lib=await PromptTemplateLibrary.load();final overrides={'mixed':fixture['template'] as String};
   final result=lib.resolve(task,mode,overrides,templateVersion:'v5');expect(result,lib.derive(fixture['template'],mode));
   expect(result,contains(mode==ReversePromptMode.tags?'不输出自然语言句子':'不要求 Tag 数量'));
   overrides[mode.value]='MY CUSTOM';expect(lib.resolve(task,mode,overrides,templateVersion:'v5'),'MY CUSTOM');
  });
 }}
 test('same-line ratio keeps the pure tag bound',() async{
  final lib=await PromptTemplateLibrary.load();final result=lib.derive('有效语义单元 50–150；Tag 65–75%',ReversePromptMode.tags);
  expect(result,contains('有效语义单元 50–150'));expect(result,isNot(contains('Tag 65–75%')));
 });
 for(final kind in ['optimize','custom']){for(final outcome in ['short','wrong-eyes','valid','changed-hair']){
  if(kind=='optimize'&&outcome=='changed-hair')continue;
  test('real loopback HTTP $kind $outcome is checked before preview, no image endpoint',() async{
   final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);final requests=<Map<String,dynamic>>[];
   server.listen((request) async{
    expect(request.uri.path,endsWith('/chat/completions'));
    requests.add(jsonDecode(await utf8.decoder.bind(request).join()));
    final content=outcome=='short'?'1girl, singing, microphone':jsonEncode(envelope(wrongEyes:outcome=='wrong-eyes',changedHair:outcome=='changed-hair'));
    request.response.headers.contentType=ContentType.json;
    request.response.write(jsonEncode({'choices':[{'message':{'content':content},'finish_reason':'stop'}]}));await request.response.close();
   });
   final s=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'fixture',promptAssistantTemplate:'KEEP OVERLAY POLICY');
   final result=await NaiApi().assistPrompt(settings:s,apiKey:'loopback-fixture-only',currentPrompt:fixture['source'],instruction:outcome=='changed-hair'?'把发色改为白发':'芙宁娜在唱歌',kind:kind,mode:ReversePromptMode.mixed,templateVersion:'v5',conversionTemplate:fixture['template']);
   final pass=['valid','changed-hair'].contains(outcome);expect(result.ok,pass,reason:result.message);expect(requests.length,pass?1:3);
   expect((requests.first['messages'] as List).first['content'],contains(fixture['template']));
   if(kind=='custom')expect((requests.first['messages'] as List).first['content'],contains('KEEP OVERLAY POLICY'));
   if(pass){expect(result.text.split(','),hasLength(60));expect(result.text,contains('blue eyes'));}else{expect(result.text,isEmpty);expect(result.message,contains('未通过模板校验'));}
  });
 }}
}
