import type {ComfySlot,ComfySlotValue} from './contract';

export interface ComfySizePreset {width:number;height:number}
export const COMFY_SIZE_PRESETS_KEY='langbai.comfy-studio.size-presets.v1';
export const COMFY_CUSTOM_SIZE_LIMIT=32;
export const COMFY_BUILTIN_SIZES:readonly ComfySizePreset[]=[
  {width:1024,height:1024},{width:832,height:1216},{width:1216,height:832},
];
type StorageReader=Pick<Storage,'getItem'>;
type StorageWriter=Pick<Storage,'setItem'>;
export const comfySizeId=(size:ComfySizePreset)=>`${size.width}x${size.height}`;
const positiveInteger=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const validSize=(v:unknown):v is ComfySizePreset=>!!v&&typeof v==='object'&&positiveInteger((v as ComfySizePreset).width)&&positiveInteger((v as ComfySizePreset).height);

export function parseComfySizePresets(raw:string|null):{custom:ComfySizePreset[];warning:boolean}{
  if(raw===null)return {custom:[],warning:false};
  try{
    if(raw.length>16_384)throw new Error('oversized');
    const value:unknown=JSON.parse(raw);
    if(!value||typeof value!=='object'||(value as {version?:unknown}).version!==1||!Array.isArray((value as {items?:unknown}).items))throw new Error('invalid');
    const items=(value as {items:unknown[]}).items,seen=new Set(COMFY_BUILTIN_SIZES.map(comfySizeId)),custom:ComfySizePreset[]=[];
    let warning=false;
    for(const item of items){
      if(!validSize(item)){warning=true;continue;}
      const id=comfySizeId(item);if(seen.has(id))continue;
      if(custom.length>=COMFY_CUSTOM_SIZE_LIMIT){warning=true;continue;}
      seen.add(id);custom.push({width:item.width,height:item.height});
    }
    return {custom,warning};
  }catch{return {custom:[],warning:true};}
}
export function loadComfySizePresets(storage?:StorageReader):{custom:ComfySizePreset[];warning:boolean}{
  try{const target=storage??globalThis.localStorage;if(!target)throw new Error('unavailable');return parseComfySizePresets(target.getItem(COMFY_SIZE_PRESETS_KEY));}
  catch{return {custom:[],warning:true};}
}
export function saveComfySizePresets(custom:readonly ComfySizePreset[],storage?:StorageWriter):void{
  if(custom.length>COMFY_CUSTOM_SIZE_LIMIT||custom.some(item=>!validSize(item))||new Set(custom.map(comfySizeId)).size!==custom.length||custom.some(item=>COMFY_BUILTIN_SIZES.some(builtin=>comfySizeId(builtin)===comfySizeId(item))))throw new Error('COMFY_SIZE_PRESETS_INVALID');
  const target=storage??globalThis.localStorage;if(!target)throw new Error('COMFY_SIZE_PRESETS_UNAVAILABLE');
  target.setItem(COMFY_SIZE_PRESETS_KEY,JSON.stringify({version:1,items:custom}));
}
export function comfyDimensionPixels(value:ComfySlotValue|null):number|null{
  if(positiveInteger(value))return value;
  if(typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value)){
    const number=Number(value);if(positiveInteger(number)&&String(number)===value)return number;
  }
  return null;
}
/** A preset is never rounded or coerced into a node's unknown widget schema.
 * Step is a UI increment; the main compiler enforces bounds, not min+n*step. */
export function comfyDimensionPresetValue(slot:ComfySlot,pixels:number,current:ComfySlotValue|null):ComfySlotValue|null{
  if(!positiveInteger(pixels)||slot.min!==undefined&&pixels<slot.min||slot.max!==undefined&&pixels>slot.max)return null;
  if(slot.valueType==='int'||slot.valueType==='float')return pixels;
  if(slot.valueType!=='combo'||!slot.options)return null;
  const candidates=slot.options.filter(value=>value===pixels||value===String(pixels));
  if(candidates.length===1)return candidates[0];
  // When a schema explicitly declares both 832 and "832", retain its current
  // scalar type. A linked/unknown value cannot authorize guessing either type.
  return candidates.find(value=>typeof value===typeof current)??null;
}
export function comfySizePresetValues(size:ComfySizePreset,width:ComfySlot,height:ComfySlot,currentWidth:ComfySlotValue|null,currentHeight:ComfySlotValue|null):{width:ComfySlotValue;height:ComfySlotValue}|null{
  if(width.nodeId!==height.nodeId||width.kind!=='width'||height.kind!=='height')return null;
  const w=comfyDimensionPresetValue(width,size.width,currentWidth),h=comfyDimensionPresetValue(height,size.height,currentHeight);
  return w===null||h===null?null:{width:w,height:h};
}
