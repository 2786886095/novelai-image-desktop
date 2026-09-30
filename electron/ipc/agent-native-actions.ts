import {createHash} from 'node:crypto';
import type {BrowserWindow} from 'electron';
import type {AgentToolBridgeRequest,AgentToolBridgeResponse} from '../../src/agent/types';
import {detectiveBudget,detectiveParameters,type DetectiveRunRequest,type DetectiveSnapshot} from '../../src/artist-detective-contract';
import type {DetectiveDownloadStatus} from './detective-download';
import {projectStudioData} from '../../src/studio-agent-contract';

type Spec={title:string;effect:'read'|'write'|'confirm';fields?:readonly string[];help?:string};
const windowActions:Record<string,Spec>={
 'window.status':{title:'读取软件窗口',effect:'read'},
 'window.show':{title:'显示软件窗口',effect:'write'},
 'window.minimize':{title:'最小化软件窗口',effect:'write'},
 'window.maximize':{title:'最大化软件窗口',effect:'write'},
 'window.restore':{title:'还原软件窗口',effect:'write'},
};
const detectiveActions:Record<string,Spec>={
 'detective.status':{title:'读取画风迭代、双模型与下载状态',effect:'read'},
 'detective.select':{title:'切换画风模型',effect:'write',fields:['variant'],help:'variant: full|light；切换不下载，首次配置可校验。'},
 'detective.verify':{title:'手动重新校验当前模型和环境',effect:'write'},
 'detective.configure':{title:'选择已有模型或环境',effect:'write',fields:['kind'],help:'kind: python|assets；打开文件选择器，由用户选取本机目录。'},
 'detective.downloadDirectory':{title:'选择模型下载目录',effect:'write'},
 'detective.download':{title:'下载并安装当前画风模型和环境',effect:'confirm',help:'先读取下载大小、版本与目录；仅此操作下载，已验证模型不重复下载。'},
 'detective.cancelDownload':{title:'停止画风模型下载',effect:'write'},
 'detective.start':{title:'开始画风自动迭代（可能收费）',effect:'confirm',fields:['prompt','style','budget','attachmentId','parameters'],help:'prompt、style 为字符串；budget 为至少24的偶数；attachmentId 可选，来自历史，省略使用当前目标图；parameters 可选，沿用软件校验规则。'},
 'detective.stop':{title:'停止画风迭代并保留已完成图片',effect:'write'},
 'detective.clear':{title:'清空画风迭代结果',effect:'confirm',fields:['deleteImages'],help:'deleteImages 必须明确选择 true 或 false；true 将生成图片移入回收站，false 只清空结果展示，参考图保留。'},
 'detective.openResults':{title:'打开画风迭代结果目录',effect:'write'},
};
export const nativeActionCatalog=(platform=process.platform):Record<string,Spec>=>({...windowActions,...(platform==='win32'?detectiveActions:{})});
type WindowState={visible:boolean;minimized:boolean;maximized:boolean};
export interface NativeActionAdapter{
 windowStatus():WindowState;
 windowAction(action:string):void;
 status():Promise<DetectiveSnapshot>;
 downloadStatus():Promise<DetectiveDownloadStatus>;
 invoke(action:string,args:Record<string,unknown>):Promise<unknown>;
 image(attachmentId:string):Promise<string>;
}
// Fixed public actions only. This is never an arbitrary IPC/shell invocation API.
export function createNativeSoftwareActions(adapter:NativeActionAdapter,approve:(r:AgentToolBridgeRequest)=>Promise<boolean>,platform=process.platform){
 const catalog=nativeActionCatalog(platform);let tail:Promise<unknown>=Promise.resolve();
 const epochs={start:0,download:0};
 const pendingApprovals=new Map<AbortController,'start'|'download'>();
 const snapshot=async(action:string):Promise<{window:WindowState}|{status:DetectiveSnapshot;download:DetectiveDownloadStatus}>=>action.startsWith('window.')?{window:adapter.windowStatus()}:{status:await adapter.status(),download:await adapter.downloadStatus()};
 const revision=(s:Awaited<ReturnType<typeof snapshot>>)=>createHash('sha256').update(JSON.stringify('window' in s?s.window:{selected:s.status.selectedVariant,models:s.status.models,reference:s.status.reference?.filePath,directory:s.status.directory,running:s.status.running,download:{variant:s.download.variant,directory:s.download.directory,busy:s.download.busy,packages:s.download.packages}})).digest('hex');
 const immediate=new Set(['detective.stop','detective.cancelDownload']);
 async function execute(request:AgentToolBridgeRequest,ticket={...epochs}):Promise<AgentToolBridgeResponse>{
  try{
   const args=request.args,action=String(args.action??'');
   if(!Object.hasOwn(catalog,action))throw Error('此平台未接通该原生操作');
   const spec=catalog[action],allowed=new Set(['action','expectedRevision',...(spec.fields??[])]);
   const operation=action==='detective.start'?'start':action==='detective.download'?'download':undefined;
   const assertNotStopped=()=>{if(operation&&ticket[operation]!==epochs[operation])throw Error('操作已停止，未重新启动');};
   assertNotStopped();
   for(const key of Object.keys(args))if(!allowed.has(key))throw Error('未知操作参数：'+key);
   request.signal?.throwIfAborted();
   const stop=action==='detective.stop'?'start':action==='detective.cancelDownload'?'download':undefined;
   if(stop){epochs[stop]++;for(const [controller,operation] of pendingApprovals)if(operation===stop)controller.abort();}
   const before=await snapshot(action),rev=revision(before);
   if(spec.effect!=='read'&&!immediate.has(action)&&args.expectedRevision!==rev)throw Error('状态已变化，请读取同类 status 并传入 expectedRevision');
   if(action==='detective.select'&&!['full','light'].includes(String(args.variant)))throw Error('variant 需要 full 或 light');
   if(action==='detective.configure'&&!['python','assets'].includes(String(args.kind)))throw Error('kind 需要 python 或 assets');
   if(action==='detective.clear'&&typeof args.deleteImages!=='boolean')throw Error('请明确是否同时删除生成图片');
   let run:DetectiveRunRequest|undefined;
   if(action==='detective.start'){
    if('status' in before&&(before.status.running||before.download.busy||before.status.runtimeValidation?.state!=='passed'))throw Error('请先完成模型校验并等待当前任务结束');
    if(typeof args.prompt!=='string'||!args.prompt.trim()||args.prompt.length>16000||typeof args.style!=='string'||args.style.length>8000)throw Error('请提供有效的固定提示词和画风提示词');
    if(args.attachmentId!==undefined&&(typeof args.attachmentId!=='string'||!args.attachmentId||args.attachmentId.length>200))throw Error('attachmentId 无效');
    const image=args.attachmentId?await adapter.image(String(args.attachmentId)):('status' in before?before.status.reference?.filePath:undefined);
    if(!image)throw Error('请先选择目标图片，或提供历史图片 attachmentId');
    run={image,prompt:args.prompt,style:args.style,budget:detectiveBudget(args.budget),parameters:detectiveParameters(args.parameters as DetectiveRunRequest['parameters'])};
   }
   if(['detective.clear','detective.openResults'].includes(action)&&'status' in before&&!before.status.directory)throw Error('当前没有迭代结果目录');
   if(action==='detective.download'&&'status' in before&&before.status.runtimeValidation?.state==='passed')throw Error('当前模型和环境已验证，无需重复下载；如需其他模型，请先切换');
   assertNotStopped();
   if(spec.effect==='confirm'){
    const consent={...args,title:spec.title,...('status' in before?{selectedVariant:before.status.selectedVariant,downloadBytes:action==='detective.download'?before.download.total:undefined,directory:action==='detective.download'?before.download.directory:before.status.directory,targetImage:run?.image}:{}),...(run?{parameters:run.parameters}:{})};
    const controller=new AbortController();if(operation)pendingApprovals.set(controller,operation);
    let approved=false;
    try{approved=await approve({...request,args:consent,signal:request.signal?AbortSignal.any([request.signal,controller.signal]):controller.signal});}
    finally{pendingApprovals.delete(controller);}
    if(!approved)throw Error('Agent 内已取消，未执行');
    assertNotStopped();
    if(revision(await snapshot(action))!==rev)throw Error('确认期间状态已变化；未执行');
   }
   request.signal?.throwIfAborted();
   assertNotStopped();
   if(spec.effect!=='read'){
    if(action.startsWith('window.'))adapter.windowAction(action.slice(7));
    else await adapter.invoke(action,run?{...run}:action==='detective.clear'?{directory:'status' in before?before.status.directory:undefined,deleteImages:args.deleteImages}:args);
   }
   const after=await snapshot(action);
   if(action==='detective.select'&&'status' in after&&after.status.selectedVariant!==args.variant)throw Error('模型切换回读不一致，请重新读取状态');
   if(action==='detective.verify'&&'status' in after&&after.status.runtimeValidation?.state!=='passed')throw Error(after.status.runtimeValidation?.message??'模型校验尚未通过，请查看模型与环境目录');
   if(action==='detective.clear'&&'status' in after&&after.status.directory)throw Error('清空结果回读不一致，请重新读取状态');
   if('window' in after&&((action==='window.show'&&!after.window.visible)||(action==='window.minimize'&&!after.window.minimized)||(action==='window.maximize'&&!after.window.maximized)||(action==='window.restore'&&(after.window.minimized||after.window.maximized))))throw Error('窗口状态回读不一致，请重新读取状态');
   const data={action,executed:spec.effect!=='read',revision:revision(after),readback:projectStudioData(after),notice:action==='detective.start'?'迭代已提交；请读取 status 查看进度，不要重复启动。':action==='detective.download'?'下载已提交；完成状态以 status 为准。':action==='detective.stop'?'已请求停止；请回读 running，已生成图片保留。':undefined};
   return {ok:true,title:spec.title,data,output:JSON.stringify(data)};
  }catch(error){return {ok:false,title:'原生操作未完成',output:error instanceof Error?error.message:String(error)};}
 }
 return {catalog,handles:(r:AgentToolBridgeRequest)=>r.tool==='langbai_software_action'&&Object.hasOwn(catalog,String(r.args.action)),execute:(r:AgentToolBridgeRequest)=>{
  const ticket={...epochs};
  if(String(r.args.action).endsWith('.status')||immediate.has(String(r.args.action)))return execute(r);
  const task=tail.then(()=>execute(r,ticket));tail=task.catch(()=>{});return task;
 }};
}

