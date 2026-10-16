import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useAppStore} from './store';
import {DEFAULT_PARAMS} from './types';
const validation=vi.hoisted(()=>({source:vi.fn(),mask:vi.fn()}));
vi.mock('./inpaint-edit-session',()=>({validateInpaintEditSource:validation.source,decodeInpaintEditMask:validation.mask,inpaintEditText:()=>({failed:'恢复编辑失败',restoring:'正在恢复编辑…'})}));
const source={filePath:'fixture-original.png',fileUrl:'fixture:original',width:512,height:512};
const output={id:'fixture-output',filePath:'fixture-output.png',fileUrl:'fixture:output',width:512,height:512,date:'2026-10-16',params:DEFAULT_PARAMS,actualSeed:1};
const roi={x:128,y:128,width:256,height:256};const mask='synthetic-original-mask';let desktop:any;
const state=()=>useAppStore.getState() as any;
function saved(overrides:any={}){return {id:'saved-session',source:{...source},originalImage:{...source},sourceMode:'original',engine:'novelai',maskBase64:mask,region:{...roi},sizeMode:'custom',customSize:{width:704,height:1408},resultId:output.id,...overrides};}
function editor(){const s=state();return {workbenchImage:s.workbenchImage,i2iOriginalImage:s.i2iOriginalImage,inpaintSourceMode:s.inpaintSourceMode,inpaintMask:s.inpaintMask,inpaintRegion:s.inpaintRegion,inpaintSizeMode:s.inpaintSizeMode,inpaintCustomSize:s.inpaintCustomSize};}
function installResultEditor(){useAppStore.setState({workbenchImage:{filePath:output.filePath,fileUrl:output.fileUrl,width:512,height:512},inpaintMask:'current-editor-mask',inpaintRegion:{x:0,y:0,width:64,height:64},currentImage:output as any,history:[output as any],inpaintSourceMode:'latest'});}
beforeEach(()=>{
 useAppStore.setState(useAppStore.getInitialState(),true);validation.source.mockReset();validation.source.mockResolvedValue(undefined);validation.mask.mockReset();validation.mask.mockImplementation(async(value:string|null,w:number,h:number)=>value===null?null:new Uint8ClampedArray(w*h*4));
 desktop={hasToken:vi.fn().mockResolvedValue({hasToken:true,anlasBalance:100,tierName:'Opus'}),quoteAnlas:vi.fn().mockResolvedValue({ok:true,amount:1,source:'estimate',balance:100,details:[]}),inpaint:vi.fn().mockResolvedValue({ok:true,items:[output],message:'synthetic success'}),openaiInpaint:vi.fn().mockResolvedValue({ok:true,items:[output],message:'synthetic success'}),loadImageFromPath:vi.fn().mockImplementation(async(p:string)=>({ok:true,image:p===output.filePath?{filePath:output.filePath,fileUrl:output.fileUrl,width:512,height:512}:{...source}})),getHistoryDates:vi.fn().mockResolvedValue([output.date]),getHistoryGroups:vi.fn().mockResolvedValue([]),getHistory:vi.fn().mockResolvedValue([output]),cancel:vi.fn().mockResolvedValue(undefined)};
 vi.stubGlobal('window',{naiDesktop:desktop});
 useAppStore.setState({account:{hasToken:true,anlasBalance:100,tierName:'Opus'},settings:{language:'zh-CN',inpaintEngine:'novelai'} as any,activeTab:'inpaint',activeCanvasSurface:'inpaint',params:{...DEFAULT_PARAMS},workbenchImage:{...source},i2iOriginalImage:{...source},inpaintMask:mask,inpaintRegion:{...roi},maskRevision:7,inpaintModel:'nai-diffusion-4-5-full-inpainting',inpaintPositivePrompt:'fixture repair',openaiEditPrompt:'fixture edit',inpaintSizeMode:'custom',inpaintCustomSize:{width:704,height:1408},vibeImages:[],preciseReferences:[],charCaptions:[]});
});
afterEach(()=>{vi.unstubAllGlobals();useAppStore.setState(useAppStore.getInitialState(),true);});
it.each(['novelai','openai'].flatMap(engine=>['original','latest'].map(mode=>({engine,mode}))))('$engine $mode successful submission records its source/mask/ROI/size and keeps generated history',async({engine,mode})=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:engine} as any,inpaintSourceMode:mode as any});await state()[engine==='openai'?'openaiInpaint':'inpaint']();
 expect(state().inpaintEditSession).toMatchObject({source,originalImage:source,sourceMode:mode,engine,maskBase64:mask,region:roi,sizeMode:'custom',customSize:{width:704,height:1408},resultId:output.id});
 expect(state().history.some((x:any)=>x.id===output.id)).toBe(true);
 if(mode==='latest'){expect(state().inpaintMask).toBeNull();expect(state().inpaintRegion).toBeNull();}
});
it.each(['novelai','openai'])('$engine failed generation does not replace the last successful edit',async engine=>{
 const previous=saved();useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:engine} as any,inpaintEditSession:previous} as any);desktop[engine==='openai'?'openaiInpaint':'inpaint'].mockResolvedValue({ok:false,items:[],message:'fixture failure'});
 await state()[engine==='openai'?'openaiInpaint':'inpaint']();expect(state().inpaintEditSession).toBe(previous);
});
it('restores source/mask/ROI/size atomically only after validation, then waits for canvas acknowledgement',async()=>{
 const session=saved();installResultEditor();useAppStore.setState({inpaintEditSession:session} as any);const result=state().currentImage;
 expect(await state().restoreInpaintEditSession()).toBe(true);
 expect(editor()).toMatchObject({workbenchImage:source,i2iOriginalImage:source,inpaintSourceMode:'original',inpaintMask:mask,inpaintRegion:roi,inpaintSizeMode:'custom',inpaintCustomSize:{width:704,height:1408}});
 expect(validation.source).toHaveBeenCalledOnce();expect(validation.mask).toHaveBeenCalledWith(mask,512,512);
 const payload=state().inpaintEditRestore;expect(payload).toMatchObject({sessionId:session.id,sourceFilePath:source.filePath,width:512,height:512,maskBase64:mask});expect(payload.maskRgba).toBeInstanceOf(Uint8ClampedArray);expect(state().isRestoringInpaintEditSession).toBe(true);
 expect(state().currentImage).toBe(result);expect(state().history[0].id).toBe(output.id);
 state().acknowledgeInpaintEditRestore(payload.revision+1,true);expect(state().isRestoringInpaintEditSession).toBe(true);
 state().acknowledgeInpaintEditRestore(payload.revision,true);expect(state().isRestoringInpaintEditSession).toBe(false);expect(state().inpaintEditRestore).toBeNull();expect(state().inpaintEditSession).toBe(session);
});
it('restores a rectangle-only snapshot with a null mask without inventing painted pixels',async()=>{
 installResultEditor();useAppStore.setState({inpaintEditSession:saved({maskBase64:null})} as any);expect(await state().restoreInpaintEditSession()).toBe(true);expect(state().inpaintMask).toBeNull();expect(state().inpaintRegion).toEqual(roi);expect(state().inpaintEditRestore.maskRgba).toBeNull();state().acknowledgeInpaintEditRestore(state().inpaintEditRestore.revision,true);
});
it.each(['load','source-decode','mask-decode','changed-dimensions'])('restore %s failure keeps the current editor, history and last session intact',async failure=>{
 installResultEditor();const session=saved();useAppStore.setState({inpaintEditSession:session} as any);const previous=editor();
 if(failure==='load')desktop.loadImageFromPath.mockResolvedValueOnce({ok:false,message:'source missing'});
 if(failure==='source-decode')validation.source.mockRejectedValueOnce(Error('cannot decode original'));
 if(failure==='mask-decode')validation.mask.mockRejectedValueOnce(Error('mask corrupt'));
 if(failure==='changed-dimensions')desktop.loadImageFromPath.mockResolvedValueOnce({ok:true,image:{...source,width:1024}});
 expect(await state().restoreInpaintEditSession()).toBe(false);expect(editor()).toEqual(previous);expect(state().inpaintEditSession).toBe(session);expect(state().isRestoringInpaintEditSession).toBe(false);expect(state().inpaintEditRestore).toBeNull();expect(state().history[0].id).toBe(output.id);
});
it('blocks restoring during generation and blocks either paid path during restoration',async()=>{
 useAppStore.setState({inpaintEditSession:saved(),isGenerating:true} as any);expect(await state().restoreInpaintEditSession()).toBe(false);expect(desktop.loadImageFromPath).not.toHaveBeenCalled();
 useAppStore.setState({isGenerating:false,isRestoringInpaintEditSession:true} as any);await state().inpaint();await state().openaiInpaint();expect(desktop.inpaint).not.toHaveBeenCalled();expect(desktop.openaiInpaint).not.toHaveBeenCalled();expect(desktop.loadImageFromPath).not.toHaveBeenCalled();
});
it('does not overwrite a newer editor load while restore validation is pending',async()=>{
 let release!:()=>void;validation.mask.mockImplementationOnce(()=>new Promise<Uint8ClampedArray>(r=>{release=()=>r(new Uint8ClampedArray(512*512*4));}));installResultEditor();useAppStore.setState({inpaintEditSession:saved()} as any);
 const restoring=state().restoreInpaintEditSession();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 await state().loadWorkbenchFromPath('new-user-input.png');const newer=editor();release();expect(await restoring).toBe(false);expect(editor()).toEqual(newer);expect(state().isRestoringInpaintEditSession).toBe(false);
});
it('rolls a failed canvas hydration back through one explicit decoded rollback payload',async()=>{
 installResultEditor();const previous=editor(),session=saved();useAppStore.setState({inpaintEditSession:session} as any);expect(await state().restoreInpaintEditSession()).toBe(true);const revision=state().inpaintEditRestore.revision;
 state().acknowledgeInpaintEditRestore(revision,false,'fixture canvas failure');await vi.waitFor(()=>expect(state().inpaintEditRestore?.rollback).toBe(true));expect(editor()).toEqual(previous);const rollback=state().inpaintEditRestore;expect(rollback.revision).toBeGreaterThan(revision);expect(rollback.maskBase64).toBe(previous.inpaintMask);expect(rollback.maskRgba).toBeInstanceOf(Uint8ClampedArray);
 state().acknowledgeInpaintEditRestore(rollback.revision,true);expect(state().isRestoringInpaintEditSession).toBe(false);expect(state().inpaintEditRestore).toBeNull();expect(state().inpaintEditSession).toBe(session);
});
it('does not loop if rollback canvas hydration also fails',async()=>{
 installResultEditor();useAppStore.setState({inpaintEditSession:saved()} as any);await state().restoreInpaintEditSession();state().acknowledgeInpaintEditRestore(state().inpaintEditRestore.revision,false,'first');await vi.waitFor(()=>expect(state().inpaintEditRestore?.rollback).toBe(true));const revision=state().inpaintEditRestore.revision;state().acknowledgeInpaintEditRestore(revision,false,'rollback');expect(state().isRestoringInpaintEditSession).toBe(false);expect(state().inpaintEditRestore).toBeNull();
});
it('does not change the configured engine when the saved snapshot belongs to another engine',async()=>{
 installResultEditor();useAppStore.setState({inpaintEditSession:saved({engine:'openai'})} as any);const previous=editor();expect(await state().restoreInpaintEditSession()).toBe(false);expect(state().settings.inpaintEngine).toBe('novelai');expect(editor()).toEqual(previous);
});
it.each(['novelai','openai'])('$engine cancelled late success cannot replace the newer successful session',async engine=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:engine} as any});const method=engine==='openai'?'openaiInpaint':'inpaint';let resolve!:(v:any)=>void;desktop[method].mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
 const old=state()[method]();await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));await state().cancel();await state()[method]();const latest=state().inpaintEditSession;expect(latest?.resultId).toBe(output.id);
 resolve({ok:true,items:[{...output,id:'late-cancelled-output'}],message:'late'});await old;expect(state().inpaintEditSession).toBe(latest);
});

