import {describe,expect,it,vi} from 'vitest';
vi.mock('./store',()=>({getSettings:()=>({agentContextWindow:8192,agentAutoCompactThreshold:.8,outputDir:''}),getHistoryReferenceItems:()=>[],fileExistsWithDirectoryCache:()=>false,readWithBackupRecoverySync:()=>null,atomicWriteFileSync:vi.fn(),rotateBackupsSync:vi.fn()}));
vi.mock('./agent-workspace-location',()=>({agentWorkspaceDirectory:()=>process.cwd()+'/defaults-qa',rebaseAgentWorkspaceFile:(value:string)=>value}));
import {createEmptyAgentWorkspace,createAgentConversation,normalizeAgentWorkspace,setStudioConversationOptions} from './agent-store';
import {studioSessionOptions,studioCreativeReferenceData,STUDIO_DEFAULT_PRESET_ID} from '../../src/agent/workspace-controls';

describe('fresh Studio defaults without private profiles',()=>{
 it('defaults fresh and missing legacy choices to full-auto plus web, preserving explicit saved off',()=>{
  const fresh=createEmptyAgentWorkspace();
  expect(studioSessionOptions(fresh.conversations[0])).toMatchObject({approvalMode:'auto',webSearchEnabled:true});
  expect(fresh.studioDefaults).toMatchObject({studioApprovalMode:'auto',studioWebSearchEnabled:true});
  const missing=normalizeAgentWorkspace({...fresh,studioDefaults:undefined,conversations:[{...fresh.conversations[0],studioApprovalMode:undefined,studioWebSearchEnabled:undefined}]});
  expect(studioSessionOptions(missing.conversations[0])).toMatchObject({approvalMode:'auto',webSearchEnabled:true});
  const saved=normalizeAgentWorkspace({...fresh,studioDefaults:{studioApprovalMode:'confirm',studioWebSearchEnabled:false},conversations:[{...fresh.conversations[0],studioApprovalMode:'confirm',studioWebSearchEnabled:false}]});
  expect(studioSessionOptions(saved.conversations[0])).toMatchObject({approvalMode:'confirm',webSearchEnabled:false});
  expect(saved.studioDefaults).toMatchObject({studioApprovalMode:'confirm',studioWebSearchEnabled:false});
 });
 it('new chat and cold normalization inherit persisted explicit choices, not a forced override',()=>{
  const first=createAgentConversation('fresh');
  expect(first.ok).toBe(true);
  const id=first.workspace.selectedConversationId!;
  expect(studioSessionOptions(first.workspace.conversations.find(c=>c.id===id))).toMatchObject({approvalMode:'auto',webSearchEnabled:true});
  const saved=setStudioConversationOptions(id,{studioApprovalMode:'confirm',studioWebSearchEnabled:false});
  expect(saved.ok).toBe(true);
  const second=createAgentConversation('inherited');
  const current=second.workspace.conversations.find(c=>c.id===second.workspace.selectedConversationId)!;
  expect(studioSessionOptions(current)).toMatchObject({approvalMode:'confirm',webSearchEnabled:false});
  const cold=normalizeAgentWorkspace(JSON.parse(JSON.stringify(second.workspace)));
  expect(studioSessionOptions(cold.conversations.find(c=>c.id===cold.selectedConversationId))).toMatchObject({approvalMode:'confirm',webSearchEnabled:false});
  expect(studioSessionOptions(cold.conversations.find(c=>c.id===id))).toMatchObject({approvalMode:'confirm',webSearchEnabled:false});
 });
 it('使用预设 gates selected creative instruction input, not sampler settings or tool permission',()=>{
  const workspace=createEmptyAgentWorkspace();const chat=workspace.conversations[0];
  expect(studioSessionOptions(chat).presetId).toBe(STUDIO_DEFAULT_PRESET_ID);
  const enabled=JSON.parse(studioCreativeReferenceData(workspace,chat,[]));
  expect(enabled.preset?.body).toContain('image');
  expect(enabled.preset?.name).toBe('presetInfinite');
  const disabled=JSON.parse(studioCreativeReferenceData(workspace,{...chat,studioTemplateEnabled:false},[]));
  expect(disabled.preset).toBeNull();
  expect(disabled.characters).toEqual(enabled.characters);
 });
});