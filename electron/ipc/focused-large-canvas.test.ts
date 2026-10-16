import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {PNG} from 'pngjs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {DEFAULT_PARAMS,type GenerateExtras} from '../../src/types';
import {prepareFocusedInpaintInput} from './focused-inpaint';

const fixture=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),history:[] as any[],root:'',resizes:[] as {from:number[];to:number[]}[]}));
vi.mock('axios',()=>({default:{post:fixture.post,get:fixture.get,isCancel:()=>false}}));
vi.mock('./proxy',()=>({proxyConfig:()=>({}),proxyConfigForUrl:async()=>({proxy:false})}));
vi.mock('./logger',()=>({logInfo:vi.fn(),logError:vi.fn(),appendLog:vi.fn()}));
vi.mock('./nai-accounts-runtime',()=>({currentNaiAccount:()=>null,getNaiAccountSummary:()=>({hasToken:true})}));
vi.mock('./store',()=>({getToken:()=> 'synthetic-focused-fixture-no-human-token',
 getSettings:()=>({outputDir:fixture.root,imageBaseUrl:'https://image.novelai.net',allowCustomEndpoint:false,allowCustomEndpointFallback:false,keepImageMetadata:true}),
 getAccountSummary:()=>({hasToken:true,anlasBalance:100}),getHistoryGroups:()=>[],addHistory:(items:any[])=>fixture.history.push(...items),
 ensureHistoryGroup:vi.fn(),setAccountSummary:vi.fn(),setToken:vi.fn(),updateHistoryItem:vi.fn()}));
vi.mock('electron',async()=>{
 const {PNG:Codec}=await import('pngjs');
 const image=(png:any):any=>({isEmpty:()=>false,getSize:()=>({width:png.width,height:png.height}),toPNG:()=>Codec.sync.write(png),
  resize:({width,height}:{width:number;height:number})=>{fixture.resizes.push({from:[png.width,png.height],to:[width,height]});const out=new Codec({width,height});
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(Math.min(png.height-1,Math.floor(y*png.height/height))*png.width+Math.min(png.width-1,Math.floor(x*png.width/width)))*4;png.data.copy(out.data,(y*width+x)*4,at,at+4);}return image(out);}});
 return {app:{isPackaged:false,getPath:()=>{throw Error('Human profile forbidden in focused fixture');}},dialog:{showOpenDialog:vi.fn()},protocol:{},nativeImage:{createFromBuffer:(b:Buffer)=>image(Codec.sync.read(b))}};
});
import {clearWorkbenchImage,inpaintImage,loadImageFromPath,prepareInpaintAssets} from './nai';

const hash=(b:Buffer)=>crypto.createHash('sha256').update(b).digest('hex');
const record=(label:string,value:unknown)=>process.stdout.write(label+' '+JSON.stringify(value)+'\n');
const region={x:320,y:256,width:512,height:512};
function sourceAndMask(width:number,height:number,r=region){
 const source=new PNG({width,height}),mask=new PNG({width,height});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;source.data[i]=(x*13+y*7)%251;source.data[i+1]=(x+y*3)%239;source.data[i+2]=(x*5+y)%233;source.data[i+3]=32+(x+y)%224;}
 const inset=Math.min(64,Math.floor(Math.min(r.width,r.height)/4));
 for(let y=r.y+inset;y<r.y+r.height-inset;y++)for(let x=r.x+inset;x<r.x+r.width-inset;x++)mask.data.fill(255,(y*width+x)*4,(y*width+x)*4+4);
 return {source,mask,sourceBytes:PNG.sync.write(source),maskBytes:PNG.sync.write(mask)};
}
function red(width:number,height:number){const p=new PNG({width,height});for(let i=0;i<p.data.length;i+=4){p.data[i]=211;p.data[i+1]=37;p.data[i+2]=99;p.data[i+3]=255;}return PNG.sync.write(p);}
function wire(body:any){
 if(typeof body?.getBuffer!=='function')return {request:body,image:Buffer.from(body.parameters.image,'base64'),mask:Buffer.from(body.parameters.mask,'base64')};
 const parts=new Map<string,Buffer>(),boundary=body.getBoundary(),raw=body.getBuffer().toString('latin1');
 for(let part of raw.split('--'+boundary).slice(1)){if(part.startsWith('--'))continue;part=part.replace(/^\r\n/,'');const at=part.indexOf('\r\n\r\n');if(at<0)continue;const name=/name="([^"]+)"/.exec(part.slice(0,at))?.[1];if(name)parts.set(name,Buffer.from(part.slice(at+4).replace(/\r\n$/,''),'latin1'));}
 return {request:JSON.parse(parts.get('request')!.toString('utf8')),image:parts.get('image')!,mask:parts.get('mask')!};
}
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'focused-large-fixture-'));fixture.history=[];fixture.resizes=[];fixture.post.mockReset();fixture.post.mockRejectedValue({response:{status:418,data:'fixture capture only; no paid request'}});fixture.get.mockReset();fixture.get.mockRejectedValue(Error('Fixture rejects all real network GETs'));});
afterEach(()=>{clearWorkbenchImage();const target=path.resolve(fixture.root);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith('focused-large-fixture-'))throw Error('Unsafe fixture cleanup');fs.rmSync(target,{recursive:true,force:true});});

