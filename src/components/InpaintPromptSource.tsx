import {workflowText} from '../workflow-text';
import {requestSettingsSection} from '../prompt-ui-settings';
import {useEffect,useRef,useState} from 'react';
import {useAppStore} from '../store';
import {inspectImageMetadata,parseImageMeta} from '../png-meta';
import {metadataSnapshotToFile} from '../metadata-snapshot';
export function InpaintPromptSource(){
 const image=useAppStore(s=>s.workbenchImage),value=useAppStore(s=>s.inpaintPositivePrompt),settings=useAppStore(s=>s.settings);
 const text=workflowText(settings?.language);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<{text:string;original:string;path:string}|null>(null),revision=useRef(0),pending=useRef(false);
 useEffect(()=>{revision.current++;setPreview(null);setError('');setBusy(false);pending.current=false;return()=>{revision.current++;};},[image?.filePath]);
 async function read(kind:'metadata'|'reverse'){
  if(!image||pending.current)return;
  if(kind==='reverse'&&(!settings?.visionApiKey.trim()||!settings.visionApiUrl.trim())){setError('请先在设置中配置 AI 反推 API。');return;}
  const id=++revision.current,path=image.filePath,original=value;pending.current=true;setBusy(true);setError('');setPreview(null);
  try{const result=await window.naiDesktop.readMetadataSnapshotFromPath(path);if(!result.ok||!result.snapshot)throw Error(result.message||'原图读取失败。');let text='';
   if(kind==='metadata'){const file=metadataSnapshotToFile(result.snapshot),report=inspectImageMetadata(parseImageMeta(await file.arrayBuffer()));text=report.imported.positivePrompt??'';if(!text.trim())throw Error('原图没有可读取的提示词，可选择 AI 反推。');}
   else{const response=await window.naiDesktop.reversePrompt(result.snapshot.base64,'tags','full','',false,settings?.reversePromptTemplateVersion??'v5');if(!response.ok||!response.prompt)throw Error(response.message||'反推失败。');text=response.prompt;}
   if(id===revision.current)setPreview({text,original,path});
  }catch(e){if(id===revision.current)setError(e instanceof Error?e.message:String(e));}finally{if(id===revision.current){pending.current=false;setBusy(false);}}
 }
 function apply(){if(!preview)return;const state=useAppStore.getState();if(state.workbenchImage?.filePath!==preview.path||state.inpaintPositivePrompt!==preview.original){setError('图片或提示词已改变，请重新读取。');return;}state.setInpaintPositivePrompt(preview.text);setPreview(null);}
 return <div className="inpaint-prompt-source"><div className="inpaint-prompt-source-actions"><button className="btn" disabled={!image||busy} onClick={()=>void read('metadata')}>{text.read}</button><button className="btn" disabled={!image||busy} onClick={()=>void read('reverse')}>{text.reverse}</button></div>{busy&&<p role="status">{text.busy}</p>}{error&&<p role="alert">{error}{(!settings?.visionApiKey.trim()||!settings.visionApiUrl.trim())&&<button className="btn" onClick={()=>{requestSettingsSection('ai-reverse');useAppStore.getState().setShowSettings(true);}}>{text.configure}</button>}</p>}{preview&&<div className="inpaint-prompt-preview"><textarea aria-label={text.prompt} readOnly value={preview.text}/><button className="btn" disabled={value!==preview.original} onClick={apply}>{text.apply}</button><button className="btn" onClick={()=>setPreview(null)}>{text.cancel}</button></div>}</div>;
}
