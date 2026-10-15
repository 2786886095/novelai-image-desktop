import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {PNG} from 'pngjs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DEFAULT_PARAMS,type GenerateExtras,type GenerateParams,type NAIInpaintModel} from '../../src/types';

const fixture=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),resizeCalls:[] as {width:number;height:number}[]}));
vi.mock('axios',()=>({default:{post:fixture.post,get:fixture.get,isCancel:()=>false}}));
vi.mock('./proxy',()=>({proxyConfig:()=>({}),proxyConfigForUrl:async()=>({proxy:false})}));
vi.mock('./logger',()=>({logInfo:vi.fn(),logError:vi.fn(),appendLog:vi.fn()}));
vi.mock('./store',()=>({getToken:()=> 'synthetic-inpaint-test-token-not-a-user-token',
 getSettings:()=>({imageBaseUrl:'https://image.novelai.net',allowCustomEndpoint:false,allowCustomEndpointFallback:false}),
 getAccountSummary:()=>({hasToken:true,anlasBalance:100}),getHistoryGroups:()=>[],
 addHistory:vi.fn(),ensureHistoryGroup:vi.fn(),setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
vi.mock('electron',async()=>{
 const {PNG:Codec}=await import('pngjs');
 // Node test adapter for Electron's synchronous PNG decode/resize surface.
 // Production prepareExtras/buildPayload/multipart builder remain unmocked.
 const image=(png:any):any=>({isEmpty:()=>false,getSize:()=>({width:png.width,height:png.height}),toPNG:()=>Codec.sync.write(png),
  resize:({width,height}:{width:number;height:number})=>{fixture.resizeCalls.push({width,height});const resized=new Codec({width,height});
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){const from=(Math.min(png.height-1,Math.floor(y*png.height/height))*png.width+Math.min(png.width-1,Math.floor(x*png.width/width)))*4;png.data.copy(resized.data,(y*width+x)*4,from,from+4);}return image(resized);}});
 return {app:{isPackaged:false,getPath:()=>{throw Error('Human profile access forbidden in inpaint fixture');}},
  dialog:{showOpenDialog:vi.fn()},protocol:{},nativeImage:{createFromBuffer:(bytes:Buffer)=>image(Codec.sync.read(bytes))}};
});
import {clearWorkbenchImage,inpaintImage,loadImageFromPath} from './nai';

let root='';
function png(width:number,height:number,value=150){const p=new PNG({width,height});for(let i=0;i<p.data.length;i+=4){p.data[i]=value;p.data[i+1]=value;p.data[i+2]=value;p.data[i+3]=255;}return PNG.sync.write(p);}
const params:GenerateParams={...DEFAULT_PARAMS,model:'nai-diffusion-5-full',positivePrompt:'repair scene',width:512,height:512,seedMode:'fixed',seed:12345};
const mask=()=>png(512,512,255).toString('base64');
function extras():GenerateExtras{return {vibeImages:[],charCaptions:[
 {prompt:'girl, red coat',negativePrompt:'red hair',useCoords:true,x:0.25,y:0.4},
 {prompt:'boy, blue coat',negativePrompt:'blue hair',useCoords:true,x:0.75,y:0.6},
 ],preciseReferences:[{base64:png(32,48).toString('base64'),type:'character&style',strength:0.8,fidelity:0.7}]};}
function multipart(body:any){
 expect(typeof body?.getBuffer).toBe('function');const result=new Map<string,Buffer>();
 const boundary=body.getBoundary(),wire=body.getBuffer().toString('latin1');
 for(let part of wire.split('--'+boundary).slice(1)){if(part.startsWith('--'))continue;part=part.replace(/^\r\n/,'');const cut=part.indexOf('\r\n\r\n');if(cut<0)continue;
  const name=/name="([^"]+)"/.exec(part.slice(0,cut))?.[1];if(name)result.set(name,Buffer.from(part.slice(cut+4).replace(/\r\n$/,''),'latin1'));}
 return result;
}
beforeEach(async()=>{
 fixture.post.mockReset();fixture.get.mockReset();fixture.resizeCalls.length=0;
 // Every possible Axios transport is intercepted; rejected response prevents
 // image saving/account refresh. No actual HTTP request or paid call occurs.
 fixture.post.mockRejectedValue({response:{status:418,data:'fixture capture only; no provider called'}});
 fixture.get.mockRejectedValue(new Error('Unplanned fixture GET: real network forbidden'));
 root=fs.mkdtempSync(path.join(os.tmpdir(),'inpaint-extras-'));const file=path.join(root,'source.png');fs.writeFileSync(file,png(512,512));
 expect((await loadImageFromPath(file)).ok).toBe(true);
});
afterEach(()=>{clearWorkbenchImage();const target=path.resolve(root);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('inpaint-extras-'))throw Error('Refusing fixture cleanup outside its temp root');fs.rmSync(target,{recursive:true,force:true});});

