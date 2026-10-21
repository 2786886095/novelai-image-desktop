import {useState} from 'react';
import {Button} from '../../components/ui';
import {Icon} from '../../components/icons';
import {comfyTaskFacts} from '../task-records';
import type {ComfyResultItem,ComfyRunSnapshot} from '../contract';
import './comfy-task-cards.css';

type Text=(key:string,values?:Record<string,string|number>)=>string;
type Props={run:ComfyRunSnapshot;results:ComfyResultItem[];workflowName:string|null;ft:Text;language?:string;now:number;expanded:boolean;onToggle:()=>void;onViewImage:(image:ComfyResultItem)=>void;onReuse:(image:ComfyResultItem)=>void;onReveal:(image:ComfyResultItem)=>void;onLogs:()=>void;reuseReason:string|null;onCancel?:()=>void;cancelling:boolean;cancelSummary?:string|null};
const PHASE:Record<string,string>={validating:'正在校验',submitting:'正在提交',queued:'排队中',running:'运行中',saving:'保存结果中',completed:'已完成',failed:'已失败',cancelling:'取消中',cancelled:'已取消'};
const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value):'';
function elapsed(seconds:number){const s=Math.max(0,Math.floor(seconds));return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function timestamp(ms:number|null,language:string|undefined,full=false){if(ms===null)return null;try{return new Intl.DateTimeFormat(language||'zh-CN',full?{dateStyle:'medium',timeStyle:'medium'}:{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(ms);}catch{return new Date(ms).toISOString();}}
function ComfyTaskThumbnail({image,onView,ft}:{image?:ComfyResultItem;onView:(image:ComfyResultItem)=>void;ft:Text}){
 const [failed,setFailed]=useState(false);
 return image?<button type="button" className="comfy-task-thumb" data-comfy-task-thumbnail={image.id} aria-label={ft('查看图片')} onClick={()=>onView(image)}>{!failed?<img src={image.fileUrl} alt={ft('任务结果缩略图')} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span><Icon name="image"/>{ft('缩略图不可用')}</span>}</button>:<div className="comfy-task-thumb" data-comfy-task-no-image><span><Icon name="image"/>{ft('未找到图片')}</span></div>;
}

/** Pure card render; main owns file actions and the selected expanded run id. */
export function ComfyTaskCard(p:Props){
 const {run,ft}=p,facts=comfyTaskFacts(run,p.results,p.now),image=facts.firstImage;
 const id=`comfy-task-${encodeURIComponent(run.runId)}`,detailId=id+'-detail',reasonId=id+'-reuse-reason';
 const unknown=run.history?.status==='unknown',phase=unknown?'unknown':run.phase,status=ft(unknown?'历史状态未知':PHASE[run.phase]??'未知');
 const started=timestamp(facts.startedMs,p.language),finished=timestamp(facts.finishedMs,p.language,true);
 const dimensions=facts.dimensions.map(size=>`${size.width}×${size.height}`),seed=facts.seeds[0];
 const error=run.error,errors=Array.isArray(error?.nodeErrors)?error.nodeErrors:[];
 const nodeProgress=Number.isFinite(run.nodesExecuted)&&Number.isFinite(run.nodesTotal)?`${run.nodesExecuted}/${run.nodesTotal}`:ft('未记录');
 return <article className="comfy-local-run" data-comfy-task-card data-comfy-run-id={run.runId} data-run-phase={phase}>
  <div className="comfy-task-card-main">
   <ComfyTaskThumbnail key={image?.id??run.runId} image={image??undefined} onView={p.onViewImage} ft={ft}/>
   <div className="comfy-task-card-content">
    <header className="comfy-task-card-heading"><span className="comfy-task-state" data-phase={phase}>{phase==='completed'?<Icon name="successCircle"/>:phase==='failed'?<Icon name="warning"/>:phase==='unknown'?<Icon name="info"/>:null}{status}</span><h3 title={p.workflowName??undefined}>{p.workflowName??ft('原工作流不可用')}</h3><span className="comfy-task-count">{facts.imageCount===null?ft('图片数未记录'):ft('{count} 张已保存图片',{count:facts.imageCount})}</span></header>
    <dl className="comfy-task-card-meta"><div><dt>{ft('开始时间')}</dt><dd>{started&&facts.startedMs!==null?<time dateTime={new Date(facts.startedMs).toISOString()} title={timestamp(facts.startedMs,p.language,true)??undefined}>{started}</time>:ft('未记录')}</dd></div><div><dt>{ft('总耗时')}</dt><dd>{facts.elapsedSeconds===null?ft('耗时未记录'):`${elapsed(facts.elapsedSeconds)}${facts.liveElapsed?` · ${ft('进行中')}`:''}`}</dd></div><div><dt>{ft('输出尺寸')}</dt><dd>{dimensions.length?`${dimensions[0]}${dimensions.length>1?` +${dimensions.length-1}`:''}`:ft('未记录')}</dd></div><div><dt>{ft('种子')}</dt><dd>{seed?`${seed.value}${facts.seeds.length>1?` +${facts.seeds.length-1}`:''}`:ft('未记录')}</dd></div></dl>
    <p className="comfy-task-card-prompt" title={facts.prompt||undefined}>{facts.prompt||ft('提示词未记录')}</p>
    {unknown?<p className="comfy-task-inline-note">{ft('软件重启前未结束，不会自动恢复或重新提交。')}</p>:null}
    {p.cancelSummary?<p className="comfy-task-inline-note">{p.cancelSummary}</p>:null}
    {error?<p className="comfy-task-error-summary"><Icon name="warning"/><span>{`[${text(error.code)}] ${text(error.message)}`}</span></p>:null}
    {p.onCancel?<div className="comfy-task-live-progress"><span>{ft('节点进度')} {nodeProgress}</span>{run.progress&&Number.isFinite(run.progress.value)&&run.progress.max>0?<progress aria-label={ft('运行中')} value={run.progress.value} max={run.progress.max}/>:null}</div>:null}
    <div className="comfy-task-card-actions"><Button variant="ghost" disabled={!image} onClick={()=>{if(image)p.onViewImage(image);}}>{ft('查看图片')}</Button><Button variant="ghost" disabled={Boolean(p.reuseReason)||!image} aria-describedby={p.reuseReason?reasonId:undefined} onClick={()=>{if(!p.reuseReason&&image)p.onReuse(image);}}>{ft('复用参数')}</Button>{p.onCancel?<Button disabled={p.cancelling} onClick={p.onCancel}>{ft('取消任务')}</Button>:null}<button type="button" className="btn btn-ghost comfy-task-detail-toggle" data-comfy-task-toggle aria-expanded={p.expanded} aria-controls={detailId} onClick={p.onToggle}><Icon name="chevronRight"/>{ft('任务详情')}</button></div>
    {p.reuseReason?<small className="comfy-task-disabled-reason" id={reasonId}>{p.reuseReason}</small>:null}
   </div>
  </div>
  {p.expanded?<section id={detailId} className="comfy-task-detail" role="region" aria-label={ft('任务详情')} data-comfy-task-detail onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();event.preventDefault();p.onToggle();const card=event.currentTarget.closest('[data-comfy-task-card]');(card?.querySelector('[data-comfy-task-toggle]') as HTMLButtonElement|null)?.focus();}}}>
   <section><h4>{ft('任务信息')}</h4><dl className="comfy-task-detail-facts"><dt>{ft('工作流')}</dt><dd>{p.workflowName??ft('原工作流不可用')}</dd><dt>{ft('任务 ID')}</dt><dd><code>{run.runId}</code></dd><dt>{ft('提示 ID')}</dt><dd><code>{run.promptId??ft('未记录')}</code></dd><dt>{ft('开始时间')}</dt><dd>{timestamp(facts.startedMs,p.language,true)??ft('未记录')}</dd><dt>{ft('结束时间')}</dt><dd>{finished??ft('未记录')}</dd><dt>{ft('节点进度')}</dt><dd>{nodeProgress}</dd><dt>{ft('全部种子')}</dt><dd>{facts.seeds.length?<ul>{facts.seeds.map(item=><li key={item.id}><code>{item.id}</code> · {item.value}</li>)}</ul>:ft('未记录')}</dd></dl></section>
   <section><h4>{ft('结果与参数')}</h4><p className="comfy-local-note">{ft('参数来自该任务的已保存图片，不使用当前编辑草稿。')}</p>{image?<><dl className="comfy-task-detail-facts"><dt>{ft('输出尺寸')}</dt><dd>{dimensions.join(' · ')||ft('未记录')}</dd><dt>{ft('文件路径')}</dt><dd><code>{text(image.filePath)||ft('未记录')}</code></dd></dl><Button variant="ghost" onClick={()=>p.onReveal(image)}><Icon name="folderOpen"/>{ft('打开文件位置')}</Button></>:<p>{ft('未找到该任务的图片索引，原图可能仍在输出目录。')}</p>}{facts.recordedValues?<pre className="comfy-task-parameters">{JSON.stringify(facts.recordedValues,null,2)}</pre>:<p>{ft('参数未记录')}</p>}{run.nonImageOutputs>0?<p>{ft('另有 {count} 个非静态图片输出保留在 ComfyUI 输出目录。',{count:run.nonImageOutputs})}</p>:null}</section>
   {error?<section className="comfy-task-error-detail"><h4>{ft('错误与节点诊断')}</h4><pre>{`[${text(error.code)}] ${text(error.message)}`}</pre>{errors.map((item,index)=><details key={index}><summary>{ft('失败节点 {node}',{node:`#${text(item.nodeId)} ${text(item.classType)}`})}</summary><pre>{`${text(item.message)}${item.details?`\n${text(item.details)}`:''}`}</pre></details>)}</section>:null}
   <footer className="comfy-task-detail-footer"><Button variant="ghost" onClick={p.onLogs}>{ft('查看运行日志')}</Button><small>{ft('此处打开当前服务日志，不是该历史任务的独立日志。')}</small></footer>
  </section>:null}
 </article>;
}
