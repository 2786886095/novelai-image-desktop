import '../models/nai_models.dart';

String promptSkillEdition(AppSettings s,String kind) => switch(kind){
  'reverse'=>s.reversePromptSkillVersion,
  'convert'=>s.convertPromptSkillVersion,
  _=>s.promptAssistantSkillVersion,
};
String promptSkillModel(AppSettings s,String kind) => switch(kind){
  'reverse'=>s.reversePromptTemplateVersion,
  'convert'=>s.convertPromptTemplateVersion,
  _=>s.promptAssistantTemplateVersion,
};
void checkPromptSkillSelection(String edition,String model) {
  if(!['1.0.0','2.0.0','3.0.0'].contains(edition)||!['v5','v4.5'].contains(model))throw const FormatException('Unknown prompt skill edition or model');
  if((edition=='2.0.0'||edition=='3.0.0')&&model!='v5')throw const FormatException('技能 2.0.0 / 3.0.0 仅支持 NovelAI V5 Full；V4.5 请明确选择 1.0.0。');
}
Map<String,String> promptSkillOverrides(AppSettings s,String kind,String edition,String model) {
  checkPromptSkillSelection(edition,model);
  if(edition=='3.0.0') return const {}; // V3 custom templates live in the independent library.
  return kind=='reverse'
    ? edition=='2.0.0'?s.reversePromptTemplatesV2:model=='v4.5'?s.reversePromptTemplatesV45:s.reversePromptTemplates
    : edition=='2.0.0'?s.convertPromptTemplatesV2:model=='v4.5'?s.convertPromptTemplatesV45:s.convertPromptTemplates;
}
void selectPromptSkill(AppSettings s,String kind,String edition,String model) {
  checkPromptSkillSelection(edition,model);
  if(kind!='reverse'&&kind!='convert'&&edition=='3.0.0')throw const FormatException('提示词助手没有3.0.0附加模板。');
  if(kind=='reverse'){s.reversePromptSkillVersion=edition;s.reversePromptTemplateVersion=model;}
  else if(kind=='convert'){s.convertPromptSkillVersion=edition;s.convertPromptTemplateVersion=model;}
  else{s.promptAssistantSkillVersion=edition;s.promptAssistantTemplateVersion=model;}
}
String promptSkillOverlay(AppSettings s,String kind,String edition) {
  if(edition=='3.0.0')throw const FormatException('提示词助手没有3.0.0附加模板。');
  return edition=='2.0.0' ? kind=='optimize'?s.promptOptimizeTemplateV2:s.promptAssistantTemplateV2
    : kind=='optimize'?s.promptOptimizeTemplate:s.promptAssistantTemplate;
}
String promptSkillOverlayKey(String kind,String edition) {
  if(edition=='3.0.0')throw const FormatException('提示词助手没有3.0.0附加模板。');
  return 'prompt${kind=='optimize'?'Optimize':'Assistant'}Template${edition=='2.0.0'?'V2':''}';
}
