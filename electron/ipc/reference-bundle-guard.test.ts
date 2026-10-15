import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {PNG} from 'pngjs';
import {afterAll,afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DEFAULT_PARAMS,type GenerateExtras,type GenerateParams,type NAIInpaintModel} from '../../src/types';

const fixture=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),resizeCalls:[] as {width:number;height:number}[]}));
vi.mock('axios',()=>({default:{post:fixture.post,get:fixture.get,isCancel:()=>false}}));
vi.mock('./proxy',()=>({proxyConfig:()=>({}),proxyConfigForUrl:async()=>({proxy:false})}));
vi.mock('./logger',()=>({logInfo:vi.fn(),logError:vi.fn(),appendLog:vi.fn()}));
vi.mock('./store',()=>({getToken:()=> 'synthetic-inpaint-test-token-not-a-user-token',
 getSettings:()=>({imageBaseUrl:'https://image.novelai.net',allowCustomEndpoint:false,allowCustomEndpointFallback:false}),
 getAccountSummary:()=>({hasToken:true,anlasBalance:100}),getHistoryGroups:()=>[],
 addHistory:vi.fn(),ensureHistoryGroup:vi.fn(()=>({id:"audit-group",name:"audit"})),setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
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
import {clearWorkbenchImage,generateImage,generateI2I,redrawImage,inpaintImage,quoteAnlasCost,loadImageFromPath} from './nai';

let root='';
function png(width:number,height:number,value=150){const p=new PNG({width,height});for(let i=0;i<p.data.length;i+=4){p.data[i]=value;p.data[i+1]=value;p.data[i+2]=value;p.data[i+3]=255;}return PNG.sync.write(p);}
const params:GenerateParams={...DEFAULT_PARAMS,model:'nai-diffusion-4-5-full',positivePrompt:'repair scene',negativePrompt:'audit negative',stylePrompt:'audit style',qualityPreset:'none',qualityToggle:false,ucPreset:0,width:512,height:512,seedMode:'fixed',seed:12345,steps:23,cfgScale:5.5,cfgRescale:0.22,sampler:'k_dpmpp_2m',noiseSchedule:'exponential',variety:true};
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


const observed:any[]=[];
afterAll(()=>{if(process.env.CONDITIONING_EVIDENCE_PATH)fs.writeFileSync(process.env.CONDITIONING_EVIDENCE_PATH,JSON.stringify(observed,null,2));});
const modes=['generate','i2i','redraw'] as const;
async function run(mode:typeof modes[number],bundle:GenerateExtras){
 if(mode==='generate')return generateImage(params,bundle);
 if(mode==='i2i')return generateI2I(params,{strength:0.62,noise:0,extraNoiseSeed:54321},bundle);
 return redrawImage({params,imageBase64:png(512,512).toString('base64'),strength:0.62,noise:0,extras:bundle,groupName:'audit'});
}
function wire(call:any[]){const [url,body]=call;if(url.endsWith('/ai/encode-vibe'))return {url,encodingRequest:true,model:body.model};
 let request=body,partNames:string[]=[];if(typeof body?.getBuffer==='function'){const parts=multipart(body);partNames=[...parts.keys()];request=JSON.parse(parts.get('request')!.toString('utf8'));}
 const p=request.parameters;
 return {url,action:request.action,model:request.model,partNames,chars:p.v4_prompt?.caption?.char_captions,negativeChars:p.v4_negative_prompt?.caption?.char_captions,vibe:p.reference_image_multiple,vibeStrength:p.reference_strength_multiple,vibeInfo:p.reference_information_extracted_multiple,precise:p.director_reference_images_cached,preciseStrength:p.director_reference_strength_values,preciseSecondary:p.director_reference_secondary_strength_values,steps:p.steps,scale:p.scale,rescale:p.cfg_rescale,sampler:p.sampler,schedule:p.noise_schedule,variety:p.skip_cfg_above_sigma,seed:p.seed,strength:p.strength,noise:p.noise,extraNoiseSeed:p.extra_noise_seed,image:p.image==='image'?'multipart image':p.image?'base64 image':undefined};
}
function record(test:string,result:any){const calls=fixture.post.mock.calls.map(wire);observed.push({test,result,calls});return calls;}
function encodedVibe(){return {base64:'',infoExtracted:0.7,strength:0.65,encodings:[{model:params.model,infoExtracted:0.7,encoding:'YXVkaXQtZW5jb2RlZC12aWJl'}]};}
function checkAdvanced(p:any,mode:typeof modes[number]){expect(p.steps).toBe(23);expect(p.scale).toBe(5.5);expect(p.rescale).toBe(0.22);expect(p.sampler).toBe('k_dpmpp_2m');expect(p.schedule).toBe('exponential');expect(p.variety).toBe(58);expect(p.seed).toBe(12345);if(mode!=='generate'){expect(p.action).toBe('img2img');expect(p.strength).toBe(0.62);expect(p.noise).toBe(0);expect(p.image).toBe('multipart image');}if(mode==='i2i')expect(p.extraNoiseSeed).toBe(54321);}
it.each(modes)('%s sends two roles, precise multipart reference, and advanced parameters',async mode=>{
 const input=extras(),before=structuredClone(input),result=await run(mode,input),calls=record(mode+'-precise',result);
 expect(fixture.post).toHaveBeenCalledOnce();const p=calls[0];expect(p.partNames).toContain('director_ref_0');expect(p.chars.map((x:any)=>x.char_caption)).toEqual(['girl, red coat','boy, blue coat']);expect(p.negativeChars.map((x:any)=>x.char_caption)).toEqual(['red hair','blue hair']);expect(p.chars.map((x:any)=>x.centers[0])).toEqual([{x:0.25,y:0.4},{x:0.75,y:0.6}]);expect(p.preciseStrength).toEqual([0.8]);expect(p.preciseSecondary).toEqual([0.3]);checkAdvanced(p,mode);expect(input).toEqual(before);expect(fixture.get).not.toHaveBeenCalled();
});
it.each(modes)('%s preserves matching encoded vibe and role captions without encoding call',async mode=>{
 const input=extras();input.preciseReferences=[];input.vibeImages=[encodedVibe()];const result=await run(mode,input),calls=record(mode+'-vibe',result);
 expect(fixture.post).toHaveBeenCalledOnce();const p=calls[0];expect(p.vibe).toEqual(['YXVkaXQtZW5jb2RlZC12aWJl']);expect(p.vibeStrength).toEqual([0.65]);expect(p.vibeInfo).toEqual([0.7]);expect(p.chars).toHaveLength(2);expect(p.partNames).toEqual([]);
});
it.each(modes)('%s should reject mixed precise+encoded vibe before generation (regression)',async mode=>{
 const input=extras();input.vibeImages=[encodedVibe()];const result=await run(mode,input);record(mode+'-mixed-encoded',result);
 expect(fixture.post.mock.calls.length).toBe(0);expect(result.ok).toBe(false);expect(result.message).toMatch(/不能.*同时|incompatible|cannot.*together/i);
});
it.each(modes)('%s should reject mixed precise+raw vibe before encode-vibe (regression)',async mode=>{
 const input=extras();input.vibeImages=[{base64:png(16,16,110+modes.indexOf(mode)*10).toString('base64'),infoExtracted:0.7,strength:0.65}];
 fixture.post.mockImplementation(async(url:string)=>{if(url.endsWith('/ai/encode-vibe'))return {data:Buffer.from('synthetic encoded vibe')};throw {response:{status:418,data:'fixture capture only; no provider called'}};});
 const result=await run(mode,input);record(mode+'-mixed-raw',result);
 expect(fixture.post.mock.calls.length).toBe(0);expect(result.ok).toBe(false);
});

it('inpaint control rejects the same mixed bundle before any encoding or generation',async()=>{
 const input=extras();input.vibeImages=[{base64:png(16,16,190).toString('base64'),infoExtracted:0.7,strength:0.65}];
 const result=await inpaintImage(params,'nai-diffusion-4-5-full-inpainting',mask(),1,0,undefined,input);record('inpaint-mixed-control',result);
 expect(fixture.post.mock.calls.length).toBe(0);expect(result.ok).toBe(false);expect(result.message).toContain('不能');
});

// request-price receives no references; the canonical quote must add their fee.
it.each([{refs:0,samples:1},{refs:1,samples:1},{refs:2,samples:1},{refs:5,samples:3}])('official base price includes $refs precise refs across $samples output(s)',async ({refs,samples})=>{
 const input=extras();input.preciseReferences=Array.from({length:refs},()=>input.preciseReferences![0]);
 fixture.post.mockResolvedValue({data:{cost:5}});
 const quote=await quoteAnlasCost({feature:'generate',params,extras:input,batchCount:samples,account:{hasToken:true,hasActiveSubscription:true,tierLevel:1,anlasBalance:100}});
 expect(quote.source).toBe('official-api');
 expect(quote.amount).toBe((5+5*refs)*samples);
 expect(fixture.post).toHaveBeenCalledOnce();
 const [url,payload]=fixture.post.mock.calls[0];
 expect(url).toMatch(/request-price$/);
 expect(payload.parameters.director_reference_images).toBeUndefined();
 expect(payload.parameters.reference_image_multiple ?? []).toHaveLength(0);
});
