import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useAppStore} from './store';
import {DEFAULT_PARAMS} from './types';
const item=(id:string)=>({id,date:'2026-09-29',filePath:`${id}.png`,fileUrl:'',actualSeed:42,params:DEFAULT_PARAMS,model:DEFAULT_PARAMS.model,width:832,height:1216,createdAt:'2026-09-29T00:00:00Z'});
let desktop:any;
beforeEach(()=>{
 useAppStore.setState(useAppStore.getInitialState(),true);
 const failure={ok:false,message:'结果保存未全部完成，已落盘 2/3 张；没有自动重新生成。',failureKind:'storage',items:[item('saved-1'),item('saved-2')],actualSeed:42};
 desktop={hasToken:vi.fn().mockResolvedValue({hasToken:true,anlasBalance:100,tierName:'Opus'}),quoteAnlas:vi.fn().mockResolvedValue({ok:true,amount:0,balance:100}),
 generate:vi.fn().mockResolvedValue(failure),generateI2I:vi.fn().mockResolvedValue(failure),inpaint:vi.fn().mockResolvedValue(failure),augmentImage:vi.fn().mockResolvedValue(failure),
 getHistoryDates:vi.fn().mockResolvedValue([]),getHistoryGroups:vi.fn().mockResolvedValue([]),getHistory:vi.fn().mockResolvedValue([]),
 loadImageFromPath:vi.fn().mockResolvedValue({ok:true,image:{filePath:'source.png',fileUrl:'',width:832,height:1216}})};
 vi.stubGlobal('window',{naiDesktop:desktop});
 useAppStore.setState(s=>({account:{hasToken:true,anlasBalance:100,tierName:'Opus'},params:{...s.params,positivePrompt:'forest'},batchCount:3,batchIntervalSeconds:0,
 workbenchImage:{filePath:'source.png',fileUrl:'',width:832,height:1216},inpaintMask:'fixture-mask'}));
});
afterEach(()=>{vi.unstubAllGlobals();useAppStore.setState(useAppStore.getInitialState(),true);});
it.each(['generate','generateI2I'] as const)('baseline: %s displays saved partial images and stops further paid submissions',async(action)=>{
 await useAppStore.getState()[action]();
 const state=useAppStore.getState();expect(desktop[action]).toHaveBeenCalledOnce();expect(state.currentImage?.id).toBe('saved-1');
 expect(state.history.map(x=>x.id)).toEqual(['saved-1','saved-2']);expect(state.lastError).toContain('保存未全部完成');expect(state.isGenerating).toBe(false);
});
it.each([['inpaint','inpaint'],['runDirectorTool','augmentImage']] as const)('%s preserves partial results without treating the operation as successful',async(action,method)=>{
 await useAppStore.getState()[action]();const state=useAppStore.getState();
 expect(desktop[method]).toHaveBeenCalledOnce();expect(state.currentImage?.id).toBe('saved-1');
 expect(state.history.map(x=>x.id)).toEqual(['saved-1','saved-2']);expect(state.lastError).toContain('保存未全部完成');expect(state.isGenerating).toBe(false);
 expect(state.comparisonBeforeImage?.filePath).toBe('source.png');
});
it.each(['generate','generateI2I'] as const)('%s stops on the first storage failure even without saved outputs',async(action)=>{
 desktop[action].mockResolvedValue({ok:false,items:[],message:'磁盘写入失败',failureKind:'storage'});
 await useAppStore.getState()[action]();expect(desktop[action]).toHaveBeenCalledOnce();expect(useAppStore.getState().lastError).toContain('磁盘');
});
it('partial outputs respect the selected gallery group while remaining visible in the canvas',async()=>{
 useAppStore.setState({selectedGroupId:'other-group'});await useAppStore.getState().generate();
 expect(useAppStore.getState().currentImage?.id).toBe('saved-1');expect(useAppStore.getState().history).toEqual([]);
});