it('1152x1728 focused crop ignores full-image target validation and retains original coordinates',()=>{
 const f=sourceAndMask(1152,1728),resize=vi.fn((b:Buffer)=>b);
 const p=prepareFocusedInpaintInput(f.sourceBytes,f.maskBytes,region,{width:1152,height:1728},resize);
 expect([p.source.width,p.source.height]).toEqual([1152,1728]);expect(p.region).toEqual(region);expect(resize).not.toHaveBeenCalled();
 const crop=PNG.sync.read(p.crop),at=(region.y*1152+region.x)*4;expect(crop.data.subarray(0,4)).toEqual(f.source.data.subarray(at,at+4));
});

it('4K focused crop does not apply a custom whole-canvas resize',()=>{
 const f=sourceAndMask(4096,2160),resize=vi.fn((b:Buffer,w:number,h:number)=>red(w,h));
 const p=prepareFocusedInpaintInput(f.sourceBytes,f.maskBytes,region,{width:1024,height:1024},resize);
 expect([p.source.width,p.source.height]).toEqual([4096,2160]);expect(p.region).toEqual(region);expect(resize).not.toHaveBeenCalled();
});

it.each([[1152,1728],[4096,2160]])('%ix%i actual inpaint wire crops locally, saves original canvas/history and preserves every unmasked RGBA byte',async(width,height)=>{
 const r=width===4096?{x:3200,y:1024,width:512,height:512}:region,f=sourceAndMask(width,height,r),file=path.join(fixture.root,'source.png');fs.writeFileSync(file,f.sourceBytes);
 const loaded=await loadImageFromPath(file);expect(loaded.ok).toBe(true);expect(loaded.image).toMatchObject({width,height});
 fixture.post.mockImplementation(async()=>({data:red(1024,1024)}));
 const extras:GenerateExtras={charCaptions:[{prompt:'girl',negativePrompt:'hat',useCoords:true,x:(r.x+r.width*.25)/width,y:(r.y+r.height*.75)/height}],vibeImages:[]},original=structuredClone(extras);
 const result=await inpaintImage({...DEFAULT_PARAMS,model:'nai-diffusion-5-full',positivePrompt:'repair fixture',width,height,seedMode:'fixed',seed:55},'nai-diffusion-4-5-full-inpainting',f.maskBytes.toString('base64'),1,0,r,extras);
 record('FOCUSED_LARGE_RESULT',{source:[width,height],ok:result.ok,message:result.message,postCalls:fixture.post.mock.calls.length,sourceSha256:hash(f.sourceBytes),maskSha256:hash(f.maskBytes)});
 expect(result.ok,result.message).toBe(true);expect(fixture.post).toHaveBeenCalledOnce();expect(fixture.history).toHaveLength(1);expect(result.items).toHaveLength(1);
 const sent=wire(fixture.post.mock.calls[0][1]),p=sent.request.parameters,im=PNG.sync.read(sent.image),ma=PNG.sync.read(sent.mask);
 expect(sent.request.action).toBe('infill');expect([p.width,p.height]).toEqual([im.width,im.height]);expect([ma.width,ma.height]).toEqual([im.width,im.height]);
 expect(p.width%64).toBe(0);expect(p.height%64).toBe(0);expect(p.width*p.height).toBeLessThanOrEqual(1048576);expect(p.width).toBeGreaterThan(r.width);
 const cropOrigin=(r.y*width+r.x)*4;expect(im.data.subarray(0,4)).toEqual(f.source.data.subarray(cropOrigin,cropOrigin+4));
 for(const key of ['v4_prompt','v4_negative_prompt'])expect(p[key].caption.char_captions[0].centers[0]).toEqual({x:.25,y:.75});expect(extras).toEqual(original);
 expect(ma.data[0]).toBe(0);expect(ma.data[(Math.floor(ma.height/2)*ma.width+Math.floor(ma.width/2))*4]).toBe(255);
 expect(fixture.resizes.every(c=>c.from[0]!==width||c.from[1]!==height)).toBe(true);
 const item=result.items[0],out=PNG.sync.read(fs.readFileSync(item.filePath));expect([out.width,out.height,item.width,item.height,item.params.width,item.params.height]).toEqual([width,height,width,height,width,height]);
 let mismatch=0,painted=0;for(let i=0;i<f.source.data.length;i+=4){if(f.mask.data[i]>0&&f.mask.data[i+3]>0){painted++;continue;}for(let c=0;c<4;c++)if(out.data[i+c]!==f.source.data[i+c])mismatch++;}
 expect(painted).toBeGreaterThan(0);expect(mismatch).toBe(0);const center=((r.y+256)*width+r.x+256)*4;expect([...out.data.subarray(center,center+4)]).toEqual([211,37,99,255]);
 record('FOCUSED_LARGE_WIRE_SAVED',{source:[width,height],work:[p.width,p.height],output:[out.width,out.height],history:[item.width,item.height],unmaskedByteMismatches:mismatch,resultSha256:hash(fs.readFileSync(item.filePath))});
});

