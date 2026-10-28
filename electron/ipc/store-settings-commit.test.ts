import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
const fixture=vi.hoisted(()=>({root:''}));
vi.mock('electron',()=>({app:{isPackaged:false,getPath:()=>fixture.root,getAppPath:()=>fixture.root},safeStorage:{isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}}));
beforeEach(()=>{fixture.root=fs.mkdtempSync(path.join(os.tmpdir(),'settings-commit-'));vi.resetModules();});
afterEach(()=>{
 vi.restoreAllMocks();
 if(path.dirname(fixture.root)!==path.resolve(os.tmpdir())||!path.basename(fixture.root).startsWith('settings-commit-'))throw Error('Invalid fixture cleanup');
 fs.rmSync(fixture.root,{recursive:true,force:true});
});
it('a failed settings save retains both disk and the last committed in-memory setting',async()=>{
 const {setSetting,getSetting}=await import('./store');
 setSetting('theme','dark');
 const file=path.join(fixture.root,'novelai-image-desktop.json'),before=fs.readFileSync(file);
 vi.spyOn(fs,'renameSync').mockImplementation(()=>{throw Object.assign(new Error('busy fixture'),{code:'EPERM'});});
 expect(()=>setSetting('theme','light')).toThrow('busy fixture');
 expect(getSetting('theme')).toBe('dark');
 expect(fs.readFileSync(file)).toEqual(before);
});
