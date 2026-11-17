import {ToolWaypoints} from "./components/ToolWaypoints";
import { pageUi } from "./desktop-page-ui";
import {useEffect,useRef,useState} from "react";
import JSZip from "jszip";
import {Button,SelectMenuCompat} from "./components/ui";
import {FilePicker} from "./components/FilePicker";
import {Icon} from "./components/icons";
import {normalizeAppLanguage} from "./i18n";
import {useAppStore} from "./store";
import {loadMetadataRecoveryMode,readImageMetadataForRecovery,saveMetadataRecoveryMode,type MetadataRecoveryMode} from "./metadata-recovery";
import {MAX_METADATA_IMAGE_BYTES} from "./image-metadata-pixels";
import {editedMetadata,rewriteGenerationMetadata,type MetadataEdit} from "./image-metadata-edit";
import {metadataToolLabels} from "./image-metadata-tool-labels";
const formText = {
 "zh-CN":["处理方式","元数据读取方式","编辑参数","未选图片；可一次导入多张 PNG 或 WebP。"],
 "zh-TW":["處理方式","中繼資料讀取方式","編輯參數","尚未選取圖片；可匯入多張 PNG 或 WebP。"],
 "en-US":["Operation","Metadata reader","Edit parameters","No images selected. You can add multiple PNG or WebP files."],
 "ja-JP":["処理方法","読み取り方式","パラメーターを編集","画像未選択。PNG または WebP を複数追加できます。"],
 "ko-KR":["처리 방식","메타데이터 읽기 방식","매개변수 편집","선택한 이미지가 없습니다. PNG 또는 WebP를 여러 개 추가할 수 있습니다."],
} as const;
export default function ImageMetadataTool({onBack}:{onBack:()=>void}){
 const language=useAppStore(s=>s.settings?.language),l=metadataToolLabels(language),copy=pageUi(language);
 const [operationLabel,readerLabel,parameterLabel,emptyLabel]=formText[normalizeAppLanguage(language)];
 const [done,setDone]=useState<number|null>(null);
 const [files,setFiles]=useState<File[]>([]),[kind,setKind]=useState<MetadataEdit["kind"]>("remove");
 const [mode,setMode]=useState(loadMetadataRecoveryMode),[draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[prefs,setPrefs]=useState(true);
 const ref=useRef<AbortController|null>(null);
 const output=useRef<string|null>(null);
 useEffect(()=>()=>{ref.current?.abort();if(output.current)URL.revokeObjectURL(output.current);},[]);
 async function run(operation:(signal:AbortSignal)=>Promise<void>){
   const c=new AbortController();ref.current=c;setBusy(true);setDone(null);setNotice("");
   try{await operation(c.signal);}catch(e){if(!c.signal.aborted)setNotice(String(e));}
   finally{if(!c.signal.aborted)setBusy(false);}
 }
 async function template(signal:AbortSignal){
   try{
     if(files[0].size>MAX_METADATA_IMAGE_BYTES)throw Error("Image exceeds 64 MiB");
     const data=await readImageMetadataForRecovery(await files[0].arrayBuffer(),kind==="sd"?"offline":mode,signal);
     signal.throwIfAborted();
     const value=kind==="sd"?(data.parameters??data.Parameters):(data.Comment??data.comment);
     if(!value)throw Error("The selected format was not found in this image");
     setDraft(value);
   }catch(e){if(!signal.aborted){setDraft("");setNotice((kind==="novelai"&&mode==="online"?l[10]+" ":"")+String(e));}}
 }
 async function save(signal:AbortSignal){
   const edit=kind==="remove"?{kind} as const:{kind,text:draft};
   editedMetadata(edit);
   const zip=new JSZip(),errors:string[]=[];
   let count=0,total=0;
   setDone(0);
   for(const [i,f] of files.entries()){
     signal.throwIfAborted();
     try{
       if(f.size>MAX_METADATA_IMAGE_BYTES)throw Error("Image exceeds 64 MiB");
       const png=await rewriteGenerationMetadata(new Uint8Array(await f.arrayBuffer()),edit);
       signal.throwIfAborted();
       if(total+png.length>160*1024*1024)throw Error("Batch output limit reached; use a smaller batch");
       total+=png.length;count++;
       const safe=f.name.replace(/\.[^.]+$/,"").replace(/[^\p{L}\p{N}._-]+/gu,"-").slice(0,80)||"image";
       zip.file((i+1)+"-"+safe+".png",png);
     }catch(e){errors.push(f.name+": "+String(e));}
     if(!signal.aborted)setDone(i+1);
   }
   if(!count){setNotice(errors.join("\n"));return;}
   if(errors.length)zip.file("skipped.txt",errors.join("\n"));
   const blob=await zip.generateAsync({type:"blob"});
   signal.throwIfAborted();
   if(output.current)URL.revokeObjectURL(output.current);
   output.current=URL.createObjectURL(blob);
   const a=document.createElement("a");a.href=output.current;a.download="metadata-processed.zip";a.click();
   setNotice(count+"/"+files.length+(errors.length?"\n"+errors.join("\n"):""));
 }
 return <main className="tools-hub metadata-batch-workspace">
  <header className="tools-hero metadata-batch-hero">
   <div><h2>{l[0]}</h2><p>{l[9]}</p></div>
   <Button variant="ghost" onClick={onBack}><Icon name="chevronRight" className="metadata-back-icon"/>{l[2]}</Button>
  </header>
  <ToolWaypoints label={l[0]} items={[["setup",operationLabel],["queue",copy.files],["result",l[8],!notice]]}/>
  <div className="metadata-batch-columns">
   <section className="metadata-batch-form panel-card" aria-label={operationLabel} aria-busy={busy} data-tool-anchor="setup" tabIndex={-1}>
    <div className="field metadata-batch-input">
     <span>{l[7]}</span>
     <FilePicker aria-label={l[7]} multiple accept="image/png,image/webp,.png,.webp" disabled={busy}
       selectedName={files.length>1?copy.files+" · "+files.length:files[0]?.name??""}
       onChange={e=>{setFiles(Array.from(e.target.files??[]).slice(0,64));setDone(null);setDraft("");setNotice("");}}/>
    </div>
    <div className="field">
     <span>{operationLabel}</span>
     <SelectMenuCompat aria-label={operationLabel} value={kind} disabled={busy}
       onChange={e=>{setKind(e.target.value as MetadataEdit["kind"]);setDone(null);setDraft("");setNotice("");}}>
      <option value="remove">{l[3]}</option>
      <option value="novelai">NovelAI · Comment JSON</option>
      <option value="sd">Stable Diffusion · parameters</option>
     </SelectMenuCompat>
    </div>
    {kind==="novelai"&&<div className="field">
     <span>{readerLabel}</span>
     <SelectMenuCompat aria-label={readerLabel} value={mode} disabled={busy}
       onChange={e=>{const m=e.target.value as MetadataRecoveryMode;setMode(m);setPrefs(saveMetadataRecoveryMode(m));setNotice("");setDraft("");}}>
      <option value="online">{l[5]}</option><option value="offline">{l[6]}</option>
     </SelectMenuCompat>
     {!prefs&&<small role="status">{l[11]}</small>}
    </div>}
    {kind!=="remove"&&<div className="metadata-batch-template">
     <Button disabled={busy||!files.length} onClick={()=>void run(template)}>{l[4]}</Button>
     <label className="field"><span>{parameterLabel}</span><textarea
       aria-label={kind==="novelai"?"Comment JSON":"Stable Diffusion parameters"} className="prompt-box"
       disabled={busy} rows={8} value={draft} onChange={e=>setDraft(e.target.value)}/></label>
    </div>}
    <div className="metadata-batch-actions"><Button variant="primary" disabled={busy||!files.length||(kind!=="remove"&&!draft.trim())}
      onClick={()=>void run(save)}><Icon name="download"/>{l[8]}</Button></div>
   </section>
   <aside className="metadata-batch-side panel-card" data-tool-anchor="queue" tabIndex={-1} aria-label={copy.files}>
    <header><h3>{copy.files}</h3><output aria-live="polite">{files.length}</output></header>
    {!files.length?<p className="metadata-batch-empty">{emptyLabel}</p>:
      <ol className="metadata-batch-file-list">{files.map((f,i)=><li key={i}>
       <Icon name="image"/><span title={f.name}>{f.name}</span><small>{new Intl.NumberFormat(language).format(Math.ceil(f.size / 1024))} KiB</small>
      </li>)}</ol>}
    {done!==null&&<div className="metadata-batch-progress"><progress aria-label={copy.files} max={files.length || 1} value={done}/><output>{done} / {files.length}</output></div>}
    {notice&&<pre role="status" className="tool-metadata-report" data-tool-anchor="result" tabIndex={-1}>{notice}</pre>}
   </aside>
  </div>
 </main>;
}
