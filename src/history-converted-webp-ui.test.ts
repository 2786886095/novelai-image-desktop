import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import type {HistoryItem} from './types';
const old:HistoryItem={id:'converted-fixture',filePath:'/managed/2026-10-31/cup.png',fileUrl:'nai-local://image/cup.png',date:'2026-10-31',createdAt:'2026-10-31T09:30:00Z',width:32,height:24,model:'nai-diffusion-4-5-full',actualSeed:7,params:{positivePrompt:'fixture'}as HistoryItem['params'],groupId:'kept-group',generatedImageSha256:'original-png-sha'};
const converted={...old,filePath:'/managed/2026-10-31/cup.webp',fileUrl:'nai-local://image/cup.webp'};
function bridge(recover:()=>Promise<unknown>){const api={recoverMissingHistoryItem:vi.fn(recover),pruneMissingHistoryItem:vi.fn(async()=>false),getHistory:vi.fn(async()=>[converted]),getHistoryDates:vi.fn(async()=>[old.date]),getHistoryGroups:vi.fn(async()=>[])};vi.stubGlobal('window',{naiDesktop:api});return api;}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};}
beforeEach(()=>{useAppStore.setState(useAppStore.getInitialState(),true);useAppStore.setState({history:[old],currentImage:old,selectedDate:old.date,selectedGroupId:old.groupId,params:{...useAppStore.getState().params,positivePrompt:'unsaved edit'},inputPreviewAnchor:{result:old},comparisonBeforeImage:{filePath:old.filePath,fileUrl:old.fileUrl,width:32,height:24},comparisonSurface:'inpaint'});});
afterEach(()=>vi.unstubAllGlobals());
describe('converted WebP visible-state recovery',()=>{
 it('rebinds the same record/current/anchor to the recovered WebP and preserves edits and provenance',async()=>{
  const api=bridge(async()=>({status:'relinked',item:converted}));await useAppStore.getState().dropMissingImage(old.id);const s=useAppStore.getState();
  expect(s.history).toEqual([converted]);expect(s.currentImage).toEqual(converted);expect(s.inputPreviewAnchor?.result).toEqual(converted);expect(s.params.positivePrompt).toBe('unsaved edit');expect(s.selectedDate).toBe(old.date);expect(s.selectedGroupId).toBe(old.groupId);expect(s.history[0].generatedImageSha256).toBe('original-png-sha');expect(s.comparisonBeforeImage?.filePath).toBe(converted.filePath);expect(s.comparisonSurface).toBe('inpaint');expect(api.pruneMissingHistoryItem).not.toHaveBeenCalled();
 });
 it('also refreshes a stale URL when another reader already relinked the backend row',async()=>{
  bridge(async()=>({status:'present',item:converted}));await useAppStore.getState().dropMissingImage(old.id);expect(useAppStore.getState().currentImage?.filePath).toBe(converted.filePath);
 });
 it('does not repeatedly refresh or drop a present but undecodable same-path image',async()=>{
  const api=bridge(async()=>({status:'present',item:old}));expect(await useAppStore.getState().dropMissingImage(old.id)).toBe(false);expect(useAppStore.getState().history).toEqual([old]);expect(api.getHistory).not.toHaveBeenCalled();
 });
 it('preserves state when the storage or candidate is unavailable',async()=>{
  bridge(async()=>({status:'unavailable'}));await useAppStore.getState().dropMissingImage(old.id);expect(useAppStore.getState().currentImage).toEqual(old);
 });
 it('deduplicates concurrent image errors for the same record',async()=>{
  const d=deferred<unknown>(),api=bridge(()=>d.promise);const a=useAppStore.getState().dropMissingImage(old.id),b=useAppStore.getState().dropMissingImage(old.id);d.resolve({status:'relinked',item:converted});await Promise.all([a,b]);expect(api.recoverMissingHistoryItem).toHaveBeenCalledTimes(1);
 });
 it('does not overwrite another current selection when recovery resolves late',async()=>{
  const d=deferred<unknown>();bridge(()=>d.promise);const waiting=useAppStore.getState().dropMissingImage(old.id);const other={...old,id:'other',filePath:'/managed/other.png'};useAppStore.setState({currentImage:other});d.resolve({status:'relinked',item:converted});await waiting;expect(useAppStore.getState().currentImage).toEqual(other);expect(useAppStore.getState().history[0]).toEqual(converted);
 });
 it('does not overwrite a newer same-ID path',async()=>{
  const d=deferred<unknown>();bridge(()=>d.promise);const waiting=useAppStore.getState().dropMissingImage(old.id);const newest={...converted,filePath:'/managed/user-renamed.webp',fileUrl:'nai-local://image/user-renamed.webp'};useAppStore.setState({history:[newest],currentImage:newest});d.resolve({status:'relinked',item:converted});await waiting;expect(useAppStore.getState().history).toEqual([newest]);expect(useAppStore.getState().currentImage).toEqual(newest);
 });
 it('lets the complete works page supply its stale path when the global history is filtered elsewhere',async()=>{
  bridge(async()=>({status:'present',item:converted}));useAppStore.setState({history:[],currentImage:null});
  expect(await useAppStore.getState().dropMissingImage(old.id,old.filePath)).toBe(true);
  expect(useAppStore.getState().history).toEqual([]);expect(useAppStore.getState().currentImage).toBeNull();
 });
 it('repairs a stale current image even when history was already reindexed',async()=>{
  bridge(async()=>({status:'present',item:converted}));useAppStore.setState({history:[converted],currentImage:old});
  await useAppStore.getState().dropMissingImage(old.id);expect(useAppStore.getState().currentImage?.filePath).toBe(converted.filePath);
 });
 it('rebinds working/original input paths without losing masks or edited parameters',async()=>{
  bridge(async()=>({status:'relinked',item:converted}));const working={filePath:old.filePath,fileUrl:old.fileUrl,width:32,height:24};
  const region={x:1,y:2,width:16,height:16};useAppStore.setState({workbenchImage:working,i2iOriginalImage:working,inpaintRegion:region});
  await useAppStore.getState().dropMissingImage(old.id);const s=useAppStore.getState();expect(s.workbenchImage?.filePath).toBe(converted.filePath);expect(s.i2iOriginalImage?.filePath).toBe(converted.filePath);expect(s.inpaintRegion).toEqual(region);expect(s.params.positivePrompt).toBe('unsaved edit');
 });
 it('a normal refresh rebinds the visible current/input references to the new canonical path',async()=>{
  bridge(async()=>({status:'present',item:converted}));const working={filePath:old.filePath,fileUrl:old.fileUrl,width:32,height:24};useAppStore.setState({workbenchImage:working,i2iOriginalImage:working});
  await useAppStore.getState().refreshHistory();const s=useAppStore.getState();expect(s.currentImage).toEqual(converted);expect(s.inputPreviewAnchor?.result).toBe(s.currentImage);expect(s.workbenchImage?.filePath).toBe(converted.filePath);expect(s.i2iOriginalImage?.filePath).toBe(converted.filePath);
 });
 for(const route of ['lazy','refresh'] as const)it(`${route} rejects a pending first load of a now-relinked PNG`,async()=>{
  const d=deferred<any>(),api=bridge(async()=>({status:'relinked',item:converted}));
  Object.assign(api,{loadImageFromPath:vi.fn(()=>d.promise)});const unrelated={filePath:'/other.png',fileUrl:'nai-local://image/other.png',width:32,height:24};useAppStore.setState({workbenchImage:unrelated,i2iOriginalImage:unrelated});
  const waiting=useAppStore.getState().loadWorkbenchFromPath(old.filePath,{restoreMetadata:false});
  if(route==='lazy')await useAppStore.getState().dropMissingImage(old.id);else await useAppStore.getState().refreshHistory();
  d.resolve({ok:true,image:{filePath:old.filePath,fileUrl:old.fileUrl,width:32,height:24}});await waiting;
  expect(useAppStore.getState().workbenchImage).toEqual(unrelated);expect(useAppStore.getState().currentImage).toEqual(converted);expect(useAppStore.getState().params.positivePrompt).toBe('unsaved edit');
 });
 it('does not cancel a newer unrelated user load while recovering an old history entry',async()=>{
  const d=deferred<any>(),api=bridge(async()=>({status:'relinked',item:converted}));
  Object.assign(api,{loadImageFromPath:vi.fn(()=>d.promise)});const unrelated={filePath:'/other.png',fileUrl:'nai-local://image/other.png',width:32,height:24};
  const waiting=useAppStore.getState().loadWorkbenchFromPath(unrelated.filePath,{restoreMetadata:false});await useAppStore.getState().dropMissingImage(old.id);
  d.resolve({ok:true,image:unrelated});await waiting;expect(useAppStore.getState().workbenchImage).toEqual(unrelated);
 });
});
