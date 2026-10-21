import type { ComfyFamilyGuess, ComfyFamilyId } from "./contract";
import type { ComfyApiPrompt } from "./api-prompt";

export const COMFY_FAMILIES: ReadonlyArray<{id:ComfyFamilyId;name:string}> = [
  {id:"moss-image",name:"MOSS-Image"},{id:"anima",name:"Anima"},{id:"krea2",name:"Krea 2"},
];
export interface ComfyVerifiedTemplate { name:string; sha256:string; family:ComfyFamilyId; apiSha256:string; comfyVersion:string; frontendVersion:string }
/** Never populated by filename inference, protocol fixtures or a static mapping. */
export const VERIFIED_TEMPLATES: readonly ComfyVerifiedTemplate[] = [];
export function verifiedTemplate(name: string, sha256: string): ComfyVerifiedTemplate | null { return VERIFIED_TEMPLATES.find((item) => item.name === name && item.sha256 === sha256) ?? null; }
export function guessFamily(prompt: ComfyApiPrompt, templateName?: string | null): ComfyFamilyGuess | null {
  const evidence: Partial<Record<ComfyFamilyId,string[]>> = {};
  const add = (family:ComfyFamilyId,item:string):void => { (evidence[family] ??= []).push(item); };
  let encoder: ComfyFamilyId | null = null;
  for (const [id,node] of Object.entries(prompt)) {
    if (/CLIPLoader/.test(node.class_type)) {
      if (node.inputs.type === "moss_image") { add("moss-image",`${id}.type=moss_image`); encoder = "moss-image"; }
      if (node.inputs.type === "krea2") { add("krea2",`${id}.type=krea2`); encoder = "krea2"; }
    }
    for (const [input,value] of Object.entries(node.inputs)) if (typeof value === "string" && /(?:name|model|checkpoint)/.test(input)) {
      if (/moss[\s_-]*image/i.test(value)) add("moss-image",`${id}.${input}=${value}`);
      if (/(?:^|[\\/\s_-])anima(?:[\\/\s_.-]|\d|$)/i.test(value) && !/animatediff/i.test(value)) add("anima",`${id}.${input}=${value}`);
      if (/krea[\s_-]*2/i.test(value)) add("krea2",`${id}.${input}=${value}`);
    }
  }
  // Contradictory loader files are not resolved by giving a stronger-looking
  // template label priority. A family label is never compatibility approval.
  const matches = Object.keys(evidence) as ComfyFamilyId[];
  if (matches.length !== 1) return null;
  const family = matches[0], items = evidence[family]!;
  const lower = items.join(" ").toLowerCase();
  const variant = family === "anima" ? /turbo/.test(lower) ? "turbo" : /preview/.test(lower) ? "preview" : /base/.test(lower) ? "base" : null
    : family === "krea2" ? /turbo/.test(lower) ? "turbo" : /raw/.test(lower) ? "raw" : null : /sft/.test(lower) ? "sft" : null;
  return {family,variant,confidence:encoder === family ? "encoder-type" : "model-file",evidence:[...items,...(templateName ? [`Template filename (unverified label only): ${templateName}`] : [])]};
}
