import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {HarnessEngine} from './harness-engine';
import {componentStatus} from '../../src/harness-component-status';
vi.mock('./harness-update-check',()=>({checkHarnessUpdates:vi.fn(async()=>({checkedAt:'now',component:null,official:'0.1.7-rc.2',plugins:{},errors:[],componentFailed:true}))}));
const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function fixture(installed='0.1.2'){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-bundled-test-'));roots.push(root);
  const seed=path.join(root,'seed'),active=path.join(root,'versions','current');
  await fs.mkdir(seed);await fs.mkdir(active,{recursive:true});
  const manifest={format:1,protocol:1,version:'0.1.4',upstream:'0.1.7-rc.2',platform:process.platform,arch:process.arch,node:'node.exe',cli:'runtime/bin.js',files:{'node.exe':'a'.repeat(64),'runtime/bin.js':'b'.repeat(64)}};
  await fs.writeFile(path.join(seed,'manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(active,'manifest.json'),JSON.stringify({...manifest,version:installed}));
  await fs.writeFile(path.join(root,'active.json'),JSON.stringify({slot:'current',version:installed}));
  return {root,seed,engine:new HarnessEngine({root,seed,workspace:root,openBrowser:async()=>{},bridge:async()=>({env:{},close:async()=>{}})})};
}
it('local 0.1.4 remains visible when remote check fails; check alone never installs',async()=>{
  const {root,engine}=await fixture();const before=await fs.readFile(path.join(root,'active.json'),'utf8');
  await engine.checkUpdates();const state=engine.snapshot();
  expect(state.updateInfo?.bundledComponent).toBe('0.1.4');expect(state.updateInfo?.bundledUpdate).toBe(true);
  expect(state.updateInfo?.componentFailed).toBe(true);expect(state.version).toBe('0.1.2');
  expect(componentStatus(state)).toEqual({key:'本机随附更新：{version}（待兼容检查）',params:{version:'0.1.4'}});
  expect(await fs.readFile(path.join(root,'active.json'),'utf8')).toBe(before);
});
it('installed seed is clearly labelled instead of no released component',async()=>{
  const {engine}=await fixture('0.1.4');await engine.checkUpdates();
  expect(engine.snapshot().updateInfo?.bundledUpdate).toBe(false);
  expect(componentStatus(engine.snapshot()).key).toBe('本机随附组件已安装：{version}');
});
it('older seed is not offered as an update and remote failure is preserved',async()=>{
  const {engine}=await fixture('0.1.5');await engine.checkUpdates();
  expect(engine.snapshot().updateInfo?.bundledUpdate).toBe(false);
  expect(componentStatus(engine.snapshot()).key).toBe('检查失败，请重试');
});
it('all added user-facing messages include five translations',async()=>{
  const locale=JSON.parse(await fs.readFile('src/feature-locales.json','utf8'));
  for(const key of ['本机随附更新：{version}（待兼容检查）','本机随附组件已安装：{version}','最新已发布组件：{version}']){
    expect(locale[key]).toHaveLength(5);expect(locale[key].every((v:string)=>v.includes('{version}'))).toBe(true);
  }
});
