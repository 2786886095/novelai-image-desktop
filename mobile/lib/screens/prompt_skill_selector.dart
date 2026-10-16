import 'package:flutter/material.dart';
import '../ui/studio_dropdown.dart';
import '../i18n/app_locales.dart';

/// Two independent axes: prompt skill edition and target generation model.
/// Selecting V4.5 visibly selects 1.0.0; V2 is never relabelled as V4.5.
class PromptSkillSelector extends StatelessWidget {
  final String model,edition;
  final Object? language;
  final void Function(String model,String edition)? onChanged;
  const PromptSkillSelector({super.key,required this.model,required this.edition,
    required this.language,required this.onChanged});
  @override
  Widget build(BuildContext context){
    final zh=normalizeAppLocaleCode(language).startsWith('zh');
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      StudioDropdownButtonFormField<String>(key:ValueKey('prompt-skill-model-$model-$edition'),
        value:model,isExpanded:true,decoration:InputDecoration(labelText:zh?'目标生图模型':'Target generation model'),
        items:const[DropdownMenuItem(value:'v5',child:Text('NovelAI V5 Full')),DropdownMenuItem(value:'v4.5',child:Text('NovelAI V4.5'))],
        onChanged:onChanged==null?null:(v){if(v!=null)onChanged!(v,v=='v4.5'?'1.0.0':edition);}),
      const SizedBox(height:8),
      StudioDropdownButtonFormField<String>(key:ValueKey('prompt-skill-edition-$model-$edition'),
        value:edition,isExpanded:true,decoration:InputDecoration(labelText:zh?'默认技能版本':'Default skill version'),
        items:[const DropdownMenuItem(value:'1.0.0',child:Text('1.0.0')),
          DropdownMenuItem(value:'2.0.0',enabled:model=='v5',child:const Text('2.0.0 · V5 Full'))],
        onChanged:onChanged==null?null:(v){if(v!=null)onChanged!(model,v);}),
      const SizedBox(height:6),
      Text(zh?(model=='v4.5'?'V4.5 使用 1.0.0；2.0.0 六套模板目前仅面向 V5 Full。':'2.0.0：六套独立模板；1.0.0：保留旧模板及自定义内容。此选择不修改当前生图参数；软件仅检查格式，可见事实与来源需人工复核。')
        :(model=='v4.5'?'V4.5 uses 1.0.0. The six 2.0.0 templates target V5 Full only.':'2.0.0: six independent templates. 1.0.0 retains legacy/custom templates. This does not change generation settings; format checks do not prove factual accuracy.'),style:Theme.of(context).textTheme.bodySmall),
    ]);
  }
}