it('focused thin ROI keeps its >1600 work axis in actual image, mask and payload',async()=>{
 const r={x:128,y:128,width:8,height:768},f=sourceAndMask(1152,1728,r),file=path.join(fixture.root,'source.png');fs.writeFileSync(file,f.sourceBytes);await loadImageFromPath(file);
 fixture.post.mockRejectedValue({response:{status:418,data:'capture only; no paid request'}});
 await inpaintImage({...DEFAULT_PARAMS,positivePrompt:'thin fixture',width:1024,height:1024},'nai-diffusion-4-5-full-inpainting',f.maskBytes.toString('base64'),1,0,r);
 expect(fixture.post).toHaveBeenCalledOnce();const w=wire(fixture.post.mock.calls[0][1]),p=w.request.parameters,image=PNG.sync.read(w.image),mask=PNG.sync.read(w.mask);
 expect(p.height).toBeGreaterThan(1600);expect(p.width*p.height).toBeLessThanOrEqual(1048576);expect([p.width,p.height]).toEqual([image.width,image.height]);expect([p.width,p.height]).toEqual([mask.width,mask.height]);
 record('FOCUSED_THIN_WIRE',{work:[p.width,p.height],image:[image.width,image.height],mask:[mask.width,mask.height]});
});

it('oversized programmatic focused ROI is rejected explicitly before POST rather than silently narrowed',async()=>{
 const r={x:0,y:0,width:1024,height:1024},f=sourceAndMask(1152,1728,r),file=path.join(fixture.root,'source.png');fs.writeFileSync(file,f.sourceBytes);await loadImageFromPath(file);
 const result=await inpaintImage({...DEFAULT_PARAMS,positivePrompt:'too large',width:1024,height:1024},'nai-diffusion-4-5-full-inpainting',f.maskBytes.toString('base64'),1,0,r);
 expect(result.ok).toBe(false);expect(result.message).toMatch(/589.?824|选区.*过大|缩小.*区域/);expect(fixture.post).not.toHaveBeenCalled();
});

it('nonfocused whole-image 1600 output guard remains in force',()=>{
 const f=sourceAndMask(1152,1728);expect(()=>prepareInpaintAssets(f.sourceBytes,f.maskBytes.toString('base64'),{width:1152,height:1728})).toThrow(/1600/);
});
