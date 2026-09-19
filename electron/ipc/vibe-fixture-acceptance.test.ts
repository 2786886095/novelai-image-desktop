import fs from 'node:fs';
import {it,expect,vi} from 'vitest';
import axios from 'axios';
vi.mock('./store',async importOriginal=>({...await importOriginal<typeof import('./store')>(),getToken:()=> 'fixture-token',getSettings:()=>({imageBaseUrl:'https://image.novelai.net',proxyMode:'direct'})}));
import {prepareExtras,buildPayload} from './nai';
import {DEFAULT_PARAMS} from '../../src/types';

it.skipIf(!process.env.VIBE_FIXTURE)('provided mixed Vibe bundle constructs both references without re-encoding',async()=>{
 const raw=JSON.parse(fs.readFileSync(process.env.VIBE_FIXTURE!,'utf8'));
 const model='nai-diffusion-4-5-full';
 const refs=raw.vibes.map((v:any)=>{
  const infoExtracted=v.importInfo.information_extracted;
  const encoding:any=Object.values(v.encodings['v4-5full']).find((e:any)=>(e.params?.information_extracted??infoExtracted)===infoExtracted);
  return {base64:v.image??'',infoExtracted,strength:v.importInfo.strength,encodings:[{model,infoExtracted,encoding:encoding.encoding}]};
 });
 const request=vi.spyOn(axios,'post').mockRejectedValue(new Error('Unexpected paid encode-vibe request'));
 try {
 const result=await prepareExtras({...DEFAULT_PARAMS,model},{vibeImages:refs,charCaptions:[],preciseReferences:[]});
 const payload=buildPayload({...DEFAULT_PARAMS,model},123,result);
 expect(payload.parameters.reference_image_multiple).toEqual(refs.map((v:any)=>v.encodings[0].encoding));
 expect(payload.parameters.reference_strength_multiple).toEqual([.31,.24]);
 expect(payload.parameters.reference_information_extracted_multiple).toEqual([.7,.44]);
 expect(request).not.toHaveBeenCalled();
 } finally { request.mockRestore(); }
});
