import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';

Map<String,dynamic> envelope({bool wrongHair=false}) => {'segments':[{'units':[
  for(var i=0;i<42;i++){'kind':'tag','text': switch(i) {0=>'1girl',1=>wrongHair?'black hair':'white hair',2=>'red eyes',3=>'upper body',_=>'test tag $i'}},
  for(var i=0;i<18;i++){'kind':'natural','text':'her visible sleeve detail number $i'},
]}]};
void main() {
 TestWidgetsFlutterBinding.ensureInitialized();
 HttpOverrides.global=null;
 const template='SAVED CONVERT TEMPLATE 有效语义单元 50–150；Tag 65–75%';
 final facts=jsonDecode(File('../tests/fixtures/prompt-explicit-facts.json').readAsStringSync());
 for(final fixture in facts) {
  test('shared explicit facts: ${fixture['name']}',(){
   final e=envelope(),units=envelope()['segments'][0]['units'];
   for(var i=0;i<42;i++){units[i]['text']=i<(fixture['tags'] as List).length?fixture['tags'][i]:'fixture tag $i';}
   e['segments'][0]['units']=units;
   final p=ReverseTemplateProtocol.resolve(template,ReversePromptMode.mixed,false)!;
   if(fixture['ok']==true) {expect(()=>p.parse(jsonEncode(e),source:fixture['source']),returnsNormally);}
   else {expect(()=>p.parse(jsonEncode(e),source:fixture['source']),throwsFormatException);}
  });
 }
 test('known-character variants both preserve explicit user facts',(){
  final p=ReverseTemplateProtocol.resolve(template,ReversePromptMode.mixed,true)!;
  expect(()=>p.parse(jsonEncode({'namePrompt':envelope(),'featurePrompt':envelope(wrongHair:true)}),source:'白发女性'),throwsFormatException);
 });
 for(final repair in [true,false]) {
  test('conversion ${repair?'repairs once':'fails closed'} through saved typed template',() async {
   final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);
   final requests=<dynamic>[];
   server.listen((request) async {
    requests.add(jsonDecode(await utf8.decoder.bind(request).join()));
    final content=repair&&requests.length>1?jsonEncode(envelope()):'1girl, black hair, full body';
    request.response.headers.contentType=ContentType.json;
    request.response.write(jsonEncode({'choices':[{'message':{'content':content},'finish_reason':'stop'}]}));
    await request.response.close();
   });
   final settings=AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'fixture',convertPromptTemplates:{'mixed':template},promptCodexEnhanceEnabled:false,promptRuleAutoRepairEnabled:false,tagServerEnabled:false);
   final result=await NaiApi().convertPrompt(settings:settings,apiKey:'fixture-only',text:'单人白发红眼女性，上半身',mode:ReversePromptMode.mixed,knownCharacter:false,systemTemplate:'STALE CALLER TEMPLATE');
   expect(result.ok,repair);expect(requests,hasLength(repair?2:3));
   expect(requests.first['messages'][0]['content'],contains('SAVED CONVERT TEMPLATE'));
   expect(requests.first['messages'][0]['content'],isNot(contains('STALE CALLER TEMPLATE')));
   if(repair) {expect(result.text.split(','),hasLength(60));expect(result.text,contains('white hair'));}
   else {expect(result.text,isEmpty);expect(result.message,contains('模板校验'));}
  });
 }
}
