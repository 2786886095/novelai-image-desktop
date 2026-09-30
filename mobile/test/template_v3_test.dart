import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/prompt_templates.dart';
import 'package:novelai_mobile/prompts/reverse_template.dart';
import 'package:novelai_mobile/models/nai_models.dart';
void main(){
 TestWidgetsFlutterBinding.ensureInitialized();
 test('bundled v3 keeps global bounds, sparse conversion, and style exclusions',()async{
  final library=await PromptTemplateLibrary.load();
  final reverse=ReverseTemplateProtocol.resolve(library.reverse['mixed']!,ReversePromptMode.mixed,false)!;
  final convert=ReverseTemplateProtocol.resolve(library.convert['mixed']!,ReversePromptMode.mixed,false)!;
  expect(reverse.min,50);expect(reverse.max,150);expect(reverse.allowStyleTags,false);
  expect(convert.min,25);expect(convert.max,150);expect(convert.allowStyleTags,false);
 });
 test('retired comic template is not exposed by settings',(){
  expect(File('lib/screens/settings_screen.dart').readAsStringSync(),isNot(contains('settingsDetailText.comicTemplateTitle')));
 });
}
