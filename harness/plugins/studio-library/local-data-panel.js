import React,{useEffect,useRef,useState} from 'react';
const h=React.createElement;
export const collections={characters:'角色卡',personas:'用户人设',lorebooks:'世界书',samplerPresets:'酒馆采样预设',styles:'画风预设',positivePresets:'正面提示词预设',characterPresets:'角色提示词',promptChunks:'提示词片段',references:'参考图预设'};
const portable=new Set(['characters','personas','lorebooks','samplerPresets','styles','positivePresets']);
export function parseTransfer(text){
 if(text.length>95000)throw Error('文本文件超过限制；请用软件完整备份导入');
 const data=JSON.parse(text);
 if(data?.format!=='studio-local-text/v1'||!portable.has(data.collection)||!Array.isArray(data.items)||!data.items.length||data.items.length>50)throw Error('请选择本面板导出的文本资料文件（1–50 项）');
 return {collection:data.collection,items:data.items};
}
export function LocalDataPanel({call,sessionId}){
 const [collection,setCollection]=useState('characters'),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
 const file=useRef(null),serial=useRef(0);
 useEffect(()=>{let live=true;const id=++serial.current;setResult(null);setError('');setBusy(true);
  const timer=setTimeout(()=>call('langbai_list_studio_data',{collection,query,offset,limit:20}).then(v=>{if(!v||!Array.isArray(v.items))throw Error('本机数据接口没有返回资料，请从软件内重新启动 Agent');if(live)setResult(v);}).catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live&&id===serial.current)setBusy(false)}),180);
  return()=>{live=false;clearTimeout(timer)};
 },[call,collection,query,offset,reload]);
 async function applyMaterial(item){
  setBusy(true);setError('');setMessage('');
  try{
   const args={collection,id:item.id,sessionId};
   const preview=await call('studio_session_material',{...args,action:'inspect'});
   if(!preview.canApply)throw Error('请先停止或等待当前会话完成，再应用资料');
   setMessage('请在 Agent 内的确认卡片核对本次绑定。');
   const result=await call('studio_session_material',{...args,action:'apply',expectedRevision:preview.expectedRevision});
   if(result.cancelled){setMessage('已取消，资料和会话未修改');return;}
   if(!result.ok)throw Error(result.error??'应用未完成，请检查会话资料，勿重复导入');
   setMessage((result.alreadyApplied?'当前会话已使用这份资料':'已应用到当前会话，下一轮对话生效')+'；没有生成图片。'+(result.warnings??[]).join(' '));
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function importFile(e){setError('');setPending(null);const selected=e.target.files?.[0];e.target.value='';if(!selected)return;
  try{if(selected.size>380000)throw Error('文件过大，请使用完整备份导入');setPending(parseTransfer(await selected.text()));}catch(e){setError(e.message);}}
 async function importNow(){setBusy(true);setError('');try{const data=await call('langbai_import_studio_data',pending);if(!data?.imported)throw Error('没有收到导入完成结果，请刷新核对，勿重复导入');setMessage(`已新增 ${data.imported} 项；备份：${data.backupPath}`);setPending(null);setReload(x=>x+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
 function download(){try{
  const text=JSON.stringify({format:'studio-local-text/v1',collection,items:result.items},null,2);parseTransfer(text);
  const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`studio-${collection}-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(e){setError(e.message);}}
 return h('section',{className:'studio-library studio-local-data','aria-busy':busy},
  h('h3',null,'本机资料 · 导入 / 导出'),
  h('p',{className:'studio-library-muted'},'读取当前运行 Studio 的本机已保存资料，不会自动与另一台设备同步。这里的角色卡和预设属于软件资料库；新酒馆 Roleplay 插件有独立资料库，可将所选资料应用到当前会话，自动创建或复用副本，原资料不会被覆盖。'),
  h('div',{className:'studio-library-grid'},h('label',{className:'studio-library-field'},'资料类型',h('select',{value:collection,disabled:busy||!!pending,onChange:e=>{setCollection(e.target.value);setOffset(0)}},...Object.entries(collections).map(([value,label])=>h('option',{key:value,value},label)))),h('label',{className:'studio-library-field'},'搜索本机资料',h('input',{value:query,disabled:!!pending,onChange:e=>{setQuery(e.target.value);setOffset(0)},placeholder:'名称或内容'}))),
  h('div',{className:'studio-library-toolbar'},h('button',{disabled:busy,onClick:()=>setReload(x=>x+1)},'重新读取'),h('button',{disabled:busy||!result?.items.length||!portable.has(collection),onClick:download},'导出本页文本'),h('button',{disabled:busy,onClick:()=>file.current.click()},'导入文本资料'),h('input',{ref:file,type:'file',accept:'.json,application/json',hidden:true,onChange:importFile})),
  h('p',{className:'studio-library-muted'},'文本交换保留正文，导入为新副本，不覆盖已有内容。图片、附件、对话和全部设置请使用 Studio「设置 → 数据与存储 → 跨端数据导入与导出」的 .naisbackup。'),
  error?h('div',{role:'alert',className:'studio-library-error'},error):null,
  message?h('p',{role:'status',style:{overflowWrap:'anywhere'}},message):null,
  pending?h('div',{className:'studio-parameter-card'},h('strong',null,`待导入：${collections[pending.collection]} · ${pending.items.length} 项`),h('p',null,pending.items.map(x=>x.name??'未命名').join('、')),h('p',{className:'studio-library-muted'},'导入新增副本，不覆盖已有资料。原资料会保留；导入前会创建本机备份。'),h('div',{className:'studio-library-toolbar'},h('button',{disabled:busy,onClick:()=>setPending(null)},'取消'),h('button',{disabled:busy,onClick:importNow},'请求导入副本'))):null,
  result?h(React.Fragment,null,h('p',{className:'studio-library-muted'},`${result.source??'Studio 本机资料'} · ${result.total} 项`),result.items.length?h('div',{className:'studio-library-list'},...result.items.map((item,i)=>h('article',{key:item.id??i},h('div',null,h('strong',null,item.name??item.title??item.id??'未命名'),h('details',null,h('summary',null,'查看内容'),h('pre',null,JSON.stringify(item,null,2)))),['characters','personas','lorebooks','samplerPresets'].includes(collection)?h('button',{className:'studio-material-apply',disabled:busy||!sessionId||!!pending,onClick:()=>applyMaterial(item)},'应用到当前会话'):null))):h('p',null,'已连接本机资料库，当前分类或搜索结果为空。'),h('div',{className:'studio-library-toolbar'},h('button',{disabled:busy||offset===0,onClick:()=>setOffset(Math.max(0,offset-20))},'上一页'),h('span',null,`第 ${Math.floor(offset/20)+1} 页`),h('button',{disabled:busy||result.nextOffset==null,onClick:()=>setOffset(result.nextOffset)},'下一页'))):!error?h('p',{role:'status'},'正在读取本机资料…'):null);
}