export function desktopNativeAdapter(window:()=>BrowserWindow|null):NativeActionAdapter{
 const owner=()=>{const w=window();if(!w||w.isDestroyed())throw Error('软件窗口未就绪');return w;};
 return {
  windowStatus:()=>{const w=owner();return {visible:w.isVisible(),minimized:w.isMinimized(),maximized:w.isMaximized()};},
  windowAction:action=>{const w=owner();switch(action){case 'show':if(w.isMinimized())w.restore();w.show();w.focus();break;case 'minimize':w.minimize();break;case 'maximize':w.maximize();break;case 'restore':w.restore();w.unmaximize();break;default:throw Error('未知窗口操作');}},
  status:async()=> (await import('./artist-detective.js')).detectiveStatus(),
  downloadStatus:async()=> (await import('./detective-download.js')).detectiveDownloadStatus(),
  image:async id=>{const {getHistoryReferenceItems}=await import('./store.js');const item=getHistoryReferenceItems().find(x=>x.id===id);if(!item)throw Error('历史图片不存在，请重新选择');const fs=await import('node:fs/promises');const st=await fs.lstat(item.filePath);if(!st.isFile()||st.isSymbolicLink())throw Error('图片已移动或不是普通文件');return item.filePath;},
  invoke:async(action,args)=>{
   const d=await import('./artist-detective.js'),download=await import('./detective-download.js');
   switch(action){
    case 'detective.select':return d.detectiveSelectModel(args.variant as 'full'|'light');
    case 'detective.verify':return d.detectiveVerifyRuntime();
    case 'detective.configure':return d.detectiveConfigure(args.kind as 'python'|'assets');
    case 'detective.downloadDirectory':return download.detectiveDownloadDirectory();
    case 'detective.download':return download.detectiveDownloadStart();
    case 'detective.cancelDownload':return download.detectiveDownloadCancel();
    case 'detective.start':return d.detectiveStart(args as unknown as DetectiveRunRequest);
    case 'detective.stop':return d.detectiveStop();
    case 'detective.clear':return d.detectiveClearResults(args as {directory:string;deleteImages:boolean});
    case 'detective.openResults':return d.detectiveOpenResults();
    default:throw Error('未接通的原生操作');
   }
  },
 };
}
