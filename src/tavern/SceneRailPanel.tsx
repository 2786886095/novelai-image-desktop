import {useRef, useState} from 'react';
import {SceneBindingsEditor} from './SceneBindingsEditor';
import {readSceneBindings, type SceneBindings} from './scene-bindings';
import {sceneCards, sceneEditRequest, sceneEditSnapshot, sceneFlatText, sceneRailText, sceneDraftLabel, type sceneRailSource} from './scene-rail';
import {sceneErrorMessage, sceneUiText} from './scene-errors';

export function SceneRailPanel({source,language,onLatest,onRequestEdit,onChange,onCreateCopy}: {
  source: ReturnType<typeof sceneRailSource>; language: unknown; onLatest:()=>void;
  onCreateCopy:()=>void;
  onRequestEdit:(request:string)=>Promise<boolean>; onChange:(scene:SceneBindings)=>void;
}) {
  const text=sceneRailText(language), message=source.message, scene=readSceneBindings(message?.imageProposal?.scene);
  const [editing,setEditing]=useState<{id:string;name:string;snapshot:string}|null>(null);
  const [draft,setDraft]=useState(''),[submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  const flight=useRef(false), input=useRef<HTMLTextAreaElement>(null);
  const flat=sceneFlatText(language);
  const snapshot=sceneEditSnapshot(message);
  const stale=!!editing && editing.snapshot!==snapshot;
  const target=editing??(!scene&&message&&!source.historical?{id:'picture',name:flat.scope,snapshot}:null);
  const blocked=source.busy||source.historical||message?.imageProposal?.status==='error'||!!message?.imageProposal?.continuity?.reviewRequired||submitting;
  const submit=async()=>{
    if(!message||!target||blocked||stale||!draft.trim()||flight.current)return;
    flight.current=true;setSubmitting(true);setError('');
    try {if(await onRequestEdit(sceneEditRequest(message,target.id,draft,language))){setDraft('');setEditing(null);}else{setError(flat.failed);}}
    catch(e){setError(sceneErrorMessage(e,language));}
    finally {flight.current=false;setSubmitting(false);}
  };
  const editForm=(target&&<div className="tavern-scene-edit">
        <label className="field"><span>{text.edit} · {target.name}</span><textarea ref={input} rows={3} value={draft} placeholder={text.placeholder}
          disabled={submitting} onChange={e=>{if(!editing)setEditing(target);setDraft(e.target.value);setError('');}}/></label>
        <small className="muted">{text.review}</small>
        {(stale||error)&&<p role="alert">{stale?text.stale:error}</p>}
        <div className="tavern-binding-actions"><button type="button" className="btn" disabled={submitting} onClick={()=>{setEditing(null);setDraft('');setError('');}}>{text.cancel}</button>
          <button type="button" className="btn btn-primary" disabled={blocked||stale||!draft.trim()} aria-busy={submitting||undefined} onClick={()=>void submit()}>{submitting?text.submitting:text.submit}</button></div>
      </div>);
  return <section className="tavern-scene-rail" aria-label={text.title}>
    <header><strong>{text.title}</strong>{source.historical&&<button type="button" className="btn" onClick={onLatest}>{text.latest}</button>}</header>
    <p className="muted">{source.historical?text.history:scene?text.hint:flat.hint}</p>
    {!message?<p className="muted">{text.empty}</p>:!scene?<section className="tavern-scene-card tavern-scene-flat">
      {!source.historical&&editForm}
      {blocked&&!source.historical&&<p className="muted" role="status">{text.locked}</p>}
      <details><summary>{text.details}</summary><p className="tavern-scene-description">{message.imageProposal?.positivePrompt}</p></details>
    </section>:
    <>
      {sceneCards(scene).map(card=><section key={card.id} className="tavern-scene-card">
        <header><strong>{card.name||text.scene}</strong><button type="button" className="btn" aria-label={`${text.edit}: ${card.name||text.scene}`} disabled={blocked||!!scene.entities.find(e=>e.id===card.id)?.locked}
          onClick={()=>{setEditing({id:card.id,name:card.name||text.scene,snapshot});setError('');requestAnimationFrame(()=>input.current?.focus());}}>{text.edit}</button></header>
        {scene.entities.find(e=>e.id===card.id)?.locked&&<small className="muted">{sceneUiText(language).locked}</small>}
        <p className="tavern-scene-excerpt">{card.lines.join(', ')||'—'}</p>
        <details><summary>{text.details}</summary><p className="tavern-scene-description">{card.lines.join('\n')||'—'}</p></details>
        {editing?.id===card.id&&editForm}
      </section>)}
      {blocked&&!source.historical&&<p className="muted" role="status">{text.locked}</p>}
      <details className="tavern-scene-advanced"><summary>{text.advanced}</summary>
        {!source.canEdit&&<p className="muted">{text.readonly}</p>}
        {!source.historical&&!source.busy&&message.imageProposal?.status==='completed'&&<button type="button" className="btn" onClick={onCreateCopy}>{sceneDraftLabel(language)}</button>}
        <SceneBindingsEditor scene={scene} language={language} disabled={!source.canEdit||submitting} onChange={source.canEdit?onChange:undefined}/>
      </details>
    </>}
  </section>;
}
