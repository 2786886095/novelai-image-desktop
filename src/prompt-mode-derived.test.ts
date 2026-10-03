import {expect,it} from 'vitest';
import {derivePromptModeTemplate} from './data/prompt-mode-derived';
import {resolveModePrompt} from './prompt-mode';
import {resolvePromptAssistantMode,preparePromptAssistance,isSparsePromptEditSource} from './prompt-assistant';
import {CONVERT_SYSTEM_PROMPTS,REVERSE_SYSTEM_PROMPTS} from './data/prompt-templates';
import {V45_CONVERT_SYSTEM_PROMPTS} from './data/prompt-templates-v45';
import {mixedTemplateContract,auditMixedEnvelope} from './prompt-template-audit';
import fixture from '../tests/fixtures/prompt-edit-saved-mixed.json';
import {readFileSync} from 'node:fs';

it('defaults editors independently to mixed and retains an explicit selection',()=>{
 expect(resolvePromptAssistantMode({convertMode:'tags'})).toBe('mixed');
 for(const mode of ['tags','natural','mixed'] as const)expect(resolvePromptAssistantMode({promptAssistantMode:mode,convertMode:'tags'})).toBe(mode);
 expect(isSparsePromptEditSource(fixture.source)).toBe(false);
});
for(const [task,defaults] of Object.entries({reverse:REVERSE_SYSTEM_PROMPTS,convert:CONVERT_SYSTEM_PROMPTS})){
 for(const mode of ['tags','natural'] as const)it(`${task} ${mode} derives default and saved mixed content without mutation`,()=>{
  expect(defaults[mode]).toBe(derivePromptModeTemplate(defaults.mixed,mode));
  const saved={tags:'',natural:'',mixed:fixture.template},before=JSON.stringify(saved);
  const result=resolveModePrompt(mode,saved,undefined,defaults);
  expect(result).toBe(derivePromptModeTemplate(fixture.template,mode));expect(JSON.stringify(saved)).toBe(before);
  expect(result).toContain(mode==='tags'?'不输出自然语言句子':'不要求 Tag 数量');
  expect(result).not.toMatch(/Tag 保持约 65–75%|约 70% 英文 Danbooru/);
 });
}
it('the reported legacy V4.5 tag default in a V5 selection inherits its saved mixed template',()=>{
 const saved={tags:V45_CONVERT_SYSTEM_PROMPTS.tags,natural:'',mixed:fixture.template};
 expect(resolveModePrompt('tags',saved,undefined,CONVERT_SYSTEM_PROMPTS)).toBe(derivePromptModeTemplate(fixture.template,'tags'));
 expect(resolveModePrompt('natural',{...saved,natural:'MY INDEPENDENT CUSTOM TEMPLATE'},undefined,CONVERT_SYSTEM_PROMPTS)).toBe('MY INDEPENDENT CUSTOM TEMPLATE');
});
it('format derivation retains unrelated percentage facts and changes neither source nor scope',()=>{
 const mixed='仅依据图片可见内容。保留道具归属。透明伞覆盖画面 50%。\nTag 保持约 65–75%，自然语言保持约 25–35%';
 for(const mode of ['tags','natural'] as const){const result=derivePromptModeTemplate(mixed,mode);expect(result).toContain('透明伞覆盖画面 50%');expect(result).toContain('仅依据图片可见内容');}
 expect(derivePromptModeTemplate(mixed,'mixed')).toBe(mixed);
});
it('custom editing audits unchanged source attributes alongside the explicit latest change',()=>{
 const r=preparePromptAssistance('1girl, white hair, red eyes, upper body',{kind:'custom',instruction:'把发色改为黑发'});
 const e={segments:[{units:[...Array.from({length:42},(_,i)=>({kind:'tag',text:['1girl','black hair','red eyes','upper body'][i]??'fixture tag '+i})),...Array.from({length:18},(_,i)=>({kind:'natural',text:'her visible sleeve catches light '+i}))]}]};
 const contract=mixedTemplateContract('有效语义单元 50–150；Tag 65–75%','mixed')!;
 expect(auditMixedEnvelope(JSON.stringify(e),r.auditText,contract).issues).toEqual([]);
 e.segments[0].units[2].text='blue eyes';expect(auditMixedEnvelope(JSON.stringify(e),r.auditText,contract).issues.join(' ')).toContain('red eyes');
});
it('only a short editor input can use the bundled sparse exception',()=>{
 expect(mixedTemplateContract(CONVERT_SYSTEM_PROMPTS.mixed,'mixed',false)?.min).toBe(50);
 expect(mixedTemplateContract(CONVERT_SYSTEM_PROMPTS.mixed,'mixed',true)?.min).toBe(25);
 expect(mixedTemplateContract(fixture.template,'mixed',false)?.min).toBe(50);
});
it('a same-line mixed ratio does not discard the independent tag unit bound',()=>{
 const template='仅依据图片可见内容。\n有效语义单元 50–150；Tag 65–75%';
 const tags=derivePromptModeTemplate(template,'tags');
 expect(tags).toContain('有效语义单元 50–150');expect(tags).not.toContain('Tag 65–75%');
});
it('mobile templates and format overlays are generated from the exact desktop sources',()=>{
 const asset=JSON.parse(readFileSync('mobile/assets/prompt_templates.json','utf8'));
 expect(asset.convert).toEqual(CONVERT_SYSTEM_PROMPTS);expect(asset.reverse).toEqual(REVERSE_SYSTEM_PROMPTS);
 expect(asset.modeSuffix.tags).toBe(derivePromptModeTemplate('','tags'));expect(asset.modeSuffix.natural).toBe(derivePromptModeTemplate('','natural'));
});
