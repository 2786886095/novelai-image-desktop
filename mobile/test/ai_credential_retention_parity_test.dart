import 'dart:convert';
import 'dart:io';
import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/services/storage.dart';
import 'package:novelai_mobile/state/app_state.dart';
class _Storage extends Storage{
 @override Future<String?> getConvertKey()async=>'FIXTURE_ONLY';
 @override Future<void> setConvertHistory(List<TextToolHistoryItem> items)async{}
}
class _Api extends NaiApi{
 final complete=Completer<AiTextResult>();
 @override Future<AiTextResult> convertPrompt({required AppSettings settings,required String apiKey,required String text,required ReversePromptMode mode,required bool knownCharacter,required String systemTemplate})=>complete.future;
}
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 const key='FIXTURE_CREDENTIAL_A+/B?=12';
 for(final status in [400,200]){
  test('actual HTTP $status does not echo current configured AI key in diagnostics',()async{
   HttpOverrides.global=null;final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(()=>server.close(force:true));var calls=0;
   final echo='Provider echo $key ${Uri.encodeComponent(key)}';
   server.listen((r)async{calls++;await r.drain<void>();r.response.statusCode=status;r.response.headers.contentType=ContentType.json;r.response.write(status==200?jsonEncode({'choices':[{'message':{'content':echo},'finish_reason':'stop'}]}):jsonEncode({'error':{'message':echo}}));await r.response.close();});
   final api=NaiApi(),settings=AppSettings(proxyMode:'direct');
   final result=await api.runTextAi(settings:settings,apiKey:key,apiUrl:'http://127.0.0.1:${server.port}',model:'fixture',system:'Neutral system',user:'Neutral synthetic input');
   expect(calls,1);final log=api.aiCallLog.single;
   final diagnostics='${result.ok?'':result.message} ${log.systemPrompt} ${log.userText} ${log.response}';
   expect(diagnostics, isNot(contains(key)));expect(diagnostics,isNot(contains(Uri.encodeComponent(key))));
   if(status==200)expect(result.text,echo,reason:'never redact actual successful prompt output');
  });
 }
 // Prior raw variant retention is a legacy protocol fixture, not a V2 catalog fixture.
 test('conversion failure preserves prior variants, prompt and history',()async{
  final api=_Api(),a=AppState(api:api,storage:_Storage())..settings=AppSettings(convertPromptSkillVersion:'1.0.0')..convertInput='new input'..convertResult='prior prompt'..convertResultVariants=const PromptVariants(namePrompt:'prior name',featurePrompt:'prior feature');addTearDown(a.dispose);
  final running=a.convertPrompt();await Future<void>.delayed(Duration.zero);expect(a.convertResultVariants?.namePrompt,'prior name');
  api.complete.complete(const AiTextResult(ok:false,message:'synthetic failure'));await running;
  expect(a.convertResult,'prior prompt');expect(a.convertResultVariants?.featurePrompt,'prior feature');expect(a.convertHistory,isEmpty);
 });
}
