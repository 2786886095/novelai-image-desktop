import 'package:flutter/material.dart';
import '../ui/studio_dropdown.dart';
import '../i18n/app_locales.dart';

/// Skill edition and target generation model remain independent. V3 is only
/// offered for image conversion/reverse, not the legacy prompt-assistant overlay.
class PromptSkillSelector extends StatelessWidget {
  final String model,edition;
  final bool allowV3;
  final Object? language;
  final void Function(String model,String edition)? onChanged;
  const PromptSkillSelector({super.key,required this.model,required this.edition,
    required this.language,required this.onChanged,this.allowV3=true});
  @override
  Widget build(BuildContext context){
    final locale=normalizeAppLocaleCode(language);
    const copy={
      'zh-CN':['目标生图模型','默认技能版本','V4.5 使用 1.0.0；2.0.0 / 3.0.0 仅面向 V5 Full。','3.0.0 使用独立模板库，旧版与自定义保留。不修改当前生图参数；结果仍需人工复核。','提示词助手保留 1.0.0 / 2.0.0，3.0.0 没有助手附加模板。'],
      'zh-TW':['目標生圖模型','預設技能版本','V4.5 僅使用 1.0.0；2.0.0 / 3.0.0 僅供 V5 Full。','3.0.0 使用獨立範本庫，舊版與自訂保留。不改目前生成參數；結果仍須人工複核。','助手保留 1.0.0 / 2.0.0，3.0.0 沒有助手附加範本。'],
      'en-US':['Target generation model','Default skill version','V4.5 uses 1.0.0 only; 2.0.0 / 3.0.0 target V5 Full.','3.0.0 uses the independent template library. Older and custom content is retained. Generation settings are unchanged; review results manually.','The prompt assistant keeps 1.0.0 / 2.0.0. There is no 3.0.0 assistant overlay.'],
      'ja-JP':['生成モデル','既定のスキル版','V4.5 は1.0.0のみ。2.0.0 / 3.0.0 はV5 Full向けです。','3.0.0は独立テンプレートを使い、旧版とカスタムを保持します。生成設定は変更せず、結果は要確認です。','助手は1.0.0 / 2.0.0を保持し、3.0.0の追加テンプレートはありません。'],
      'ko-KR':['생성 대상 모델','기본 스킬 버전','V4.5는1.0.0만 사용하며 2.0.0 / 3.0.0은 V5 Full용입니다.','3.0.0은 독립 템플릿 라이브러리를 사용하며 이전 콘텐츠를 유지합니다. 생성 설정은 바뀌지 않고 결과는 검토해야 합니다.','도우미는1.0.0 / 2.0.0을 유지하며3.0.0 추가 템플릿은 없습니다.'],
    };
    final text=copy[locale]??copy['en-US']!;
    final safeEdition=!allowV3&&edition=='3.0.0'?'2.0.0':edition;
    return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
      StudioDropdownButtonFormField<String>(key:ValueKey('prompt-skill-model-$model-$safeEdition'),
        value:model,isExpanded:true,decoration:InputDecoration(labelText:text[0]),
        items:const[DropdownMenuItem(value:'v5',child:Text('NovelAI V5 Full')),DropdownMenuItem(value:'v4.5',child:Text('NovelAI V4.5'))],
        onChanged:onChanged==null?null:(v){if(v!=null)onChanged!(v,v=='v4.5'?'1.0.0':safeEdition);}),
      const SizedBox(height:8),
      StudioDropdownButtonFormField<String>(key:ValueKey('prompt-skill-edition-$model-$safeEdition'),
        value:safeEdition,isExpanded:true,decoration:InputDecoration(labelText:text[1]),
        items:[const DropdownMenuItem(value:'1.0.0',child:Text('1.0.0')),
          DropdownMenuItem(value:'2.0.0',enabled:model=='v5',child:const Text('2.0.0 · V5 Full')),
          if(allowV3)DropdownMenuItem(value:'3.0.0',enabled:model=='v5',child:const Text('3.0.0 · V5 Full'))],
        onChanged:onChanged==null?null:(v){if(v!=null)onChanged!(model,v);}),
      const SizedBox(height:6),
      Text(model=='v4.5'?text[2]:allowV3?text[3]:text[4],style:Theme.of(context).textTheme.bodySmall),
    ]);
  }
}
