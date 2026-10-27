import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/prompt_skill_selection.dart';
import 'package:novelai_mobile/models/nai_models.dart';
void main() {
 test('new v3 image selection is explicitly accepted', () {
  expect(()=>checkPromptSkillSelection('3.0.0','v5'),returnsNormally);
 });
 test('new v3 image selections survive actual settings serialization', () {
  final s=AppSettings(reversePromptTemplateVersion:'v5',convertPromptTemplateVersion:'v5',reversePromptSkillVersion:'3.0.0',convertPromptSkillVersion:'3.0.0');
  final restored=AppSettings.fromJson(s.toJson());
  expect(restored.reversePromptSkillVersion,'3.0.0');expect(restored.convertPromptSkillVersion,'3.0.0');
 });
 test('existing v1 v4.5 and v2 v5 remain accepted', () {
  expect(()=>checkPromptSkillSelection('1.0.0','v4.5'),returnsNormally);
  expect(()=>checkPromptSkillSelection('2.0.0','v5'),returnsNormally);
 });
 test('v3 cannot silently use the unsupported v4.5 model', () {
  expect(()=>checkPromptSkillSelection('3.0.0','v4.5'),throwsFormatException);
 });
}
