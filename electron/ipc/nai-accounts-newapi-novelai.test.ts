import {afterEach,expect,it,vi} from 'vitest';
import axios from 'axios';
import fixture from './nai-accounts-testing/newapi-novelai-fixture.json';
import {NAI_RELAY_MODEL_IDS} from '../../src/nai-accounts';
import {NAI_MODELS,NAI_INPAINT_MODELS} from '../../src/types';
import {validateNaiAccountReadOnly,requireNaiAccountValidation} from './nai-accounts-validation';
vi.mock('./proxy',()=>({proxyConfigForUrl:async()=>({proxy:false})}));
vi.mock('./store',()=>({getSettings:()=>({proxyMode:'auto'})}));
afterEach(()=>vi.restoreAllMocks());
it('relay discovery allowlist is exactly the existing NovelAI catalog, not a general image provider',()=>{
 expect([...NAI_RELAY_MODEL_IDS].sort()).toEqual([...NAI_MODELS,...NAI_INPAINT_MODELS].map(m=>m.value).sort());
});
for(const row of fixture.cases){
 it(`NovelAI-only authenticated read-only validation: ${row.id}`,async()=>{
  const calls:string[]=[];
  const token='QA_ONLY_PLACEHOLDER_TOKEN';
  const post=vi.spyOn(axios,'post').mockImplementation(()=>{throw Error('Paid route must not be probed');});
  vi.spyOn(axios,'get').mockImplementation(async(url,config)=>{
   const uri=new URL(url);expect(uri.origin).toBe('https://owned-novelai-relay.invalid');
   calls.push(uri.pathname);expect(config).toMatchObject({timeout:8000,maxRedirects:0,maxContentLength:256*1024,headers:{Authorization:`Bearer ${token}`}});
   const responses=row.responses as Record<string,{status:number;data?:unknown}>;
   return {data:undefined,...responses[uri.pathname]??{status:404}};
  });
  const base='https://owned-novelai-relay.invalid'+('apiSuffix' in row?row.apiSuffix:'');
  const result=await validateNaiAccountReadOnly({label:'QA',method:'relay',token,apiBaseUrl:base,imageBaseUrl:base});
  expect(result).toMatchObject({ok:row.expectedOk,code:row.expectedCode});
  if(row.expectedOk)expect(()=>requireNaiAccountValidation(result)).not.toThrow();
  else expect(()=>requireNaiAccountValidation(result)).toThrow('NAI_ACCOUNT_VALIDATION');
  if(result.modelIds){expect(result.account).toBeUndefined();expect(result.modelIds.length).toBeGreaterThan(0);expect(new Set(result.modelIds).size).toBe(result.modelIds.length);for(const id of result.modelIds)expect(NAI_RELAY_MODEL_IDS).toContain(id);}
  expect(calls.length).toBeGreaterThan(0);expect(calls.length).toBeLessThanOrEqual(3);expect(post).not.toHaveBeenCalled();
 });
}
