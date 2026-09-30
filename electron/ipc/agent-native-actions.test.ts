import {it,expect,vi} from 'vitest';
import {createNativeSoftwareActions,nativeActionCatalog,type NativeActionAdapter} from './agent-native-actions';
import {createImageApprovals} from './harness-image-approval';
import type {DetectiveSnapshot} from '../../src/artist-detective-contract';
import type {DetectiveDownloadStatus} from './detective-download';

function fixture(approve=vi.fn(async(_r:any)=>true)){
 const state:DetectiveSnapshot={selectedVariant:'full',ready:true,running:false,stage:'idle',completed:0,budget:300,rounds:9,candidates:[],directory:'C:/fixture/run',reference:{filePath:'C:/fixture/target.png',fileUrl:'local://target',name:'target.png'},runtimeValidation:{state:'passed'},models:{full:{configured:true,assets:'C:/models/full',python:'C:/runtime/python.exe',validation:{state:'passed'}},light:{configured:false,validation:{state:'unchecked'}}}};
 const download={variant:'full',busy:false,total:1234,downloaded:0,directory:'C:/fixture/downloads',packages:[]} as unknown as DetectiveDownloadStatus;
 const win={visible:true,minimized:false,maximized:false};
 const invoke=vi.fn(async(action:string,args:any)=>{
  if(action==='detective.select')state.selectedVariant=args.variant;
  if(action==='detective.start')state.running=true;
  if(action==='detective.stop')state.running=false;
  if(action==='detective.clear')state.directory=undefined;
  if(action==='detective.download')download.busy=true;
  if(action==='detective.cancelDownload')download.busy=false;
 });
 const adapter:NativeActionAdapter={status:async()=>structuredClone(state),downloadStatus:async()=>structuredClone(download),windowStatus:()=>({...win}),windowAction:action=>{if(action==='minimize')win.minimized=true;if(action==='maximize')win.maximized=true;if(action==='restore'){win.minimized=false;win.maximized=false;}if(action==='show')win.visible=true;},image:async id=>{if(id!=='known')throw Error('unknown image');return 'C:/fixture/known.png';},invoke};
 const gateway=createNativeSoftwareActions(adapter,approve,'win32');let i=0;
 const request=(args:Record<string,unknown>)=>({tool:'langbai_software_action',sessionId:'native-test',callId:'call-'+(++i),args});
 const call=(args:Record<string,unknown>)=>gateway.execute(request(args));
 const read=async()=>{const r=await call({action:'detective.status'});expect(r.ok).toBe(true);return (r.data as any).revision;};
 return {state,download,win,adapter,gateway,approve,invoke,call,read,request};
}
it('only advertises real platform operations; status does not download, verify or generate',async()=>{
 const f=fixture();expect(Object.keys(f.gateway.catalog)).toHaveLength(16);
 for(const p of ['android','darwin','linux'] as const)expect(Object.keys(nativeActionCatalog(p as NodeJS.Platform)).some(x=>x.startsWith('detective.'))).toBe(false);
 await f.read();expect(f.invoke).not.toHaveBeenCalled();expect(f.approve).not.toHaveBeenCalled();
 expect((await f.call({action:'shell.exec'})).ok).toBe(false);
 expect((await f.call({action:'detective.select',variant:'light',expectedRevision:'stale'})).ok).toBe(false);
 const revision=await f.read();expect((await f.call({action:'detective.select',variant:'light',expectedRevision:revision})).ok).toBe(true);
 expect(f.invoke.mock.calls.map(x=>x[0])).toEqual(['detective.select']);
});
it('clear requires explicit image choice, Agent confirmation once, binds directory and preserves reference',async()=>{
 const f=fixture();let revision=await f.read();
 expect((await f.call({action:'detective.clear',expectedRevision:revision})).ok).toBe(false);expect(f.approve).not.toHaveBeenCalled();
 f.approve.mockResolvedValueOnce(false);
 expect((await f.call({action:'detective.clear',deleteImages:false,expectedRevision:revision})).ok).toBe(false);expect(f.invoke).not.toHaveBeenCalled();
 expect((await f.call({action:'detective.clear',deleteImages:false,expectedRevision:revision})).ok).toBe(true);
 expect(f.invoke).toHaveBeenLastCalledWith('detective.clear',{directory:'C:/fixture/run',deleteImages:false});expect(f.state.reference?.filePath).toBe('C:/fixture/target.png');
 f.state.directory='C:/fixture/new-run';revision=await f.read();
 expect((await f.call({action:'detective.clear',deleteImages:true,expectedRevision:revision})).ok).toBe(true);
 expect(f.invoke).toHaveBeenLastCalledWith('detective.clear',{directory:'C:/fixture/new-run',deleteImages:true});
});
it('single Agent approval starts a bounded validated run and status/stop stay responsive',async()=>{
 const approvals=createImageApprovals(2000),f=fixture(vi.fn(r=>approvals.wait(r)));
 const revision=await f.read(),args={action:'detective.start',prompt:'fixture scene',style:'',budget:24,attachmentId:'known',expectedRevision:revision};
 const pending=f.call(args);
 const query=()=>approvals.execute({tool:'studio_image_approval',args:{},sessionId:'native-test'});
 await vi.waitFor(()=>expect(query().data).not.toBeNull());
 expect(f.invoke).not.toHaveBeenCalled();await f.read();
 const id=query().data!.id;
 approvals.execute({tool:'studio_resolve_image_approval',sessionId:'native-test',args:{id,approved:true}});
 expect((await pending).ok).toBe(true);expect(f.invoke).toHaveBeenCalledTimes(1);expect(f.approve).toHaveBeenCalledTimes(1);
 expect(f.invoke.mock.calls[0][1]).toMatchObject({image:'C:/fixture/known.png',budget:24,parameters:{model:'nai-diffusion-4-5-full'}});
 expect((await f.call({action:'detective.stop'})).ok).toBe(true);expect(f.state.running).toBe(false);approvals.close();
});
it('rejects stale approval, arbitrary paths, caller consent flags and invalid paid inputs before execution',async()=>{
 const f=fixture();const revision=await f.read();
 for(const extra of [{budget:25},{image:'C:/arbitrary'},{confirmed:true},{parameters:{steps:999}},{attachmentId:'unknown'}]){
  const r=await f.call({action:'detective.start',prompt:'fixture',style:'',budget:24,expectedRevision:revision,...extra});expect(r.ok,r.output).toBe(false);
 }
 expect(f.approve).not.toHaveBeenCalled();expect(f.invoke).not.toHaveBeenCalled();
 f.approve.mockImplementationOnce(async()=>{f.state.directory='C:/changed';return true;});
 expect((await f.call({action:'detective.clear',deleteImages:true,expectedRevision:revision})).ok).toBe(false);expect(f.invoke).not.toHaveBeenCalled();
});
it('verified model cannot download again; unverified download is confirmed with real size and selected variant',async()=>{
 const f=fixture();let revision=await f.read();
 expect((await f.call({action:'detective.download',expectedRevision:revision})).ok).toBe(false);expect(f.approve).not.toHaveBeenCalled();
 f.state.runtimeValidation={state:'unchecked'};revision=await f.read();
 expect((await f.call({action:'detective.download',expectedRevision:revision})).ok).toBe(true);
 expect(f.approve.mock.calls[0][0].args).toMatchObject({downloadBytes:1234,selectedVariant:'full',directory:'C:/fixture/downloads'});
 expect((await f.call({action:'detective.cancelDownload'})).ok).toBe(true);expect(f.download.busy).toBe(false);
});
it('window controls read back actual state; unknown action never reaches adapter',async()=>{
 const f=fixture();for(const action of ['minimize','restore','maximize','restore','show']){
  const read=await f.call({action:'window.status'});
  expect((await f.call({action:'window.'+action,expectedRevision:(read.data as any).revision})).ok).toBe(true);
 }
 expect(f.approve).not.toHaveBeenCalled();expect(f.invoke).not.toHaveBeenCalled();
});
it('failed verification and no-op adapters do not report a successful mutation',async()=>{
 const f=fixture();f.state.runtimeValidation={state:'failed',message:'wrong environment'};
 const revision=await f.read();expect((await f.call({action:'detective.verify',expectedRevision:revision})).output).toContain('wrong environment');
 f.invoke.mockImplementationOnce(async()=>{});
 expect((await f.call({action:'detective.select',variant:'light',expectedRevision:revision})).ok).toBe(false);
});
it('stop cancels outstanding Agent confirmation and queued starts without spawning a job',async()=>{
 const approvals=createImageApprovals(2000),f=fixture(vi.fn(r=>approvals.wait(r)));
 const revision=await f.read(),args={action:'detective.start',prompt:'fixture',style:'',budget:24,expectedRevision:revision};
 const first=f.call(args),second=f.call(args);
 const query=()=>approvals.execute({tool:'studio_image_approval',args:{},sessionId:'native-test'});
 await vi.waitFor(()=>expect(query().data).not.toBeNull());
 expect((await f.call({action:'detective.stop'})).ok).toBe(true);
 expect((await first).ok).toBe(false);expect((await second).ok).toBe(false);expect(query().data).toBeNull();
 expect(f.invoke.mock.calls.map(x=>x[0])).toEqual(['detective.stop']);approvals.close();
});
