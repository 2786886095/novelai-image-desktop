import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createBackupTools,type BackupAdapter} from './agent-backup-tools';
import {validateBackupRequest} from '../../src/agent/backup-contract';
let root:string;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'agent-backup-flow-'));await fs.writeFile(path.join(root,'one.naisbackup'),'original');});
afterEach(async()=>fs.rm(root,{recursive:true,force:true}));
function fixture(){
 let revision='1';const approve=vi.fn(async()=>true);
 const restore=vi.fn(async()=>({ok:true,message:'restored',imported:1,skipped:0,renamed:0,rescueBackupPath:path.join(root,'before-import.naisbackup'),workspaceData:{'langbai.private':'synthetic-never-to-model'}}));
 const adapter:BackupAdapter={directory:async()=>root,capture:async()=>({revision,workspaceData:{}}),inspect:async file=>({ok:true,path:file,categories:[{category:'workspaceData',items:1,bytes:8}]}),create:async()=>({ok:true,message:'created',path:path.join(root,'one.naisbackup')}),restore,refresh:vi.fn(async()=>{})};
 const service=createBackupTools(adapter,approve);
 const call=(args:Record<string,unknown>,sessionId='session-a')=>service.execute({tool:'langbai_backup',args,sessionId});
 const prepare=async()=>{const list=await call({action:'list'});return call({action:'inspect',backupId:(list.data as any).items[0].id});};
 return {call,prepare,approve,restore,adapter,change:()=>revision='2'};
}
it('backup workflow returns paths, locks inspected categories and confirms once without leaking workspace',async()=>{
 const f=fixture();const created=await f.call({action:'create'});expect(created.ok).toBe(true);expect(f.approve).not.toHaveBeenCalled();
 const check=await f.prepare();const result=await f.call({action:'restore',inspectionId:(check.data as any).inspectionId});
 expect(result.ok,result.output).toBe(true);expect(f.approve).toHaveBeenCalledTimes(1);expect(f.restore).toHaveBeenCalledTimes(1);expect(result.output).not.toContain('synthetic-never-to-model');expect((result.data as any).rescueBackupPath).toContain('before-import');
 const again=await f.call({action:'restore',inspectionId:(check.data as any).inspectionId});expect(again.ok).toBe(false);expect(f.restore).toHaveBeenCalledTimes(1);
});
it('cancellation and wrong session never restore',async()=>{
 const f=fixture(),check=await f.prepare(),args={action:'restore',inspectionId:(check.data as any).inspectionId};
 expect((await f.call(args,'another-session')).ok).toBe(false);expect(f.approve).not.toHaveBeenCalled();
 f.approve.mockResolvedValue(false);expect((await f.call(args)).ok).toBe(false);expect(f.restore).not.toHaveBeenCalled();
});
it('rejects changed local state and archive, including change during confirmation',async()=>{
 const f=fixture(),check=await f.prepare();f.approve.mockImplementation(async()=>{f.change();return true;});
 expect((await f.call({action:'restore',inspectionId:(check.data as any).inspectionId})).ok).toBe(false);expect(f.restore).not.toHaveBeenCalled();
 const g=fixture(),next=await g.prepare();await fs.writeFile(path.join(root,'one.naisbackup'),'changed');
 expect((await g.call({action:'restore',inspectionId:(next.data as any).inspectionId})).ok).toBe(false);expect(g.restore).not.toHaveBeenCalled();
});
it('credential exports require Agent confirmation and never accept paths or forged authorization',async()=>{
 const f=fixture();f.approve.mockResolvedValue(false);expect((await f.call({action:'create',categories:['apiCredentials']})).ok).toBe(false);expect(f.approve).toHaveBeenCalledTimes(1);
 for(const args of [{action:'restore',inspectionId:'x',confirmed:true},{action:'inspect',path:'C:/secret'},{action:'list',limit:0},{action:'create',categories:['configuration','configuration']}])expect(()=>validateBackupRequest(args)).toThrow();
});
it('refresh failure is reported as durable success, not a retryable restore failure',async()=>{
 const f=fixture();f.adapter.refresh=async()=>{throw Error('renderer gone');};const check=await f.prepare();const result=await f.call({action:'restore',inspectionId:(check.data as any).inspectionId});
 expect(result.ok).toBe(true);expect((result.data as any).refreshed).toBe(false);expect((result.data as any).notice).toContain('不要重复');
});
