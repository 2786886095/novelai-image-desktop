import {COMFY_LIMITS,type ComfySlotValue} from './contract';

export const COMFY_WORKSPACE_DRAFTS_KEY='langbai.comfy-studio.workspace-drafts.v1';
export const COMFY_WORKSPACE_DRAFT_LIMIT=100;
export const COMFY_WORKSPACE_DRAFT_BYTES=1024*1024;
export interface ComfyWorkspaceDraft {
  workflowId:string;
  sourceSha256:string;
  values:Record<string,ComfySlotValue>;
  seedMode:'fixed'|'random';
}
export interface ComfyWorkspaceDrafts {
  selectedId:string;
  drafts:ComfyWorkspaceDraft[];
}
type StorageReader=Pick<Storage,'getItem'>;
type StorageWriter=Pick<Storage,'setItem'>;
const BAD_KEYS=new Set(['__proto__','constructor','prototype']);
// Match main-owned workflow record ids; do not infer identity from a title/path.
const WORKFLOW_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SHA256=/^[a-fA-F0-9]{64}$/;
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const workflowId=(v:unknown):v is string=>typeof v==='string'&&WORKFLOW_ID.test(v)&&!BAD_KEYS.has(v);
const slotId=(v:string)=>v.length>0&&v.length<=256&&!BAD_KEYS.has(v)&&!/[\u0000-\u001f\u007f]/.test(v);
const scalar=(v:unknown):v is ComfySlotValue=>typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=COMFY_LIMITS.slotTextChars;
const bytes=(raw:string)=>new TextEncoder().encode(raw).byteLength;
const empty=(warning:boolean):ComfyWorkspaceDrafts&{warning:boolean}=>({selectedId:'',drafts:[],warning});
function invalid():never {throw new Error('COMFY_WORKSPACE_DRAFTS_INVALID');}

/** Copies all own typed scalar slots without normalizing, sorting or coercing.
 * Null-prototype maps avoid turning a persisted key into object behavior. */
function checkedValues(value:unknown):Record<string,ComfySlotValue> {
  if(!plain(value)||Reflect.ownKeys(value).length>COMFY_LIMITS.slotCount)invalid();
  const result:Record<string,ComfySlotValue>=Object.create(null);
  for(const key of Reflect.ownKeys(value)){
    if(typeof key!=='string'||!slotId(key))invalid();
    const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(!descriptor?.enumerable||!('value' in descriptor)||!scalar(descriptor.value))invalid();
    result[key]=descriptor.value;
  }
  return result;
}
function checkedDraft(value:unknown):ComfyWorkspaceDraft {
  if(!plain(value)||!workflowId(value.workflowId)||typeof value.sourceSha256!=='string'||!SHA256.test(value.sourceSha256)||(value.seedMode!=='fixed'&&value.seedMode!=='random'))invalid();
  return {workflowId:value.workflowId,sourceSha256:value.sourceSha256,values:checkedValues(value.values),seedMode:value.seedMode};
}

/** Broken records may be omitted with a warning, never silently written back.
 * Restoring a draft still requires the caller to match BOTH workflowId and the
 * exact sourceSha256 from the authoritative current workflow list. */
export function loadComfyWorkspaceDrafts(storage?:StorageReader):ComfyWorkspaceDrafts&{warning:boolean} {
  try{
    const target=storage??globalThis.localStorage;if(!target)throw new Error('unavailable');
    const raw=target.getItem(COMFY_WORKSPACE_DRAFTS_KEY);if(raw===null)return empty(false);
    if(raw.length>COMFY_WORKSPACE_DRAFT_BYTES||bytes(raw)>COMFY_WORKSPACE_DRAFT_BYTES)return empty(true);
    const value:unknown=JSON.parse(raw);
    if(!plain(value)||value.version!==1||!Array.isArray(value.drafts)||value.drafts.length>COMFY_WORKSPACE_DRAFT_LIMIT)return empty(true);
    let warning=false;
    const selectedId=value.selectedId===''||workflowId(value.selectedId)?value.selectedId:'';
    if(selectedId!==value.selectedId)warning=true;
    const drafts:ComfyWorkspaceDraft[]=[],seen=new Set<string>();
    for(const item of value.drafts){
      try{
        const draft=checkedDraft(item);if(seen.has(draft.workflowId)){warning=true;continue;}
        seen.add(draft.workflowId);drafts.push(draft);
      }catch{warning=true;}
    }
    return {selectedId,drafts,warning};
  }catch{return empty(true);}
}

/** Full-snapshot write. Invalid/oversized state and storage errors propagate so
 * the UI cannot report durable success after truncation or a failed setItem. */
export function saveComfyWorkspaceDrafts(state:ComfyWorkspaceDrafts,storage?:StorageWriter):void {
  if(!plain(state)||(state.selectedId!==''&&!workflowId(state.selectedId))||!Array.isArray(state.drafts)||state.drafts.length>COMFY_WORKSPACE_DRAFT_LIMIT)invalid();
  const seen=new Set<string>(),drafts:ComfyWorkspaceDraft[]=[];
  for(const item of state.drafts){
    const draft=checkedDraft(item);if(seen.has(draft.workflowId))invalid();
    seen.add(draft.workflowId);drafts.push(draft);
  }
  const raw=JSON.stringify({version:1,selectedId:state.selectedId,drafts});
  if(raw.length>COMFY_WORKSPACE_DRAFT_BYTES||bytes(raw)>COMFY_WORKSPACE_DRAFT_BYTES)throw new Error('COMFY_WORKSPACE_DRAFTS_TOO_LARGE');
  const target=storage??globalThis.localStorage;if(!target)throw new Error('COMFY_WORKSPACE_DRAFTS_UNAVAILABLE');
  target.setItem(COMFY_WORKSPACE_DRAFTS_KEY,raw);
}
