import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
void main(){
 final fixture=jsonDecode(File('../tests/fixtures/prompt-unit-redundancy.json').readAsStringSync()) as Map<String,dynamic>;
 const loose=ReverseTemplateProtocol(1,150,false,true,tagOnly:true);
 const strict=ReverseTemplateProtocol(50,150,false,true,tagOnly:true);
 for(final sample in fixture['cases'] as List){test('whole-unit redundancy: ${sample['name']}',()=>expect(loose.parse(jsonEncode({'segments':sample['segments']})).prompt,(sample['expected'] as List).map((s)=>(s as List).join(', ')).join(' | ')));}
 test('does not reinterpret natural units',()=>expect(promptUnitIdentity('natural','mist'),isNot(promptUnitIdentity('natural','misty'))));
 test('rejects all-label segment after cleanup',()=>expect(()=>loose.parse(jsonEncode({'segments':[{'units':[{'kind':'tag','text':'foreground'},{'kind':'tag','text':'background'}]}]})),throwsFormatException));
 test('does not pad49 unique units up to hard50',(){
  final units=['mist','misty',for(var i=0;i<48;i++)'distinct tag $i'].map((text)=>{'kind':'tag','text':text}).toList();
  expect(()=>strict.parse(jsonEncode({'segments':[{'units':units}]})),throwsA(isA<FormatException>().having((e)=>e.message,'message',contains('有效单元 49'))));
 });
 test('retains explicit layer weight identity',()=>expect(promptUnitIdentity('tag','1.3::foreground ::'),isNot(promptUnitIdentity('tag','foreground'))));
 test('rejects weighted empty layer without deleting its weight',()=>expect(()=>loose.parse(jsonEncode({'segments':[{'units':[{'kind':'tag','text':'1.3::foreground ::'}]}]})),throwsA(isA<FormatException>().having((e)=>e.message,'message',contains('层级标签缺少具体事实')))));
 test('empty role segment gives controlled template error',()=>expect(()=>loose.parse(jsonEncode({'segments':[{'units':[{'kind':'tag','text':'2girls'}]},{'units':[{'kind':'tag','text':'foreground'}]},{'units':[{'kind':'tag','text':'background'}]}]})),throwsFormatException));
}
