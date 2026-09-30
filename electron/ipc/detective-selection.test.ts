import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const mock=vi.hoisted(()=>({root:'',states:{full:'passed',light:'passed'},verify:vi.fn(),pick:vi.fn()}));
vi.mock('electron',()=>({app:{getPath:()=>mock.root},dialog:{showOpenDialog:mock.pick},shell:{}}));
vi.mock('./store',()=>({getSetting:()=> 'zh-CN',getToken:()=>'',atomicWriteFileSync:(p:string,s:string)=>fs.writeFileSync(p,s)}));
vi.mock('./local-media-protocol',()=>({toLocalMediaUrl:(p:string)=>p}));
vi.mock('./detective-runtime-check',()=>({detectiveRuntimeChecking:()=>false,validateDetectiveRuntime:mock.verify,detectiveRuntimeValidation:(p:{variant:'full'|'light'})=>({state:mock.states[p.variant]})}));
import {detectiveStatus,detectiveSelectModel,detectiveVerifyRuntime,detectiveConfigure} from './artist-detective';
let cfg:string;
beforeEach(()=>{
 mock.root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-selection-'));cfg=path.join(mock.root,'artist-detective-runtime.json');mock.states={full:'passed',light:'passed'};
 const profiles=Object.fromEntries(['full','light'].map(v=>{const assets=path.join(mock.root,v);fs.mkdirSync(assets);fs.writeFileSync(path.join(assets,'manifest.json'),'{}');const python=path.join(mock.root,v+'.exe');fs.writeFileSync(python,'fixture');return [v,{python,assets}];}));
 fs.writeFileSync(cfg,JSON.stringify({...profiles.full,variant:'full',selectedVariant:'full',models:profiles,directory:'retained-history'}));
 mock.verify.mockReset().mockImplementation(async(p:{variant:'full'|'light'})=>{mock.states[p.variant]='passed';return {state:'passed'};});mock.pick.mockReset();
});
afterEach(()=>fs.rmSync(mock.root,{recursive:true,force:true}));
it('switches between both verified pairs without downloading or losing history',()=>{
 const light=detectiveSelectModel('light');expect(light.selectedVariant).toBe('light');
 let c=JSON.parse(fs.readFileSync(cfg,'utf8'));expect(c.python).toBe(c.models.light.python);expect(c.assets).toBe(c.models.light.assets);expect(c.directory).toBe('retained-history');
 detectiveSelectModel('full');c=JSON.parse(fs.readFileSync(cfg,'utf8'));expect(c.python).toBe(c.models.full.python);expect(c.models.light.assets).toContain('light');expect(mock.verify).not.toHaveBeenCalled();
});
it('retains full when light validation fails, then activates light only after its own retry succeeds',async()=>{
 mock.states.light='failed';const s=detectiveSelectModel('light');expect(s.runtimeValidation?.state).toBe('failed');
 expect(JSON.parse(fs.readFileSync(cfg,'utf8')).variant).toBe('full');
 await detectiveVerifyRuntime();expect(mock.verify).toHaveBeenCalledWith(expect.objectContaining({variant:'light'}),true);
 const c=JSON.parse(fs.readFileSync(cfg,'utf8'));expect(c.variant).toBe('light');expect(c.models.full.assets).toContain('full');
});
it('manual selection only changes the selected profile, not the previously active pair',async()=>{
 mock.states.light='failed';detectiveSelectModel('light');mock.pick.mockResolvedValue({canceled:false,filePaths:['replacement-light-assets']});
 await detectiveConfigure('assets');const c=JSON.parse(fs.readFileSync(cfg,'utf8'));
 expect(c.models.light.assets).toBe('replacement-light-assets');expect(c.assets).toBe(c.models.full.assets);
});
it('opening and polling never launch validation, even when the saved check is absent',()=>{
 mock.states.full='unchecked';
 const before=fs.readFileSync(cfg,'utf8');
 for(let i=0;i<5;i++)expect(detectiveStatus().runtimeValidation?.state).toBe('unchecked');
 expect(mock.verify).not.toHaveBeenCalled();expect(fs.readFileSync(cfg,'utf8')).toBe(before);
});
it('cancelling directory selection does not trigger a first check',async()=>{
 mock.states.full='unchecked';mock.pick.mockResolvedValue({canceled:true,filePaths:[]});
 await detectiveConfigure('assets');expect(mock.verify).not.toHaveBeenCalled();
});
it('explicitly selecting an unchecked model performs its first check once',async()=>{
 mock.states.light='unchecked';detectiveSelectModel('light');await Promise.resolve();
 expect(mock.verify).toHaveBeenCalledTimes(1);
 expect(mock.verify).toHaveBeenCalledWith(expect.objectContaining({variant:'light'}),false);
 detectiveSelectModel('full');detectiveSelectModel('light');detectiveStatus();
 expect(mock.verify).toHaveBeenCalledTimes(1);
});
it('accepting an existing directory performs the first check, but reusing it does not repeat it',async()=>{
 mock.states.full='unchecked';const c=JSON.parse(fs.readFileSync(cfg,'utf8'));
 mock.pick.mockResolvedValue({canceled:false,filePaths:[c.models.full.assets]});
 await detectiveConfigure('assets');expect(mock.verify).toHaveBeenCalledTimes(1);
 await detectiveConfigure('assets');detectiveStatus();expect(mock.verify).toHaveBeenCalledTimes(1);
});
