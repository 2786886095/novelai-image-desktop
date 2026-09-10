import {beforeEach,describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import {createSoftwareImageStarterKit} from '../../src/tavern/builtins';
const mocked=vi.hoisted(()=>({workspace:null as any,post:vi.fn(),generate:vi.fn(),events:[] as any[],protocol:"openai-chat"}));
vi.mock('axios',()=>({default:{post:mocked.post}}));
vi.mock('./proxy',()=>({proxyConfig:()=>({})}));
vi.mock('./store',()=>({getSettings:()=>({agentApiBaseUrl:'https://fixture.invalid',agentApiModel:'fixture',agentApiKey:'fixture-token',agentApiProtocol:mocked.protocol,agentMaxOutputTokens:1000,agentAutoCompact:false,reverseConvertDshEnabled:false})}));
vi.mock('./agent-store',()=>({readAgentWorkspace:()=>structuredClone(mocked.workspace),updateAgentConversation:(id:string,f:(v:any)=>void)=>{const c=mocked.workspace.conversations.find((c:any)=>c.id===id);if(c)f(c);}}));
vi.mock('./agent-tools',()=>({executeAgentTool:mocked.generate}));
vi.mock('./dsh-reverse-convert',()=>({injectDshImageAiSystemPrompt:({systemPrompt}:{systemPrompt:string})=>systemPrompt}));
import {sendAgentMessage,setAgentEventSink,abortAgentMessage,generateTavernImage} from './agent-runtime';
const block=(raw:unknown)=>({status:200,headers:{'content-type':'application/json'},data:Readable.from([JSON.stringify({choices:[{message:{content:`画面方案。<langbai-image>${JSON.stringify(raw)}</langbai-image>`}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}})])});
const invalid={positivePrompt:'woman, blue coat',promptMode:'new',scale:8};
const repaired={baseImageId:'base',promptPatch:{replacements:[{from:'red coat',to:'blue coat'}],append:[]},width:1024,scale:9};
beforeEach(()=>{
 vi.clearAllMocks();mocked.protocol="openai-chat";const kit=createSoftwareImageStarterKit();kit.character.visual={...kit.character.visual,stylePrompt:'',negativePrompt:'',width:1088,height:1920,scale:0};
 mocked.workspace={characters:[kit.character],personas:[kit.persona],samplerPresets:[kit.sampler],lorebooks:[],conversations:[{id:'chat',status:'idle',characterIds:[kit.character.id],activeCharacterId:kit.character.id,samplerPresetId:kit.sampler.id,personaId:kit.persona.id,lorebookIds:[],generationMode:'auto',draftAttachments:[],messages:[{id:'old',role:'assistant',status:'complete',createdAt:'2026-09-09T00:00:00Z',content:'已有画面',attachments:[],tools:[],characterId:kit.character.id,imageProposal:{id:'base',status:'completed',createdAt:'2026-09-09T00:00:00Z',positivePrompt:'woman, red coat, white scarf, city street',stylePrompt:'',negativePrompt:'',count:1}}]}]};
 mocked.events=[];setAgentEventSink(e=>mocked.events.push(structuredClone(e)));mocked.generate.mockResolvedValue({ok:true,output:'fixture generated',generatedImages:[]});
});
const send=()=>sendAgentMessage({conversationId:'chat',text:'把红色外套改成蓝色，其它保留'});
const latest=()=>mocked.workspace.conversations[0].messages.at(-1);
describe('automatic generation integration',()=>{
 it('repairs an invalid rewrite then generates once without user confirmation',async()=>{
  mocked.post.mockResolvedValueOnce(block(invalid)).mockResolvedValueOnce(block(repaired));expect((await send()).ok).toBe(true);
  expect(mocked.post).toHaveBeenCalledTimes(2);expect(mocked.generate).toHaveBeenCalledTimes(1);
  expect(latest().imageProposal.status).toBe('completed');expect(latest().imageProposal.continuity.repairStatus).toBe('repaired');
  expect(mocked.generate.mock.calls[0][0].args).toMatchObject({positivePrompt:'woman, blue coat, white scarf, city street',width:1088,height:1920,cfgScale:0,stylePrompt:'',negativePrompt:''});
  expect(mocked.events.some(e=>e.workspace?.conversations[0].messages.at(-1)?.imageProposal?.continuity?.repairStatus==='repairing')).toBe(true);
 });
 it('confirmation mode repairs the contract but still waits for a user decision',async()=>{
  mocked.workspace.conversations[0].generationMode='confirm';mocked.post.mockResolvedValueOnce(block(invalid)).mockResolvedValueOnce(block(repaired));await send();
  expect(mocked.generate).not.toHaveBeenCalled();expect(latest().imageProposal.status).toBe('pending');expect(latest().imageProposal.continuity.reviewRequired).toBe(false);
 });
 it('a second invalid response pauses instead of generating or looping',async()=>{
  mocked.post.mockResolvedValueOnce(block(invalid)).mockResolvedValueOnce(block(invalid));await send();
  expect(mocked.post).toHaveBeenCalledTimes(2);expect(mocked.generate).not.toHaveBeenCalled();expect(latest().imageProposal.continuity.repairStatus).toBe('failed');expect(latest().imageProposal.positivePrompt).toContain('white scarf');
 });
 it('switching to confirmation during repair suppresses automatic execution',async()=>{
  mocked.post.mockResolvedValueOnce(block(invalid)).mockImplementationOnce(async()=>{mocked.workspace.conversations[0].generationMode='confirm';return block(repaired);});await send();expect(mocked.generate).not.toHaveBeenCalled();
 });
 it('cancelling during repair sends no generation and releases the conversation',async()=>{
  mocked.post.mockResolvedValueOnce(block(invalid)).mockImplementationOnce(async()=>{abortAgentMessage('chat');return block(repaired);});await send();expect(mocked.generate).not.toHaveBeenCalled();expect(latest().status).toBe('aborted');expect(mocked.workspace.conversations[0].status).toBe('idle');
 });
 it('a valid edit uses one model request and one generation',async()=>{
  mocked.post.mockResolvedValueOnce(block(repaired));await send();expect(mocked.post).toHaveBeenCalledTimes(1);expect(mocked.generate).toHaveBeenCalledTimes(1);
 });
 it('a second click does not submit the same running image again',async()=>{
  const old=mocked.workspace.conversations[0].messages[0];old.imageProposal.status='running';expect((await generateTavernImage({conversationId:'chat',messageId:old.id,proposal:old.imageProposal})).ok).toBe(false);expect(mocked.generate).not.toHaveBeenCalled();
 });
});

import sceneFixtures from '../../shared/tavern-scene-fixtures.json';
describe('first-image structured acceptance',()=>{
 it('repairs a flat first image before auto generation and sends independent characters',async()=>{
  mocked.workspace.conversations[0].messages=[];
  mocked.workspace.characters[0].visual.model='nai-diffusion-5-full';
  mocked.post.mockResolvedValueOnce(block({positivePrompt:'two adults',model:'nai-diffusion-3'})).mockResolvedValueOnce(block({scene:sceneFixtures.scene,stylePrompt:'injected',width:64}));
  await sendAgentMessage({conversationId:'chat',text:'画两名成年人，A 红外套，B 蓝外套'});
  expect(mocked.post).toHaveBeenCalledTimes(2);expect(mocked.generate).toHaveBeenCalledTimes(1);
  expect(latest().imageProposal.scene).toBeDefined();
  expect(mocked.generate.mock.calls[0][0].args.characterPrompts).toHaveLength(2);
  expect(mocked.generate.mock.calls[0][0].args).toMatchObject({width:1088,height:1920,stylePrompt:'',negativePrompt:''});
 });
 it('holds a second flat response without silently generating an unstructured image',async()=>{
  mocked.workspace.conversations[0].messages=[];mocked.workspace.characters[0].visual.model='nai-diffusion-5-full';
  mocked.post.mockResolvedValue(block({positivePrompt:'two adults'}));await send();
  expect(mocked.post).toHaveBeenCalledTimes(2);expect(mocked.generate).not.toHaveBeenCalled();
  expect(latest().imageProposal.continuity).toMatchObject({bindingError:'SCENE_REQUIRED',repairStatus:'failed',reviewRequired:true});
  const p={...latest().imageProposal,continuity:{...latest().imageProposal.continuity,reviewRequired:false}};
  expect((await generateTavernImage({conversationId:'chat',messageId:latest().id,proposal:p})).ok).toBe(false);
 });
 it('scenery creates a structured scene without inventing characters',async()=>{
  mocked.workspace.conversations[0].messages=[];mocked.workspace.characters[0].visual.model='nai-diffusion-5-full';
  mocked.post.mockResolvedValueOnce(block({scene:{version:1,revision:0,entities:[],facts:[{id:'setting',entityId:'scene',slot:'setting',prompt:'forest, river, no humans'}],relations:[]}}));
  await send();expect(mocked.post).toHaveBeenCalledTimes(1);expect(mocked.generate).toHaveBeenCalledTimes(1);
  expect(mocked.generate.mock.calls[0][0].args.characterPrompts).toEqual([]);
 });
});

describe('real-model empty / truncated reply regression',()=>{
 it('does not call a reasoning-only response successful or generate an image',async()=>{
  mocked.post.mockResolvedValueOnce({status:200,headers:{'content-type':'application/json'},data:Readable.from([JSON.stringify({choices:[{message:{content:'',reasoning_content:'thinking only'}}],usage:{total_tokens:100}})])});
  expect((await send()).ok).toBe(false);expect(latest().status).toBe('error');expect(latest().error).toContain('没有返回正文');
  expect(latest().reasoning).toBe('thinking only');expect(mocked.generate).not.toHaveBeenCalled();
  expect(mocked.workspace.conversations[0].messages[0].imageProposal.positivePrompt).toContain('red coat');
  mocked.post.mockResolvedValueOnce(block(repaired));expect((await send()).ok).toBe(true);expect(mocked.generate).toHaveBeenCalledTimes(1);
 });
 for(const reason of ['max_output_tokens','other']) it(`handles Responses incomplete ${reason} with usage and no generation`,async()=>{
  mocked.protocol='openai-responses';
  const content=`<langbai-image>${JSON.stringify(repaired)}</langbai-image>`;
  const events=[{type:'response.output_text.delta',delta:content},{type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason},usage:{total_tokens:60}}}];
  mocked.post.mockResolvedValueOnce({status:200,headers:{'content-type':'text/event-stream'},data:Readable.from(events.map(e=>`data: ${JSON.stringify(e)}\n\n`))});
  expect((await send()).ok).toBe(false);expect(latest().status).toBe('error');expect(latest().usage.total).toBe(60);expect(mocked.generate).not.toHaveBeenCalled();
 });
 it('handles nonstream Responses failures without presenting an empty success',async()=>{
  mocked.protocol='openai-responses';mocked.post.mockResolvedValueOnce({status:200,headers:{'content-type':'application/json'},data:Readable.from([JSON.stringify({status:'failed',output:[]})])});
  expect((await send()).ok).toBe(false);expect(latest().error).toContain('失败状态');expect(mocked.generate).not.toHaveBeenCalled();
 });
});
