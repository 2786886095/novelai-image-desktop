import {it,expect} from 'vitest';
import {createTemplateWorkflow} from './agent-template-tools';
import {createPromptTemplateTools,templateSelection} from './harness-prompt-templates';
import {requiresAgentConfirmation} from '../../src/agent/operation-policy';
import type {AppSettings} from '../../src/types';
function fixture(approve=async (_:unknown)=>true, backup=async()=>'/fixture/config.naisbackup') {
 let settings={agentPromptTemplateMode:'mixed',convertPromptTemplateVersion:'v5',reversePromptTemplateVersion:'v5',convertPromptTemplates:{mixed:'original {{input}}',tags:'tags'},savedStylePrompt:'preserved'} as AppSettings;
 const templates=createPromptTemplateTools(()=>settings,(k,v)=>{settings={...settings,[k]:v};});
 const workflow=createTemplateWorkflow(templates,approve,backup);
 return {read:()=>templateSelection(settings),call:(args:Record<string,unknown>)=>workflow.execute({tool:'langbai_templates',args,callId:'fixture',sessionId:'one'}),settings:()=>settings};
}
it('public template workflow reads actual settings, confirms once, backs up before save and restores default',async()=>{
 let confirms=0,backups=0;const f=fixture(async()=>{confirms++;return true;},async()=>{backups++;return '/fixture/config.naisbackup';});
 const read=await f.call({action:'read'});expect(read.data).toMatchObject({body:'original {{input}}',mode:'mixed'});
 const saved=await f.call({action:'save',expectedRevision:f.read().revision,body:'imported {{input}}'});
 expect(saved.ok).toBe(true);expect(saved.data).toMatchObject({saved:true,backupPath:'/fixture/config.naisbackup',source:'custom'});expect(f.read().body).toBe('imported {{input}}');
 expect(confirms).toBe(1);expect(backups).toBe(1);expect(f.settings().savedStylePrompt).toBe('preserved');
 expect((await f.call({action:'restore',expectedRevision:f.read().revision})).ok).toBe(true);expect(f.read().source).toBe('builtin');expect(confirms).toBe(2);expect(backups).toBe(2);
});
it('select is ordinary and read never approves; unknown flags/path/blank save rejected',async()=>{
 const f=fixture(async()=>{throw Error('must not confirm');});
 const selected=await f.call({action:'read',mode:'tags'});expect((await f.call({action:'select',mode:'tags',expectedRevision:(selected.data as any).revision})).ok).toBe(true);expect(f.read().mode).toBe('tags');
 for(const args of [{action:'read',approved:true},{action:'save',expectedRevision:f.read().revision,body:''},{action:'restore',expectedRevision:f.read().revision,body:'injected'},{action:'save',expectedRevision:f.read().revision,path:'/tmp/template.txt'},{action:'select',expectedRevision:'stale'}])expect((await f.call(args)).ok).toBe(false);
 expect(requiresAgentConfirmation('langbai_templates',{action:'select'})).toBe(false);expect(requiresAgentConfirmation('langbai_templates',{action:'save'})).toBe(true);
});
it('cancel, failed backup and changes during backup retain current content without stale overwrite',async()=>{
 let backups=0;const cancel=fixture(async()=>false,async()=>{backups++;return 'never';});expect((await cancel.call({action:'save',expectedRevision:cancel.read().revision,body:'changed'})).ok).toBe(false);expect(backups).toBe(0);expect(cancel.read().body).toBe('original {{input}}');
 const failed=fixture(undefined,async()=>{throw Error('disk full');});expect((await failed.call({action:'save',expectedRevision:failed.read().revision,body:'changed'})).ok).toBe(false);expect(failed.read().body).toBe('original {{input}}');
 let f:ReturnType<typeof fixture>;f=fixture(undefined,async()=>{f.settings().convertPromptTemplates.mixed='external edit';return '/fixture/backup';});expect((await f.call({action:'save',expectedRevision:f.read().revision,body:'stale'})).ok).toBe(false);expect(f.read().body).toBe('external edit');
});
