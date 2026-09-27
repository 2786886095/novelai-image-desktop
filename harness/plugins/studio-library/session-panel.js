import React,{useEffect,useState} from 'react';
const h=React.createElement;
export function selectedSession(state){const selected=Object.values(state?.byId??{}).filter(s=>(s.retainedBy?.mainView??0)>0);return selected.length===1?selected[0].id:null;}
export function SessionControls({call,sessionId,onStyles}){
 const [state,setState]=useState(null),[limit,setLimit]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;setState(null);setError('');if(!sessionId)return;const read=()=>call('studio_session_state',{sessionId}).then(v=>{if(live)setState(v)}).catch(e=>{if(live)setError(e.message)});read();const timer=setInterval(()=>{if(document.visibilityState==='visible')read()},2500);return()=>{live=false;clearInterval(timer)};},[call,sessionId]);
 async function change(tool,args){setBusy(true);setError('');try{setState(await call(tool,{...args,sessionId}))}catch(e){setError(e.message)}finally{setBusy(false)}}
 return h('section',{className:'studio-library studio-session-controls'},h('h3',null,'当前会话 · 生图控制'),
  !sessionId?h('p',null,'请先创建或选择一个酒馆会话。'):h(React.Fragment,null,
   h('p',null,'风格：',state?.style?.name??'跟随软件工作台'),h('div',{className:'studio-library-toolbar'},h('button',{onClick:onStyles},'选择风格'),h('button',{disabled:busy||!state?.style,onClick:()=>change('studio_set_session_style',{presetId:null})},'跟随工作台')),
   h('p',{className:'studio-library-muted'},'选择风格不会生成图片，也不会修改软件工作台。'),
   h('label',{className:'studio-library-field'},'自动生成张数上限（0 为不限）',h('input',{type:'number',min:0,max:100,step:1,value:limit,disabled:busy,onChange:e=>setLimit(e.target.value)})),
   h('div',{className:'studio-library-toolbar'},h('button',{'aria-pressed':state?.mode==='confirm',disabled:busy,onClick:()=>change('studio_generation_policy',{mode:'confirm'})},'逐次确认'),h('button',{'aria-pressed':state?.mode==='auto',disabled:busy||!Number.isInteger(Number(limit))||Number(limit)<0||Number(limit)>100,onClick:()=>change('studio_generation_policy',{mode:'auto',limit:Number(limit)})},'授权全自动')),
   h('p',{role:'status'},state?.mode==='auto'?(state.limit===0?'全自动 · 不限张数':`全自动 · 本次剩余 ${state.remaining} / ${state.limit} 张`):'每次生成前确认'),
   h('p',{className:'studio-library-muted'},'默认全自动、不限累计张数，可能消耗 Anlas 和模型费用。可随时切换逐次确认或停止；选择会保存到当前会话。设置上限后失败尝试也计入限额。'),
   h('button',{disabled:busy,onClick:()=>change('studio_stop_generation',{})},'停止并撤销自动授权')),
  error?h('p',{role:'alert'},error):null);
}
export function StyleCard({style,call,sessionId,onEdit}){
 const [preview,setPreview]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[large,setLarge]=useState(false);
 useEffect(()=>{let live=true;setPreview(null);call('studio_style_preview',{presetId:style.id}).then(v=>{if(live)setPreview(v)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false};},[call,style.id]);
 useEffect(()=>{if(!large)return;const close=e=>{if(e.key==='Escape')setLarge(false)};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[large]);
 async function use(){setBusy(true);try{await call('studio_set_session_style',{sessionId,presetId:style.id});setMessage('已用于当前会话 · 未生成图片');setError('')}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function image(id){try{setPreview(await call('studio_style_preview',{presetId:style.id,imageId:id,large:true}));setLarge(true)}catch(e){setError(e.message)}}
 return h('article',{className:'studio-style-card'},preview?.dataUrl?h('button',{className:'studio-style-thumb','aria-label':'预览 '+style.name,onDoubleClick:()=>image(preview.imageId)},h('img',{src:preview.dataUrl,alt:style.name,loading:'lazy'})):h('span',{className:'studio-style-thumb'},error?'预览读取失败':'暂无预览'),
 h('div',null,h('strong',null,style.name),h('small',null,`${style.group??'默认'} · ${style.rating??0}/5`),h('p',null,style.prompt),h('div',{className:'studio-library-toolbar'},h('button',{disabled:busy||!sessionId,onClick:use},'用于当前会话'),h('button',{onClick:onEdit},'编辑'),preview?.dataUrl?h('button',{onClick:()=>image(preview.imageId)},'预览'):null),message?h('small',{role:'status'},message):null,error?h('small',{role:'alert'},error):null),
 large?h('div',{className:'studio-image-lightbox',role:'dialog','aria-modal':true,'aria-label':'风格预览',onClick:e=>{if(e.target===e.currentTarget)setLarge(false)}},h('img',{src:preview.dataUrl,alt:style.name}),h('div',{className:'studio-preview-actions'},h('button',{onClick:()=>setLarge(false)},'关闭'),...(preview.images??[]).map((v,i)=>h('button',{key:v.id,onClick:()=>image(v.id)},String(i+1))))):null);
}
export function Workspaces({call}){
 const [items,setItems]=useState([]),[error,setError]=useState('');
 const load=tool=>call(tool).then(setItems).catch(e=>setError(e.message));
 useEffect(()=>{load('studio_workspaces')},[call]);
 return h('section',{className:'studio-library'},h('p',null,'同名工作区可能来自不同软件目录。只清理无会话的自动工作区；历史会话和目录均保留。'),h('button',{onClick:()=>load('studio_cleanup_empty_workspaces')},'整理空工作区'),error?h('p',{role:'alert'},error):null,...items.map(w=>h('article',{key:w.id},h('strong',null,w.title),h('p',null,`${w.sessions} 个会话`),h('small',null,w.path))));
}
export function MemoryPanel({remote,sessionId}){
 const [doc,setDoc]=useState(null),[draft,setDraft]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const read=async()=>{if(!remote)throw Error('记忆组件连接未就绪，请完成兼容更新后重启 Agent');const r=await remote.get(sessionId);if(!r.ok)throw Error(r.error.message);setDoc(r.value.document);setDraft(structuredClone(r.value.document));};
 useEffect(()=>{let live=true;if(!sessionId)return;setDoc(null);if(!remote){setError('记忆组件未连接');return}remote.get(sessionId).then(r=>{if(!live)return;if(!r.ok)throw Error(r.error.message);setDoc(r.value.document);setDraft(structuredClone(r.value.document))}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[remote,sessionId]);
 async function run(fn){setBusy(true);setError('');try{await fn()}catch(e){setError(e.message)}finally{setBusy(false)}}
 const save=()=>run(async()=>{const {activeMode,modeSource,modeReason,chat,work,bridge}=draft;const r=await remote.replace(sessionId,{expectedRevision:doc.revision,activeMode,modeSource,modeReason,chat,work,bridge});if(!r.ok||!r.value.ok)throw Error(r.error?.message??r.value.error.message);await read();setMessage('当前会话记忆已保存并回读');});
 return h('section',{className:'studio-library'},h('h3',null,'当前会话记忆'),!sessionId?h('p',null,'先创建或选择一个会话，再查看该会话的记忆。'):h(React.Fragment,null,
 h('p',{className:'studio-library-muted'},'日常记忆与任务记忆分别保留；这里读取实际记忆组件，不是软件旧版记忆列表。'),error?h('p',{role:'alert'},error):null,message?h('p',{role:'status'},message):null,
 h('button',{disabled:busy,onClick:()=>run(read)},'重新读取'),!draft?h('p',null,error?'读取未完成':'正在读取…'):h(React.Fragment,null,...['chat','work'].map(mode=>h('section',{key:mode},h('h4',null,mode==='chat'?'日常记忆':'任务记忆'),...['assistantSetting','assistantState'].map(key=>h('label',{key,className:'studio-library-field'},key==='assistantSetting'?'AI 设定':'AI 当前状态',h('textarea',{rows:3,value:draft[mode]?.[key]??'',disabled:busy,onChange:e=>setDraft({...draft,[mode]:{...draft[mode],[key]:e.target.value}})}))),h('p',null,`人物 ${draft[mode]?.people?.length??0} 位`),h('details',null,h('summary',null,'查看此记忆库完整内容'),h('pre',null,JSON.stringify(draft[mode],null,2))))),h('button',{disabled:busy,onClick:save},'保存当前会话记忆'))));
}
