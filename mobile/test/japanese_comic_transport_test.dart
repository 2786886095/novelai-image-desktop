import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/generation_scope.dart';

void main() {
 TestWidgetsFlutterBinding.ensureInitialized();
 HttpOverrides.global=null;
 setUp(()=>SharedPreferences.setMockInitialValues({}));
 Future<({HttpServer server,List<Map<String,dynamic>> requests})> fixture(String text,{String finish='stop',int status=200}) async {
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);
  final requests=<Map<String,dynamic>>[];
  server.listen((request) async {
   expect(request.method,'POST');expect(request.uri.path,'/chat/completions');
   expect(request.headers.contentType?.mimeType,'application/json');
   expect(request.headers.value('authorization'),'Bearer synthetic-test-only');
   requests.add(jsonDecode(await utf8.decoder.bind(request).join()) as Map<String,dynamic>);
   request.response.statusCode=status;request.response.headers.contentType=ContentType.json;
   request.response.write(jsonEncode({'choices':[{'message':{'content':text},'finish_reason':finish}]}));
   await request.response.close();
  });
  addTearDown(()=>server.close(force:true));return(server:server,requests:requests);
 }
 AppSettings settings(HttpServer server)=>AppSettings(proxyMode:'direct',convertApiUrl:'http://127.0.0.1:${server.port}',visionApiUrl:'http://127.0.0.1:${server.port}',convertApiModel:'fixture-model',visionApiModel:'fixture-vision',convertPromptSkillVersion:'3.0.0',reversePromptSkillVersion:'3.0.0');
 final catalog=(jsonDecode(File('../shared/prompt-skill-catalog-v3.json').readAsStringSync()) as Map)['templates'] as List;
 for(final task in ['reverse','convert']) {
  for(final mode in ReversePromptMode.values) {
   test('actual V3 $task ${mode.value} transport selects only its exact independent body',() async {
    final f=await fixture('A person stands beside a red bicycle.');final s=settings(f.server),api=NaiApi();
    final body=catalog.firstWhere((r)=>r['task']==task&&r['mode']==mode.value)['body'] as String;
    final result=task=='reverse'
     ?await api.reversePrompt(settings:s,apiKey:'synthetic-test-only',image:Uint8List.fromList([137,80,78,71]),mode:mode,scope:ReversePromptScope.full,hint:'bicycle',knownCharacter:false,systemTemplate:body)
     :await api.convertPrompt(settings:s,apiKey:'synthetic-test-only',text:'An adult beside a red bicycle',mode:mode,knownCharacter:false,systemTemplate:body);
    expect(result.ok,true);expect(result.text,'A person stands beside a red bicycle.');expect(f.requests,hasLength(1));
    final request=f.requests.single,system=request['messages'][0]['content'] as String;
    expect(system,startsWith(body.replaceAll('{{input}}','<provided in user message>').replaceAll('{{image}}','<uploaded image>')));
    expect(system,isNot(contains('技能版本 2.0.0 运行时边界')));expect(request.containsKey('tools'),false);
    expect(request['model'],task=='reverse'?'fixture-vision':'fixture-model');
   });
  }
 }
 test('comic transport sends exact comic system and configured model, without image wrappers',() async {
  final f=await fixture('First page prompt\nSecond page prompt'),s=settings(f.server);
  final response=await NaiApi().comicPromptText(settings:s,apiKey:'synthetic-test-only',system:'COMIC SOURCE ONLY {{input}}',user:'{"pages":2}',recommend:false);
  expect(response.ok,true);expect(response.text,'First page prompt\nSecond page prompt');expect(f.requests,hasLength(1));
  expect(f.requests.single['messages'],[{'role':'system','content':'COMIC SOURCE ONLY {{input}}'},{'role':'user','content':'{"pages":2}'}]);
  expect(f.requests.single['max_tokens'],16000);expect(f.requests.single['model'],'fixture-model');
 });
 test('length-truncated comic response is retained literally without an automatic retry',() async {
  final f=await fixture('partial raw\npage',finish:'length'),s=settings(f.server);
  final response=await NaiApi().comicPromptText(settings:s,apiKey:'synthetic-test-only',system:'S',user:'U',recommend:false);
  expect(response.ok,false);expect(response.truncated,true);expect(response.text,'partial raw\npage');expect(f.requests,hasLength(1));
 });
 test('empty and HTTP error comic replies never trigger automatic resubmission',() async {
  for(final status in [200,500]) {
   final f=await fixture('',finish:'length',status:status),s=settings(f.server);
   final response=await NaiApi().comicPromptText(settings:s,apiKey:'synthetic-test-only',system:'S',user:'U',recommend:true);
   expect(response.ok,false);expect(f.requests,hasLength(1));expect(f.requests.single['max_tokens'],3000);
  }
 });
 test('cancelling one owner does not cancel the other conversion request',() async {
  final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));
  final entered=Completer<void>(),pending=<HttpRequest>[];
  server.listen((r) async {await utf8.decoder.bind(r).join();pending.add(r);if(pending.length==2)entered.complete();});
  final api=NaiApi(),s=settings(server),first=GenerationScope(),second=GenerationScope();
  final a=first.run(()=>api.comicPromptText(settings:s,apiKey:'synthetic-test-only',system:'S1',user:'U1',recommend:true));
  final b=second.run(()=>api.comicPromptText(settings:s,apiKey:'synthetic-test-only',system:'S2',user:'U2',recommend:true));
  final firstCancelled=expectLater(a,throwsStateError);await entered.future.timeout(const Duration(seconds:5));first.cancel();
  for(final r in pending){try{r.response.headers.contentType=ContentType.json;r.response.write(jsonEncode({'choices':[{'message':{'content':'{"pages":2,"reason":"safe"}'},'finish_reason':'stop'}]}));await r.response.close();}catch(_){}}
  await firstCancelled;final result=await b;expect(result.ok,true);expect(second.cancelled,false);
 });
}
