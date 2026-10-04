import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
void main(){
 final fixture=jsonDecode(File('../tests/fixtures/prompt-visible-evidence.json').readAsStringSync()) as Map<String,dynamic>;
 final actual=jsonEncode({'segments':[{'units':(fixture['actualPrompt'] as String).split(',').map((s)=>{'kind':'tag','text':s.trim()}).toList()}]});
 const loose=ReverseTemplateProtocol(1,150,false,true,tagOnly:true);
 const strict=ReverseTemplateProtocol(50,150,false,true,tagOnly:true);
 test('recounts observed rock/stone overlap without invented facts',()=>expect(loose.parse(actual).prompt.split(',').length,47));
 test('rejects observed rich reverse below hard50 after cleanup',()=>expect(()=>strict.parse(actual),throwsA(predicate((e)=>e.toString().contains('47')))));
 test('bare material alternatives share identity',()=>expect(promptUnitIdentity('tag','rock'),promptUnitIdentity('tag','stone')));
 test('qualified material and object remain distinct',()=>expect(promptUnitIdentity('tag','stone floor'),isNot(promptUnitIdentity('tag','rock'))));
 test('different weights remain distinct',()=>expect(promptUnitIdentity('tag','1.3::rock ::'),isNot(promptUnitIdentity('tag','1.5::stone ::'))));
 test('natural unit text is not reinterpreted',()=>expect(promptUnitIdentity('natural','rock'),isNot(promptUnitIdentity('natural','stone'))));
 test('reverse policy distinguishes lighting from visible source',()=>expect(strict.instruction,contains(fixture['policy']['lighting'])));
 test('reverse policy retains time uncertainty',()=>expect(strict.instruction,contains(fixture['policy']['ambiguousTime'])));
 test('text conversion has no image-only time restriction',()=>expect(const ReverseTemplateProtocol(50,150,false,true,tagOnly:true,conversion:true).instruction,isNot(contains(fixture['policy']['ambiguousTime']))));
 test('different character segments retain separate rocks',(){
  final multi=jsonEncode({'segments':[{'units':[{'kind':'tag','text':'2girls'}]},{'units':[{'kind':'tag','text':'girl'},{'kind':'tag','text':'rock'}]},{'units':[{'kind':'tag','text':'girl'},{'kind':'tag','text':'stone'}]}]});
  expect(loose.parse(multi).prompt,contains('rock | girl, stone'));
 });
}
