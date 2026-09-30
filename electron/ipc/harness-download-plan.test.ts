import {it,expect,vi} from 'vitest';
import {planHarnessDownload} from './harness-download-plan';
import {HarnessDownloadConsent} from './harness-download-consent';
import {officialUpdateStatus} from '../../src/harness-update-status';
import type {HarnessSnapshot} from '../../src/harness-types';
const installed:HarnessSnapshot={phase:'stopped',version:'0.1.7',installedUpstream:'0.1.7-rc.2',logs:[],dataDirectory:'fixture'};
function fixture(component='0.1.7',official='0.2.0-rc.2'){
 const consent=new HarnessDownloadConsent();
 const query=vi.fn(async()=>({version:component,bytes:100,tag:'agent-v'+component,asset:{name:'fixture.zip',url:'https://example.test/fixture',size:100,digest:'sha256:'+'a'.repeat(64)}}));
 const checkOfficial=vi.fn(async()=>({component,official,plugins:{},errors:[],checkedAt:'fixture'}));
 const queryOfficial=vi.fn(async(version:string)=>({token:'a'.repeat(48),version,bytes:0,official:true}));
 return {queryOfficial,kind:'official' as const,reinstall:false,installed,consent,query,checkOfficial};
}
it('same adapter allows an independent official download plan',async()=>{
 const f=fixture();const result=await planHarnessDownload(f);
 expect(result).toMatchObject({official:true,version:'0.2.0-rc.2'});expect(result.token).toHaveLength(48);
 expect(f.checkOfficial).toHaveBeenCalledOnce();expect(f.query).not.toHaveBeenCalled();expect(f.queryOfficial).toHaveBeenCalledWith('0.2.0-rc.2');
});
it('official plan remains independent even when a newer adapter exists',async()=>{
 const f=fixture('0.1.8');expect(await planHarnessDownload(f)).toMatchObject({official:true,version:'0.2.0-rc.2'});expect(f.query).not.toHaveBeenCalled();
});
it('up-to-date official version does not query or re-download the component',async()=>{
 const f=fixture('0.1.9','0.1.7-rc.2');const result=await planHarnessDownload(f);
 expect(result).toMatchObject({current:true,bytes:0});expect(f.query).not.toHaveBeenCalled();
});
it('metadata failure is not converted into a current/upgrade result',async()=>{
 const f=fixture();f.checkOfficial.mockResolvedValue({...await f.checkOfficial(),official:null,officialFailed:true} as any);
 await expect(planHarnessDownload(f)).rejects.toThrow('检查失败');expect(f.query).not.toHaveBeenCalled();
});
it('missing installation requests installation first',async()=>{
 const f=fixture();const result=await planHarnessDownload({...f,installed:{...installed,version:null,installedUpstream:null}});
 expect(result).toMatchObject({blocked:true});expect(f.query).not.toHaveBeenCalled();
});
it('component route retains same-version skip and explicit reinstall only',async()=>{
 const f=fixture();expect(await planHarnessDownload({...f,kind:'component'})).toMatchObject({current:true});
 expect(f.checkOfficial).not.toHaveBeenCalled();const reinstall=await planHarnessDownload({...f,kind:'component',reinstall:true});expect(reinstall.token).toHaveLength(48);
});
it('explicit reinstall does not downgrade a newer installed component',async()=>{
 const f=fixture('0.1.6');expect(await planHarnessDownload({...f,kind:'component',reinstall:true})).toMatchObject({blocked:true,token:''});
});
it('renderer offers official upgrade independently of matching component versions',async()=>{
 const f=fixture();const state={...installed,updateInfo:await f.checkOfficial()};
 expect(officialUpdateStatus(state)).toBe('available');
 expect(officialUpdateStatus({...state,installedUpstream:'0.2.0-rc.2'})).toBe('current');
 expect(officialUpdateStatus({...state,installedUpstream:'0.2.0'})).toBe('current');
 expect(officialUpdateStatus({...state,checkingUpdates:true})).toBe('checking');
 expect(officialUpdateStatus({...state,updateInfo:{...state.updateInfo,officialFailed:true}})).toBe('failed');
});
