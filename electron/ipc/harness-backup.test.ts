import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {backupHarnessHome,restoreHarnessBackup} from './harness-backup';
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0)){if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('studio-backup-test-'))throw Error('Unexpected cleanup path');await fs.rm(root,{recursive:true,force:true});}});
async function fixture(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-backup-test-'));roots.push(root);const home=path.join(root,'home'),engine=path.join(root,'engine'),backup=path.join(root,'backup');await fs.mkdir(home);await fs.mkdir(engine);await fs.writeFile(path.join(home,'user.json'),'user config');await fs.writeFile(path.join(engine,'sdk.js'),'retained engine');await fs.symlink(engine,path.join(home,'sdk'),process.platform==='win32'?'junction':'dir');return{root,home,engine,backup};}
it('backs up Windows directory junctions without recreating links or following targets',async()=>{
 const {home,backup,engine}=await fixture();const spy=vi.spyOn(fs,'symlink').mockRejectedValue(Object.assign(Error('EPERM'),{code:'EPERM'}));
 expect(await backupHarnessHome(home,backup)).toEqual({links:1});expect(spy).not.toHaveBeenCalled();
 expect(await fs.readFile(path.join(backup,'user.json'),'utf8')).toBe('user config');expect(await fs.readdir(backup)).not.toContain('sdk');
 const manifest=JSON.parse(await fs.readFile(path.join(backup,'.studio-backup-links.json'),'utf8'));expect(manifest.links[0].target.toLowerCase()).toBe(engine.toLowerCase());
 expect(await fs.readFile(path.join(backup,'.studio-backup-complete'),'utf8')).toBe('1\n');
});
it('restores files and directory junctions to a new directory with unchanged behavior',async()=>{
 const {root,home,backup}=await fixture();await backupHarnessHome(home,backup);const restored=path.join(root,'restored');await restoreHarnessBackup(backup,restored);
 expect(await fs.readFile(path.join(restored,'sdk/sdk.js'),'utf8')).toBe('retained engine');expect(await fs.readFile(path.join(restored,'user.json'),'utf8')).toBe('user config');
 await expect(restoreHarnessBackup(backup,home)).rejects.toThrow();expect(await fs.readFile(path.join(home,'user.json'),'utf8')).toBe('user config');
});
it('records cyclic directory links without traversal and rejects incomplete or escaping recovery',async()=>{
 const {root,home,backup}=await fixture();await fs.symlink(home,path.join(home,'cycle'),process.platform==='win32'?'junction':'dir');await backupHarnessHome(home,backup);
 const p=path.join(backup,'.studio-backup-links.json');const m=JSON.parse(await fs.readFile(p,'utf8'));expect(m.links).toHaveLength(2);m.links[0].path='../escape';await fs.writeFile(p,JSON.stringify(m));
 await expect(restoreHarnessBackup(backup,path.join(root,'restored'))).rejects.toThrow('escapes');
 await fs.unlink(path.join(backup,'.studio-backup-complete'));await expect(restoreHarnessBackup(backup,path.join(root,'restored'))).rejects.toThrow();
});
it('does not mark a failed copy as a complete backup',async()=>{
 const {home,backup}=await fixture();vi.spyOn(fs,'copyFile').mockRejectedValue(Error('disk full'));await expect(backupHarnessHome(home,backup)).rejects.toThrow('disk full');await expect(fs.stat(path.join(backup,'.studio-backup-complete'))).rejects.toThrow();
});
