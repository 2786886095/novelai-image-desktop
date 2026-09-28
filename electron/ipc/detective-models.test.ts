import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const mock=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{getPath:()=>mock.root}}));
vi.mock('./store',()=>({atomicWriteFileSync:(p:string,s:string)=>fs.writeFileSync(p,s)}));
import {readDetectiveConfig,saveDetectiveConfig,detectiveProfile,updateDetectiveProfile} from './detective-models';
beforeEach(()=>{mock.root=fs.mkdtempSync(path.join(os.tmpdir(),'detective-models-'));});
afterEach(()=>fs.rmSync(mock.root,{recursive:true,force:true}));
it('migrates the active legacy pair without copying it into the other variant',()=>{
 fs.writeFileSync(path.join(mock.root,'artist-detective-runtime.json'),JSON.stringify({python:'full-python',assets:'full-model',variant:'full',directory:'old-results',downloadVariant:'light'}));
 const c=readDetectiveConfig();expect(detectiveProfile(c,'full')).toMatchObject({python:'full-python',assets:'full-model'});
 expect(detectiveProfile(c,'light').assets).toBeUndefined();expect(c.selectedVariant).toBe('light');expect(c.directory).toBe('old-results');
});
it('keeps both runtime/model/download directory pairs across save and reload',()=>{
 let c=readDetectiveConfig();c=updateDetectiveProfile(c,'full',{python:'full-python',assets:'full-model',downloadDirectory:'full-download'});
 c=updateDetectiveProfile(c,'light',{python:'light-python',assets:'light-model',downloadDirectory:'light-download'});saveDetectiveConfig(c);
 const next=readDetectiveConfig();expect(detectiveProfile(next,'full').python).toBe('full-python');expect(detectiveProfile(next,'light').python).toBe('light-python');
 expect(detectiveProfile(next,'full').downloadDirectory).toBe('full-download');expect(detectiveProfile(next,'light').downloadDirectory).toBe('light-download');
 expect(next.python).toBeUndefined(); // Registering paths is not activation.
});
