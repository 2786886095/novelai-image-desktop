import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({effort:'medium' as 'medium'|'high'}));
vi.mock('./agent-tools',()=>({AGENT_READ_TOOLS:[],AGENT_MUTATING_TOOLS:[],executeAgentTool:vi.fn()}));
vi.mock('./agent-image-provider',()=>({compatibleAgentInput:vi.fn()}));
vi.mock('./store',()=>({getSettings:()=>({imageProvider:'novelai',modelMode:'normal',lastGenerationState:{params:{model:'nai-diffusion-5-full',effort:state.effort,width:1024,height:1024,steps:23,sampler:'k_euler',negativePrompt:'saved High',cfgRescale:.4}}}),getAccountSummary:()=>({hasToken:true,tierLevel:1,hasActiveSubscription:true,anlasBalance:1000})}));
import {createStudioPiTools,studioGenerationFingerprint,studioGenerationPreparations} from './pi-studio-tools';
describe('active Pi Agent Effort integration',()=>{
 it('inherits effort, previews actual wire settings and freezes count without a paid call',async()=>{
  state.effort='medium';
  const tool=createStudioPiTools({sessionId:'effort-proof',emit:()=>{}}).find(t=>t.name==='langbai_prepare_generation')!;
  const result=await tool.execute({positivePrompt:'1girl',count:3},new AbortController().signal);
  const data=JSON.parse(result.output);
  expect(data).toMatchObject({effort:'medium',model:'nai-diffusion-5-full-medium',steps:14,count:3,estimatedAnlas:54});
  const fingerprint=studioGenerationFingerprint();
  const args=studioGenerationPreparations.consume('effort-proof',data.preparationId,fingerprint);
  expect(args.count).toBe(3);
  state.effort='high';
  const high=JSON.parse((await tool.execute({positivePrompt:'1girl',count:3},new AbortController().signal)).output);
  expect(high).toMatchObject({effort:'high',model:'nai-diffusion-5-full',steps:23,count:3,estimatedAnlas:78});
  state.effort='medium';
  expect(()=>studioGenerationPreparations.consume('effort-proof',high.preparationId,studioGenerationFingerprint())).toThrow('设置已变化');
 });
});
