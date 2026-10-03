import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
void main(){
 final shared=jsonDecode(File('../tests/fixtures/prompt-unit-aliases.json').readAsStringSync()) as Map<String,dynamic>;
 for(final fixture in shared['cases'] as List){
  test('shared unit alias contract: ${fixture['name']}',(){
   final expected=(fixture['expected'] as List).map((s)=>(s as List).join(', ')).join(' | ');
   final protocol=ReverseTemplateProtocol.resolve('有效语义单元 1–150',ReversePromptMode.tags,false)!;
   expect(protocol.parse(jsonEncode({'segments':fixture['segments']})).prompt,expected);
  });
 }
 test('cleanup cannot pad49 units to the hard50 bound',(){
  final units=['head back','head tilted back',for(var i=0;i<48;i++)'distinct tag $i'].map((text)=>{'kind':'tag','text':text}).toList();
  final protocol=ReverseTemplateProtocol.resolve('有效语义单元 50–150',ReversePromptMode.tags,false)!;
  expect(()=>protocol.parse(jsonEncode({'segments':[{'units':units}]})),throwsA(isA<FormatException>().having((e)=>e.message,'message',contains('有效单元 49'))));
 });
}
