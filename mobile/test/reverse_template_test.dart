import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/prompt_mode.dart';
import 'package:novelai_mobile/services/nai_api.dart';

Map<String,dynamic> sample()=>{'segments':[{'units':[
  for(var i=0;i<42;i++){'kind':'tag','text':i==0?'1girl':'fixture tag $i'},
  for(var i=0;i<18;i++){'kind':'natural','text':'her visible sleeve detail number $i'},
]}]};
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global=null; // Only this file's loopback fixture server is contacted.
  final shared=jsonDecode(File('../tests/fixtures/reverse-template-contract.json').readAsStringSync());
  for(final fixture in shared['cases']) {
    test('cross-platform contract: ${fixture['name']}',(){
      final protocol=ReverseTemplateProtocol.resolve(shared['template'],ReversePromptMode.mixed,fixture['known'])!;
      if(fixture['ok']==true) {
        expect(()=>protocol.parse(fixture['raw']),returnsNormally);
      } else {
        expect(()=>protocol.parse(fixture['raw']),throwsA(isA<Exception>()));
      }
    });
  }
  test('runtime identity instruction agrees with V5 and V4.5 instead of always using 80/20',(){
    expect(knownCharacterRuntimeInstruction(ReversePromptMode.mixed,'reverse',true,'v5'),contains('70% Danbooru tag + 30%'));
    expect(knownCharacterRuntimeInstruction(ReversePromptMode.mixed,'reverse',true,'v4.5'),contains('80% Danbooru tag + 20%'));
  });
  const template='SAVED TEMPLATE 有效语义单元 50–150；Tag 65–75%';
  test('exact duplicates do not cause paid repair loops or inflate effective counts',(){
    final protocol=ReverseTemplateProtocol.resolve(template,ReversePromptMode.mixed,false)!;
    final envelope=sample();envelope['segments'][0]['units'].add({'kind':'tag','text':'1girl'});
    expect(protocol.parse(jsonEncode(envelope)).prompt.split(','),hasLength(60));
    envelope['segments'][0]['units'].add({'kind':'tag','text':'1.5::1girl::'});
    expect(()=>protocol.parse(jsonEncode(envelope)),throwsFormatException);
  });
  test('actual bundled mixed template uses the desktop unit contract',() async {
    final library=await PromptTemplateLibrary.load();
    final protocol=ReverseTemplateProtocol.resolve(library.reverse['mixed']!,ReversePromptMode.mixed,false)!;
    expect(protocol.parse(jsonEncode(sample())).prompt.split(','),hasLength(60));
  });
  test('both identity versions are independently checked',(){
    final protocol=ReverseTemplateProtocol.resolve(template,ReversePromptMode.mixed,true)!;
    expect(()=>protocol.parse(jsonEncode({'namePrompt':sample(),'featurePrompt':{'segments':[{'units':[{'kind':'tag','text':'1girl'}]}]}})),throwsFormatException);
    final result=protocol.parse(jsonEncode({'namePrompt':sample(),'featurePrompt':sample()}));
    expect(result.variants!.namePrompt.split(','),hasLength(60));
    expect(result.variants!.featurePrompt.split(','),hasLength(60));
  });
  for(final repair in [true,false]) {
    test('real HTTP reverse ${repair?'repairs once':'fails closed'} with selected template and original image',() async {
      final server=await HttpServer.bind(InternetAddress.loopbackIPv4,0);addTearDown(server.close);
      final requests=<dynamic>[];
      server.listen((request) async {
        requests.add(jsonDecode(await utf8.decoder.bind(request).join()));
        final content=repair&&requests.length>1?jsonEncode({'namePrompt':sample(),'featurePrompt':sample()}):'1girl, solo, cosplay';
        request.response.headers.contentType=ContentType.json;
        request.response.write(jsonEncode({'choices':[{'message':{'content':content},'finish_reason':'stop'}]}));
        await request.response.close();
      });
      final settings=AppSettings(proxyMode:'direct',visionApiUrl:'http://127.0.0.1:${server.port}',visionApiModel:'fixture',reversePromptTemplates:{'mixed':template},reverseConvertDshEnabled:true);
      final result=await NaiApi().reversePrompt(settings:settings,apiKey:'fixture-only',image:Uint8List.fromList([1,2,3]),mode:ReversePromptMode.mixed,scope:ReversePromptScope.full,hint:'visible scene',knownCharacter:true,systemTemplate:template);
      expect(result.ok,repair);expect(requests,hasLength(repair?2:3));
      expect(requests.first['max_tokens'],7000);
      expect(requests.first['messages'][0]['content'],contains('SAVED TEMPLATE'));
      expect(requests.last['messages'][1]['content'][0],requests.first['messages'][1]['content'][0]);
      if(!repair)expect(result.text,isEmpty);
    });
  }
}
