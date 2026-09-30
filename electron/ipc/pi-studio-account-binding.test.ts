import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('./agent-tools',()=>({AGENT_READ_TOOLS:[],AGENT_MUTATING_TOOLS:[],executeAgentTool:vi.fn()}));
vi.mock('./agent-image-provider',()=>({compatibleAgentInput:vi.fn()}));
vi.mock('./store',()=>({getSettings:()=>({imageProvider:'novelai',modelMode:'normal'}),getAccountSummary:()=>({tierLevel:3,hasActiveSubscription:true})}));
import {activateNaiAccount} from './nai-accounts-runtime';
import {createStudioPiTools,studioGenerationFingerprint,studioGenerationPreparations} from './pi-studio-tools';
const a={id:'account-a',label:'A',method:'token' as const,token:'synthetic-secret-A',apiBaseUrl:'https://api.novelai.net',imageBaseUrl:'https://image.novelai.net'};
afterEach(()=>activateNaiAccount(undefined,()=>{}));
describe('Pi paid preparation binds exact account',()=>{
 it('rejects another official account with identical generation settings before consumption',async()=>{
  activateNaiAccount(a,()=>{});
  const fingerprint=studioGenerationFingerprint();expect(fingerprint).not.toContain(a.token);
  const prepare=createStudioPiTools({sessionId:'account-proof',emit:()=>{}}).find(x=>x.name==='langbai_prepare_generation')!;
  const result=await prepare.execute({positivePrompt:'cat'},new AbortController().signal);
  const id=JSON.parse(result.output).preparationId;
  expect(studioGenerationPreparations.inspect('account-proof',id,fingerprint)).toBeDefined();
  activateNaiAccount({...a,id:'account-b',token:'synthetic-secret-B'},()=>{});
  expect(studioGenerationFingerprint()).not.toBe(fingerprint);
  expect(()=>studioGenerationPreparations.consume('account-proof',id,studioGenerationFingerprint())).toThrow('设置已变化');
 });
 it('does not quote official free Anlas for relay and never returns the bearer secret',async()=>{
  activateNaiAccount({...a,id:'relay',method:'relay',apiBaseUrl:'https://relay.invalid/api',imageBaseUrl:'https://relay.invalid/api'},()=>{});
  const prepare=createStudioPiTools({sessionId:'relay-proof',emit:()=>{}}).find(x=>x.name==='langbai_prepare_generation')!;
  const result=await prepare.execute({positivePrompt:'cat'},new AbortController().signal);
  expect(JSON.parse(result.output)).toMatchObject({estimatedAnlas:null,estimateSource:'provider-unknown'});
  expect(result.output).not.toContain(a.token);
 });
});
