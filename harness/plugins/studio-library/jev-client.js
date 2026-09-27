import React,{useEffect,useState} from 'react';const h=React.createElement;
export function JevSettings({call}){
 const [state,setState]=useState(null),[enabled,setEnabled]=useState(false),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;call('studio_jev_status').then(v=>{if(live){setState(v);setEnabled(v.enabled);}}).catch(e=>{if(live)setMessage(e.message)});return()=>{live=false}},[call]);
 const save=async()=>{setBusy(true);setMessage('');try{const next=await call('studio_jev_configure',{revision:state.revision,enabled,...(key.trim()?{apiKey:key}: {})});setState(next);setKey('');setMessage(next.enabled?'已保存：后续提示词调用将使用 Jev 筛选。':'已保存：Jev 已关闭，后续仍可生成混合提示词，不请求 Jev。');}catch(e){setMessage(e.message)}finally{setBusy(false)}};
 return h('section',{className:'studio-library'},h('h3',null,'高级候选分析（Jev，可选）'),h('p',null,'常规生图使用上方的软件共用模板；只有主动要求高级候选分析时才使用本节流程。描述或图片 → 语言模型整理 Tag 与英文关系短语 → 可选 Jev 核验 → 按画面主次增减权重 → 混合提示词。'),h('p',{className:'studio-library-muted'},'文字输入适度补全：主动补充适用的服装、视角、景别、光线、姿势、表情和动作细节，保持主体与原场景不变，不擅自增加天气、时间或剧情。图片反推仅依据可见证据，不补不可见细节。Tag 表达元素，英文自然语言补足位置、持物、注视与遮挡关系；约 80/20 为参考，不机械凑比例。固定风格和负面提示词不变。多数词默认权重，明确重点及必要构图补全可适当加强，辅助细节可轻微降权；不自动削弱用户明确要求，也不为凑高低权重而强行调整。Jev 评分不直接等于生图权重，不承诺一次生成完美图片。'),
 h('label',{className:'studio-library-toolbar'},h('input',{type:'checkbox',style:{width:'auto'},checked:enabled,disabled:busy||!state,onChange:e=>setEnabled(e.target.checked)}),'启用 Jev 筛选（可选，保存后生效）'),
 h('p',{className:'studio-library-muted'},'关闭后仍生成混合提示词，保留适度补全和增减权重，只跳过 Jev 语义筛选；不产生 Jev 接口费用。当前语言模型仍可能产生费用。开关和密钥会保存，关闭不会删除密钥。'),
 h('label',{className:'studio-library-field'},'DefAPI API Key（仅开启 Jev 时需要）',h('input',{type:'password',autoComplete:'new-password',value:key,disabled:busy,placeholder:state?.configured?'已配置，留空保留原密钥':'输入 DefAPI 密钥',onChange:e=>setKey(e.target.value)})),
 h('p',{className:'studio-library-muted'},'模型：typesafe/jev-1.13；请求发送到 api.defapi.org。仅发送本次描述、规划、候选词、关系短语，以及反推时的文字观察；不向 Jev 发送图片、聊天记录、软件配置或风格库。调用可能产生接口费用。'),h('button',{disabled:busy||!state,onClick:save},busy?'保存中…':'保存配置'),message?h('p',{role:'status'},message):null);
}
