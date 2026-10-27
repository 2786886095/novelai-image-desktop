import type {PromptSkillVersion,ReversePromptTemplateVersion} from '../types';
import {skillVersionForModel} from '../prompt-skill-settings';
import {SelectMenu} from './ui';

const words={
 'zh-CN':['生图模型','技能版本','2.0.0 / 3.0.0 仅适用于 NovelAI V5 Full；选择 V4.5 将使用 1.0.0。','版本切换不会覆盖另一个版本的自定义模板。'],
 'zh-TW':['生圖模型','技能版本','2.0.0 / 3.0.0 僅適用於 NovelAI V5 Full；選擇 V4.5 將使用 1.0.0。','版本切換不會覆蓋另一版本的自訂模板。'],
 'en-US':['Image model','Skill version','2.0.0 / 3.0.0 target NovelAI V5 Full only; V4.5 uses 1.0.0.','Switching versions preserves each version’s custom templates.'],
 'ja-JP':['画像モデル','スキル版','2.0.0 / 3.0.0 は NovelAI V5 Full 専用です。V4.5 は 1.0.0 を使用します。','版を切り替えても各版のカスタム設定は保持されます。'],
 'ko-KR':['이미지 모델','스킬 버전','2.0.0 / 3.0.0은 NovelAI V5 Full 전용입니다. V4.5는 1.0.0을 사용합니다.','버전을 바꿔도 각 버전의 사용자 템플릿은 유지됩니다.'],
};
export function PromptSkillControls({model,edition,language,disabled,onChange,allowV3=true}:{model:ReversePromptTemplateVersion;edition:PromptSkillVersion;language?:unknown;disabled?:boolean;allowV3?:boolean;onChange:(model:ReversePromptTemplateVersion,edition:PromptSkillVersion)=>void}) {
 const text=words[language as keyof typeof words]??words['zh-CN'];
 return <div className="reverse-scope-card prompt-skill-controls">
  <SelectMenu label={text[0]} ariaLabel={text[0]} disabled={disabled} value={model} onChange={value=>{const next=value as ReversePromptTemplateVersion;onChange(next,skillVersionForModel(!allowV3&&edition==='3.0.0'?'2.0.0':edition,next));}} options={[{value:'v5',label:'NovelAI V5 Full'},{value:'v4.5',label:'NovelAI V4.5'}]}/>
  <SelectMenu label={text[1]} ariaLabel={text[1]} disabled={disabled} value={skillVersionForModel(!allowV3&&edition==='3.0.0'?'2.0.0':edition,model)} onChange={value=>onChange(model,skillVersionForModel(!allowV3&&value==='3.0.0'?'2.0.0':value,model))} options={[{value:'1.0.0',label:'1.0.0'},{value:'2.0.0',label:'2.0.0',disabled:model==='v4.5'},...(allowV3?[{value:'3.0.0',label:'3.0.0',disabled:model==='v4.5'}]:[])]}/>
  <small>{text[2]}</small><small>{text[3]}</small>
 </div>;
}
