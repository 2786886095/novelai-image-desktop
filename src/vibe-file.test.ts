import {describe,it,expect} from 'vitest';
import {parseVibeFile,exportVibeFile,matchingVibeEncoding,validateVibeModel} from './vibe-file';
const model='nai-diffusion-4-5-full';
const entry=()=>({identifier:'novelai-vibe-transfer',version:1,type:'encoding',encodings:{'v4-5full':{unknown:{encoding:'AQIDBA=='}}},importInfo:{model,information_extracted:0.7,strength:0.31}});
describe('NovelAI Vibe file compatibility',()=>{
 it('imports encoding-only single files and unknown extraction keys using importInfo',()=>{
  const [ref]=parseVibeFile(JSON.stringify(entry()));expect(ref.base64).toBe('');expect(ref.infoExtracted).toBe(.7);expect(ref.strength).toBe(.31);expect(matchingVibeEncoding(ref,model)).toBe('AQIDBA==');
 });
 it('keeps bundle order, image and all extraction variants; selects exact imported value',()=>{
  const e={...entry(),type:'image',image:'iVBORw0KGgo=',encodings:{'v4-5full':{a:{encoding:'AQIDBA==',params:{information_extracted:.28}},b:{encoding:'BQYHCA==',params:{information_extracted:.44}}}},importInfo:{model,information_extracted:.44,strength:.24}};
  const refs=parseVibeFile(JSON.stringify({identifier:'novelai-vibe-transfer-bundle',version:1,vibes:[entry(),e]}));
  expect(refs.map(v=>v.strength)).toEqual([.31,.24]);expect(refs[1].base64).toBe(e.image);expect(refs[1].encodings).toHaveLength(2);expect(matchingVibeEncoding(refs[1],model)).toBe('BQYHCA==');
  expect(parseVibeFile(exportVibeFile(refs)).map(v=>({...v,name:''}))).toEqual(refs.map(v=>({...v,name:''})));
 });
 it('rejects encoding-only model or extraction mismatch but allows real image re-encoding',()=>{
  const [ref]=parseVibeFile(JSON.stringify(entry()));expect(()=>validateVibeModel(ref,'nai-diffusion-4-5-curated')).toThrow('no original image');expect(()=>validateVibeModel({...ref,infoExtracted:.4},model)).toThrow();expect(()=>validateVibeModel({...ref,base64:'iVBORw0KGgo='},'nai-diffusion-4-full')).not.toThrow();
 });
 it.each([{}, {...entry(),version:2},{...entry(),importInfo:{model,information_extracted:2}}, {...entry(),encodings:{}},{...entry(),type:'image',image:'https://example.com/x'}])('rejects invalid input atomically',v=>expect(()=>parseVibeFile(JSON.stringify(v))).toThrow());
 it('rejects oversized or empty bundles',()=>{for(const vibes of [[],Array(17).fill(entry())])expect(()=>parseVibeFile(JSON.stringify({identifier:'novelai-vibe-transfer-bundle',version:1,vibes}))).toThrow();});
});
