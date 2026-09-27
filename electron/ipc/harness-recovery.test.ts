import {it,expect,afterEach,vi} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {backupHarnessHome} from './harness-backup';import {recoverHarnessHome} from './harness-recovery';
const roots:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots.splice(0)){if(path.dirname(root)!==os.tmpdir()||!path.basename(root).startsWith('studio-recovery-test-'))throw Error('Invalid cleanup');await fs.rm(root,{recursive:true,force:true});}});
async function setup(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio-recovery-test-'));roots.push(root);const home=path.join(root,'user-home'),source=path.join(root,'backups','dated');await fs.mkdir(home);await fs.mkdir(path.dirname(source));await fs.writeFile(path.join(home,'config.json'),'old');await backupHarnessHome(home,source);await fs.writeFile(path.join(home,'config.json'),'current');return{root,home,source};}
it('restores a legacy backup, retaining current data and current component descriptor',async()=>{
 const {root,home,source}=await setup();await fs.writeFile(path.join(root,'active.json'),'current component');const result=await recoverHarnessHome(root,source);expect(result.componentRestored).toBe(false);expect(await fs.readFile(path.join(home,'config.json'),'utf8')).toBe('old');expect(await fs.readFile(path.join(result.preserved,'user-home/config.json'),'utf8')).toBe('current');expect(await fs.readFile(path.join(root,'active.json'),'utf8')).toBe('current component');
});
it('rejects incomplete backups and folders outside the backup root without touching current data',async()=>{
 const {root,home,source}=await setup();await expect(recoverHarnessHome(root,home)).rejects.toThrow('dated folder');await fs.unlink(path.join(source,'.studio-backup-complete'));await expect(recoverHarnessHome(root,source)).rejects.toThrow();expect(await fs.readFile(path.join(home,'config.json'),'utf8')).toBe('current');
});
it('rejects a backup referencing a missing component slot before moving current data',async()=>{
 const {root,home,source}=await setup();await fs.writeFile(path.join(source,'.studio-backup-active.json'),JSON.stringify({slot:'missing'}));await expect(recoverHarnessHome(root,source)).rejects.toThrow();expect(await fs.readFile(path.join(home,'config.json'),'utf8')).toBe('current');
});
it('restores original active home if activating the staged copy fails',async()=>{
 const {root,home,source}=await setup();const rename=fs.rename.bind(fs);vi.spyOn(fs,'rename').mockImplementation(async(from,to)=>{if(String(from).includes('restore-staging-'))throw Error('synthetic activation failure');return rename(from,to);});await expect(recoverHarnessHome(root,source)).rejects.toThrow('activation failure');expect(await fs.readFile(path.join(home,'config.json'),'utf8')).toBe('current');
});
