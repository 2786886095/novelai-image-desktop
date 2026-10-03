import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
void main(){
 Map<String,dynamic> envelope()=>{'segments':[{'units':[for(var i=0;i<42;i++){'kind':'tag','text':i==0?'1girl':i==1?'black hair':i==2?'blue eyes':i==3?'upper body':'distinct tag $i'},for(var i=0;i<18;i++){'kind':'natural','text':'her visible sleeve catches light $i'}]}]};
 const template='有效语义单元 50–150；Tag 65–75%';
 test('actual hair-color edit cannot pass with old hair',(){
  final p=ReverseTemplateProtocol.resolve(template,ReversePromptMode.mixed,false)!;
  expect(()=>p.parse(jsonEncode(envelope()),source:'1girl, black hair, blue eyes, upper body\n只将头发颜色改为白色，保持蓝眼睛和其他设定不变。'),throwsA(isA<FormatException>().having((e)=>e.message,'message',contains('white hair'))));
 });
 test('eye-color edit takes effect; prohibited hair edit does not',(){
  expect(explicitAttributeColor('black hair, blue eyes\n将眼睛颜色改为红色，不要把头发颜色改为白色。','eyes'),['red']);
  expect(explicitAttributeColor('black hair, blue eyes\n将眼睛颜色改为红色，不要把头发颜色改为白色。','hair'),['black']);
 });
 test('pure-tag reverse is count-checked and cannot succeed at46',(){
  final p=ReverseTemplateProtocol.resolve('有效语义单元 50–150\n当前模式：纯 Tag',ReversePromptMode.tags,false)!;
  expect(()=>p.parse(jsonEncode({'segments':[{'units':[for(var i=0;i<46;i++){'kind':'tag','text':'visible tag $i'}]}]})),throwsFormatException);
  expect(p.parse(jsonEncode({'segments':[{'units':[for(var i=0;i<60;i++){'kind':'tag','text':'visible tag $i'}]}]})).prompt.split(','),hasLength(60));
 });
 test('text conversion does not inherit image-only evidence restrictions',(){
  const template='有效语义单元 50–150\n当前模式：纯 Tag';
  final converted=ReverseTemplateProtocol.resolve(template,ReversePromptMode.tags,false,conversion:true)!;
  expect(converted.instruction,contains('未限定的次要细节'));
  expect(converted.instruction,contains('单人严格只有一个 segment'));
  expect(converted.instruction,isNot(contains('反推只使用图像可见证据')));
  expect(ReverseTemplateProtocol.resolve(template,ReversePromptMode.tags,false)!.instruction,contains('反推只使用图像可见证据'));
 });
}
