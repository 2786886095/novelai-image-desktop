import {useEffect,useRef,useState} from "react";
import JSZip from "jszip";
import {Button} from "./components/ui";
import {useAppStore} from "./store";
import {loadMetadataRecoveryMode,readImageMetadataForRecovery,saveMetadataRecoveryMode,type MetadataRecoveryMode} from "./metadata-recovery";
import {MAX_METADATA_IMAGE_BYTES} from "./image-metadata-pixels";
import {editedMetadata,rewriteGenerationMetadata,type MetadataEdit} from "./image-metadata-edit";
import {metadataToolLabels} from "./image-metadata-tool-labels";
export default function ImageMetadataTool({onBack}:{onBack:()=>void}){
 const l=metadataToolLabels(useAppStore(s=>s.settings?.language));
 const [files,setFiles]=useState<File[]>([]),[kind,setKind]=useState<MetadataEdit["kind"]>("remove");
 const [mode,setMode]=useState(loadMetadataRecoveryMode),[draft,setDraft]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[prefs,setPrefs]=useState(true);
 const ref=useRef<AbortController|null>(null);
 const output=useRef<string|null>(null);
 useEffect(()=>()=>{ref.current?.abort();if(output.current)URL.revokeObjectURL(output.current);},[]);
 async function run(operation:(signal:AbortSignal)=>Promise<void>){
   const c=new AbortController();ref.current=c;setBusy(true);setNotice("");
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
 return <main className="tools-hub">
  <section className="tools-hero"><Button onClick={onBack}>{l[2]}</Button><div><h2>{l[0]}</h2><p>{l[9]}</p></div></section>
  <section className="settings-form">
   <label>{l[7]} <input type="file" multiple accept="image/png,image/webp" disabled={busy} onChange={e=>{setFiles(Array.from(e.target.files??[]).slice(0,64));setDraft("");setNotice("");}} /></label>
   <label>{l[1]} <select value={kind} disabled={busy} onChange={e=>{setKind(e.target.value as MetadataEdit["kind"]);setDraft("");setNotice("");}}>
    <option value="remove">{l[3]}</option><option value="novelai">NovelAI · Comment JSON</option><option value="sd">Stable Diffusion · parameters</option>
   </select></label>
   {kind==="novelai"&&<label><select aria-label={l[5]+" / "+l[6]} value={mode} disabled={busy} onChange={e=>{const m=e.target.value as MetadataRecoveryMode;setMode(m);setPrefs(saveMetadataRecoveryMode(m));setNotice("");setDraft("");}}><option value="online">{l[5]}</option><option value="offline">{l[6]}</option></select>{!prefs&&<small role="status">{l[11]}</small>}</label>}
   {kind!=="remove"&&<><Button disabled={busy||!files.length} onClick={()=>void run(template)}>{l[4]}</Button><textarea aria-label={kind==="novelai"?"Comment JSON":"Stable Diffusion parameters"} disabled={busy} rows={8} value={draft} onChange={e=>setDraft(e.target.value)} /></>}
   <Button variant="primary" disabled={busy||!files.length||(kind!=="remove"&&!draft.trim())} onClick={()=>void run(save)}>{l[8]}</Button>
   {notice&&<pre role="status" style={{whiteSpace:"pre-wrap"}}>{notice}</pre>}
  </section>
 </main>;
}
