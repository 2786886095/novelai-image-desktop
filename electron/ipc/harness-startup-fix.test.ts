import {afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
vi.mock('node:child_process',()=>({spawn:vi.fn(),execFile:(_f:unknown,_a:unknown,_o:unknown,callback:Function)=>callback(null,'ok','')}));
import {HarnessEngine} from './harness-engine';
const roots:string[]=[];
afterEach(async()=>{for(const p of roots.splice(0))if(path.dirname(p)===os.tmpdir()&&path.basename(p).startsWith('studio-startup-fix-'))await fs.rm(p,{recursive:true,force:true});});
async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-startup-fix-'));roots.push(root);
  const seed=path.join(root,'seed'),home=path.join(root,'home');const files:Record<string,string>={};
  for(const n of ['node.exe','runtime/bin.js','plugins/studio-brand/index.js','plugins/studio-tools/index.js']){
    const p=path.join(seed,n);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,n);
    files[n]=crypto.createHash('sha256').update(n).digest('hex');
  }
  await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify({format:1,protocol:1,version:'0.1.0',upstream:'fixture',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files}));
  return {seed,home,options:{root:home,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})}};
}
describe('Reported launcher regressions',()=>{
  it('no remote update must not install the seed or lock Start on a fresh profile',async()=>{
    const {home,options}=await fixture();const engine=new HarnessEngine({...options,updateSource:async()=>null});
    await engine.update();expect(engine.busy).toBe(false);expect(engine.snapshot().phase).toBe('stopped');
    expect(await fs.stat(path.join(home,'active.json')).then(()=>true,()=>false)).toBe(false);
    expect(engine.snapshot().logs.some(l=>l.text.includes('校验 Agent'))).toBe(false);
  });
  it('first component installation reports measurable progress',async()=>{
    const {options}=await fixture();const engine=new HarnessEngine(options);await engine.update();
    expect(engine.snapshot().logs.some(l=>/准备组件：.*100%/.test(l.text))).toBe(true);
  });
  it('launcher does not render the unwanted explanation or data path footer',async()=>{
    const source=await fs.readFile('src/HarnessPage.tsx','utf8');
    expect(source).not.toContain('<footer');expect(source).not.toContain('title={state.dataDirectory}');
  });
});
