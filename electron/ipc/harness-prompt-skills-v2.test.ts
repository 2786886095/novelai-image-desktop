import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createServer,type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
// Import and execute the actual packaged ESM plugin. Only the Harness peer ABI
// and native bridge are synthetic; every HTTP request remains on 127.0.0.1.
let server:Server,oldEnv:Record<string,string|undefined>,module:any;
const tools=new Map<string,any>(),requests:any[]=[];
let current:any,responseFailure=false,sequence=0;
const prompt='synthetic prepared positive prompt';
const context=(label:string)=>({callId:'v2-fixture-'+(++sequence)+'-'+label,signal:new AbortController().signal,agent:{session:{id:'fixture-session',deriveMessages:()=>[{id:'user-'+sequence,role:'user',content:[{type:'text',text:'fixture scene'}]}]}}});
beforeAll(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'studio-prompt-skill-plugin-'));const profiles=path.join(dir,'profiles');await fs.mkdir(profiles,{recursive:true});
 const define=path.join(dir,'define-tool.mjs');await fs.writeFile(define,'export const defineTool = value => value;');await fs.writeFile(path.join(profiles,'package.json'),'{}');
 const peer=path.join(profiles,'node_modules/@langbai/dsh-studio-library');await fs.mkdir(peer,{recursive:true});
 await fs.writeFile(path.join(peer,'package.json'),JSON.stringify({type:'module',exports:{'./jev':'./jev.mjs','./jev-config':'./jev-config.mjs'}}));
 await fs.writeFile(path.join(peer,'jev.mjs'),`export const HYBRID_INSTRUCTIONS='fixture';export const PROMPT_ARGUMENTS={type:'object',properties:{}};export function decidePrompt(){throw Error('No real model/advanced work is permitted in fixture');}`);
 await fs.writeFile(path.join(peer,'jev-config.mjs'),`export async function readJevConfig(){return {}};export async function jevStatus(){return {fixture:true}}`);
 server=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const request=JSON.parse(raw);requests.push(request);const {tool,args}=request;let data:any;
  if(tool==='studio_prompt_template')data={...current,templateVersion:current.version};
  else if(tool==='langbai_convert_prompt'||tool==='langbai_reverse_prompt')data={result:prompt,prompt,template:{...current,kind:tool==='langbai_reverse_prompt'?'reverse':'convert',mode:args.mode??current.mode,version:args.templateVersion??current.version,skillVersion:args.skillVersion??current.skillVersion}};
  else if(tool==='studio_generate_from_description')data={positivePrompt:'synthetic workflow result',template:{...current}};
  else data={synthetic:true,noImageGenerated:true};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:!responseFailure,data,output:responseFailure?'信息不足：synthetic failure':JSON.stringify(data)}));
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const keys=['STUDIO_DSH_TOOLS','STUDIO_BRIDGE_URL','STUDIO_BRIDGE_TOKEN','DSH_HOME','STUDIO_WORKSPACE'];oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{STUDIO_DSH_TOOLS:define,STUDIO_BRIDGE_URL:`http://127.0.0.1:${(server.address() as AddressInfo).port}`,STUDIO_BRIDGE_TOKEN:'synthetic-local-only',DSH_HOME:dir});delete process.env.STUDIO_WORKSPACE;
 module=await import(/* @vite-ignore */pathToFileURL(path.resolve('harness/plugins/studio-tools/index.js')).href);
 await module.apply({tools:{register:(tool:any)=>tools.set(tool.name,tool)},workspaceRegistry:{list:()=>[]}});
});
afterAll(async()=>{for(const [k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
beforeEach(()=>{requests.length=0;responseFailure=false;current={kind:'convert',mode:'mixed',version:'v5',skillVersion:'2.0.0',bodySha256:'same-body-for-both-editions'};});
describe('actual packaged Harness prompt skill plumbing',()=>{
 it('advertises a separate skill edition enum in the actual prepare tool schema',()=>expect(tools.get('langbai_prepare_image_prompt').parameters.args.properties.skillVersion.enum).toEqual(['1.0.0','2.0.0']));
 for(const edition of ['1.0.0','2.0.0'])for(const image of [false,true])it(`forwards ${edition} and selected model/mode for ${image?'reverse':'convert'} through actual HTTP`,async()=>{
  const args={text:'actual fixture input',mode:'tags',templateVersion:'v5',skillVersion:edition,...(image?{imageAttachmentId:'registered-fixture-image'}:{})};
  const result=await tools.get('langbai_prepare_image_prompt').execute({args},context('prepare'));expect(result.ok).toBe(true);expect(requests).toHaveLength(1);expect(requests[0].tool).toBe(image?'langbai_reverse_prompt':'langbai_convert_prompt');expect(requests[0].args).toMatchObject({mode:'tags',templateVersion:'v5',skillVersion:edition});
  expect(result.template.skillVersion).toBe(edition);
 });
 it('forwards edition to the single authorized native pipeline without implementing paid generation itself',async()=>{
  const result=await tools.get('langbai_prepare_image_prompt').execute({args:{text:'fixture scene',mode:'natural',templateVersion:'v5',skillVersion:'1.0.0',generate:{count:1}}},context('pipeline'));
  expect(result.ok).toBe(true);expect(requests).toHaveLength(1);expect(requests[0]).toMatchObject({tool:'studio_generate_from_description',args:{mode:'natural',templateVersion:'v5',skillVersion:'1.0.0',generate:{count:1}}});
 });
 for(const args of [{text:'scene',skillVersion:'3.0.0'},{text:'scene',skillVersion:'2.0.0',templateVersion:'v4.5'}])it(`rejects invalid edition/model locally ${JSON.stringify(args)}`,async()=>{
  await expect(tools.get('langbai_prepare_image_prompt').execute({args},context('invalid'))).rejects.toThrow();expect(requests).toHaveLength(0);
 });
 it('does not reuse identical-body certification across a skill edition switch',async()=>{
  current.skillVersion='1.0.0';await tools.get('langbai_prepare_image_prompt').execute({args:{text:'scene',mode:'mixed',templateVersion:'v5',skillVersion:'1.0.0'}},context('cache-before'));
  requests.length=0;current.skillVersion='2.0.0';await tools.get('langbai_generate_image').execute({args:{positivePrompt:prompt,count:1}},context('cache-after'));
  expect(requests[0]).toMatchObject({tool:'studio_prompt_template',args:{kind:'convert'}});expect(requests.some(x=>x.tool==='studio_generate_from_description')).toBe(true);expect(requests.some(x=>x.tool==='langbai_generate_image')).toBe(false);
 });
 it('does not reuse certification across a target model switch',async()=>{
  current.skillVersion='1.0.0';await tools.get('langbai_prepare_image_prompt').execute({args:{text:'scene',mode:'mixed',templateVersion:'v5',skillVersion:'1.0.0'}},context('model-before'));
  requests.length=0;current.version='v4.5';await tools.get('langbai_generate_image').execute({args:{positivePrompt:prompt,count:1}},context('model-after'));
  expect(requests.some(x=>x.tool==='studio_generate_from_description')).toBe(true);expect(requests.some(x=>x.tool==='langbai_generate_image')).toBe(false);
 });
 it('reads the correct reverse slot before reusing an unchanged prepared reverse prompt',async()=>{
  current.kind='reverse';await tools.get('langbai_prepare_image_prompt').execute({args:{imageAttachmentId:'registered-fixture',text:'scene',mode:'mixed',templateVersion:'v5',skillVersion:'2.0.0'}},context('reverse-cache'));
  requests.length=0;await tools.get('langbai_generate_image').execute({args:{positivePrompt:prompt,count:1}},context('same-reverse'));
  expect(requests[0]).toMatchObject({tool:'studio_prompt_template',args:{kind:'reverse'}});expect(requests.some(x=>x.tool==='langbai_generate_image')).toBe(true);expect(requests.some(x=>x.tool==='studio_generate_from_description')).toBe(false);
 });
});
