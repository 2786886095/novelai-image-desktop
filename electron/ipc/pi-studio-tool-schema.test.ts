import {describe,expect,it} from 'vitest';
import {studioPiToolSchema} from './pi-studio-tool-schema';
import {createPromptTemplateTools,templateSelection} from './harness-prompt-templates';
import {validateTemplateRequest} from '../../src/agent/template-contract';
import type {AppSettings} from '../../src/types';
describe('actual shared templates and explicit tools',()=>{
 it('declares bounded web/template fields, one-shot preparation and refuses unknown tools',()=>{
  expect(studioPiToolSchema('langbai_search_web')).toMatchObject({additionalProperties:false,required:['query'],properties:{query:{maxLength:800}}});
  expect(studioPiToolSchema('langbai_generate_image')).toMatchObject({required:['preparationId']});
  expect(()=>studioPiToolSchema('arbitrary_shell')).toThrow();
 });
 it('selects saved custom overlay instead of hardcoded text and saves/reset same setting',()=>{
  const settings={promptOptimizeTemplate:'USER OPTIMIZE',promptAssistantTemplate:'USER ASSISTANT'} as AppSettings;
  const tools=createPromptTemplateTools(()=>settings,(key,value)=>Object.assign(settings,{[key]:value}));
  const before=templateSelection(settings,{kind:'optimize'});expect(before.body).toBe('USER OPTIMIZE');expect(before.source).toBe('custom');
  expect(templateSelection(settings,{kind:'assistant'}).body).toBe('USER ASSISTANT');
  const saved=tools.execute({tool:'studio_save_prompt_template',args:{kind:'optimize',expectedRevision:before.revision,body:'REVISED USER OPTIMIZE'}});
  expect(saved.ok).toBe(true);expect(settings.promptOptimizeTemplate).toBe('REVISED USER OPTIMIZE');
  expect(tools.execute({tool:'studio_save_prompt_template',args:{kind:'optimize',expectedRevision:before.revision,body:'STALE'}}).ok).toBe(false);
  const fresh=templateSelection(settings,{kind:'optimize'});
  expect(tools.execute({tool:'studio_save_prompt_template',args:{kind:'optimize',expectedRevision:fresh.revision,restoreDefault:true,body:''}}).ok).toBe(true);
  expect(templateSelection(settings,{kind:'optimize'}).source).toBe('builtin');expect(settings.promptAssistantTemplate).toBe('USER ASSISTANT');
 });
 it('four template kinds use the existing workflow revision and size validation',()=>{
  for(const kind of ['convert','reverse','optimize','assistant'])expect(validateTemplateRequest({action:'read',kind})).toMatchObject({kind});
  expect(()=>validateTemplateRequest({action:'save',kind:'assistant',body:'x'})).toThrow('revision');
 });
});
