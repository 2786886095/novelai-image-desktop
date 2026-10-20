import type { ComfyApiPrompt } from "./api-prompt";
import type { ComfyCatalog } from "./object-info";
import type { ComfySlotValue } from "./contract";

/** Evaluate only documented core identity primitives, never arbitrary nodes or code. */
export function resolveStaticScalar(prompt:ComfyApiPrompt,value:unknown,catalog:ComfyCatalog):ComfySlotValue|null {
  const seen=new Set<string>();
  const resolve=(item:unknown,depth=0):ComfySlotValue|null=>{
    if(depth>128)return null;
    if(typeof item==="string"||typeof item==="boolean"||typeof item==="number"&&Number.isFinite(item))return item;
    if(!Array.isArray(item)||item.length!==2||typeof item[0]!=="string"||item[1]!==0||seen.has(item[0]))return null;
    const id=item[0];seen.add(id);
    try{
      const node=prompt[id],def=node&&catalog[node.class_type];if(!node||!def)return null;
      if(def.pythonModule==="comfy_extras.nodes_primitive"&&/^Primitive(?:Int|Float|Boolean|String|StringMultiline)$/.test(node.class_type))return resolve(node.inputs.value,depth+1);
      if(def.pythonModule==="comfy_extras.nodes_logic"&&node.class_type==="ComfySwitchNode"){
        const condition=resolve(node.inputs.switch,depth+1);if(typeof condition!=="boolean")return null;return resolve(node.inputs[condition?"on_true":"on_false"],depth+1);
      }
      if(def.pythonModule==="comfy_extras.nodes_preview_any"&&node.class_type==="PreviewAny"){
        const source=resolve(node.inputs.source,depth+1);return typeof source==="string"?source:null;
      }
      return null;
    }finally{seen.delete(id);}
  };
  return resolve(value);
}
