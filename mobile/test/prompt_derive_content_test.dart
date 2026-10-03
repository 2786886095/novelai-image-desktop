import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
void main(){TestWidgetsFlutterBinding.ensureInitialized();final cases=jsonDecode(File(const String.fromEnvironment('PROMPT_DERIVE_CONTENT_INPUT',defaultValue:'../tests/fixtures/prompt-derive-content.json')).readAsStringSync()) as List;
for(final mode in [ReversePromptMode.tags,ReversePromptMode.natural]){for(final c in cases){test(mode.value+' '+c['name'],() async{final lib=await PromptTemplateLibrary.load(),result=lib.derive(c['source'],mode);for(final detail in c['required']){expect(result,contains(detail));}expect(result,isNot(matches(RegExp(r'(?:Tag|自然语言)\s*(?:占|保持约)\s*\d+(?:[–—-]\d+)?%'))));});}}
for(final task in ['reverse','convert']){for(final mode in [ReversePromptMode.tags,ReversePromptMode.natural]){test(task+' '+mode.value+' saved mixed facts survive real resolver',() async{final lib=await PromptTemplateLibrary.load(),mixed=cases.map((c)=>c['source']).join('\n'),saved={'mixed':mixed},before=jsonEncode(saved);final result=lib.resolve(task,mode,saved,templateVersion:'v5');for(final c in cases){for(final detail in c['required']){expect(result,contains(detail));}}expect(jsonEncode(saved),before);});}}
test('mixed remains byte-identical',() async{final lib=await PromptTemplateLibrary.load();for(final c in cases){expect(lib.derive(c['source'],ReversePromptMode.mixed),c['source']);}});}
