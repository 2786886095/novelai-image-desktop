import type {PromptSkillVersion,ReversePromptTemplateVersion} from '../types';
import {skillVersionForModel} from '../prompt-skill-settings';
import {SelectMenu} from './ui';

const words={
 'zh-CN':['生图模型','技能版本','2.0.0 仅适用于 NovelAI V5 Full；选择 V4.5 将使用 1.0.0。','版本切换不会覆盖另一个版本的自定义模板。'],
};
export function PromptSkillControls({model,edition,language,disabled,onChange}:{model:ReversePromptTemplateVersion;edition:PromptSkillVersion;language?:unknown;disabled?:boolean;onChange:(model:ReversePromptTemplateVersion,edition:PromptSkillVersion)=>void}) {
 const text=words[language as keyof typeof words]??words['zh-CN'];
 return <div className="reverse-scope-card prompt-skill-controls">
  <SelectMenu label={text[0]} ariaLabel={text[0]} disabled={disabled} value={model} onChange={value=>{const next=value as ReversePromptTemplateVersion;onChange(next,skillVersionForModel(edition,next));}} options={[{value:'v5',label:'NovelAI V5 Full'},{value:'v4.5',label:'NovelAI V4.5'}]}/>
  <SelectMenu label={text[1]} ariaLabel={text[1]} disabled={disabled} value={skillVersionForModel(edition,model)} onChange={value=>onChange(model,skillVersionForModel(value,model))} options={[{value:'1.0.0',label:'1.0.0'},{value:'2.0.0',label:'2.0.0',disabled:model==='v4.5'}]}/>
  <small>{text[2]}</small><small>{text[3]}</small>
 </div>;
}