it.each(['novelai','openai'])('$engine initial source load cannot cross a completed restore and reach a paid submit',async engine=>{
 useAppStore.setState({settings:{language:'zh-CN',inpaintEngine:engine} as any,inpaintEditSession:saved({engine})} as any);
 let resolve!:(v:any)=>void;desktop.loadImageFromPath.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));const pending=state()[engine==='openai'?'openaiInpaint':'inpaint']();await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
 expect(await state().restoreInpaintEditSession()).toBe(true);state().acknowledgeInpaintEditRestore(state().inpaintEditRestore.revision,true);
 resolve({ok:true,image:{...source}});await pending;expect(desktop.quoteAnlas).not.toHaveBeenCalled();expect(desktop.inpaint).not.toHaveBeenCalled();expect(desktop.openaiInpaint).not.toHaveBeenCalled();
});
it('submission snapshots do not alias mutable editor source, ROI or custom-size objects',async()=>{
 await state().inpaint();const snapshot=state().inpaintEditSession;expect(snapshot).toBeTruthy();
 state().workbenchImage.width=1024;state().inpaintRegion.width=64;state().inpaintCustomSize.width=128;
 expect(snapshot.source.width).toBe(512);expect(snapshot.originalImage.width).toBe(512);expect(snapshot.region.width).toBe(256);expect(snapshot.customSize.width).toBe(704);
});
it('rectangle-only restore also rejects an original file whose dimensions changed',async()=>{
 installResultEditor();useAppStore.setState({inpaintEditSession:saved({maskBase64:null})} as any);const previous=editor();desktop.loadImageFromPath.mockResolvedValueOnce({ok:true,image:{...source,height:1024}});
 expect(await state().restoreInpaintEditSession()).toBe(false);expect(editor()).toEqual(previous);expect(state().inpaintEditRestore).toBeNull();
});