it.each(['full','focused'] as const)('%s inpaint posts both character captions and one preprocessed director_ref_0 multipart image',async mode=>{
 const input=extras(),pristine=structuredClone(input),region=mode==='focused'?{x:128,y:128,width:256,height:256}:undefined;
 const result=await (inpaintImage as (...args:any[])=>Promise<any>)(params,'nai-diffusion-4-5-full-inpainting',mask(),0.72,0,region,input);
 expect(result.ok).toBe(false);expect(fixture.post).toHaveBeenCalledOnce();
 const [url,body,options]=fixture.post.mock.calls[0];expect(url).toBe('https://image.novelai.net/ai/generate-image');
 expect(options.headers['content-type']??options.headers['Content-Type']).toMatch(/^multipart\/form-data/);
 const parts=multipart(body),request=JSON.parse(parts.get('request')!.toString('utf8')),p=request.parameters;
 expect(request.model).toBe('nai-diffusion-4-5-full-inpainting');expect(request.action).toBe('infill');
 expect(p.image).toBe('image');expect(p.mask).toBe('mask');expect(parts.has('image')).toBe(true);expect(parts.has('mask')).toBe(true);
 expect(p.v4_prompt.caption.char_captions.map((c:any)=>c.char_caption)).toEqual(['girl, red coat','boy, blue coat']);
 expect(p.v4_negative_prompt.caption.char_captions.map((c:any)=>c.char_caption)).toEqual(['red hair','blue hair']);
 const centers=mode==='focused'?[{x:0,y:0.3},{x:1,y:0.7}]:[{x:0.25,y:0.4},{x:0.75,y:0.6}];
 for(const field of ['v4_prompt','v4_negative_prompt'])for(let i=0;i<2;i++){expect(p[field].caption.char_captions[i].centers).toHaveLength(1);expect(p[field].caption.char_captions[i].centers[0].x).toBeCloseTo(centers[i].x,8);expect(p[field].caption.char_captions[i].centers[0].y).toBeCloseTo(centers[i].y,8);}
 expect(p.director_reference_images).toBeUndefined();expect(p.director_reference_images_cached).toHaveLength(1);expect(p.director_reference_images_cached[0].data).toBe('director_ref_0');
 const referenceBytes=parts.get('director_ref_0')!;expect(referenceBytes).toBeDefined();const reference=PNG.sync.read(referenceBytes);
 expect([reference.width,reference.height]).toEqual([1024,1536]);
 expect(p.director_reference_images_cached[0].cache_secret_key).toBe(crypto.createHash('sha256').update(referenceBytes).digest('hex'));
 expect(p.director_reference_descriptions[0].caption.base_caption).toBe('character&style');expect(p.director_reference_strength_values).toEqual([0.8]);expect(p.director_reference_secondary_strength_values).toEqual([0.3]);
 expect(input).toEqual(pristine);expect(fixture.get).not.toHaveBeenCalled();
});

it('focused inpaint preserves AI-choice positions while remapping only manually positioned captions',async()=>{
 const input=extras();input.charCaptions[1].useCoords=false;const pristine=structuredClone(input);
 await (inpaintImage as (...args:any[])=>Promise<any>)(params,'nai-diffusion-4-5-full-inpainting',mask(),1,0,{x:128,y:128,width:256,height:256},input);
 expect(fixture.post).toHaveBeenCalledOnce();const request=JSON.parse(multipart(fixture.post.mock.calls[0][1]).get('request')!.toString('utf8'));
 expect(request.parameters.v4_prompt.caption.char_captions[1].centers).toEqual([{x:0.5,y:0.5}]);expect(input).toEqual(pristine);
});

it('keeps the old six-argument no-extras inpaint call compatible',async()=>{
 await inpaintImage(params,'nai-diffusion-4-5-full-inpainting',mask(),0.5,0,undefined);
 expect(fixture.post).toHaveBeenCalledOnce();const body=fixture.post.mock.calls[0][1];expect(body.action).toBe('infill');expect(body.model).toBe('nai-diffusion-4-5-full-inpainting');
 expect(body.parameters.v4_prompt.caption.char_captions).toEqual([]);expect(body.parameters.director_reference_images_cached).toBeUndefined();
});

it.each(['nai-diffusion-4-full-inpainting','nai-diffusion-3-inpainting'] as NAIInpaintModel[])('rejects incompatible precise reference on %s before any generation POST',async model=>{
 const result=await (inpaintImage as (...args:any[])=>Promise<any>)(params,model,mask(),1,0,undefined,extras());
 expect(result.ok).toBe(false);expect(result.message).toMatch(/精准参考|Precise|V4\.5/);expect(fixture.post).not.toHaveBeenCalled();
});
