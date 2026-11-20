import type {PositivePromptPreset} from "./types";
import {uniquePositivePromptPresetName} from "./positive-prompt-presets";
// Native implementation of the import conventions proposed by Yuemil in PR #93.
export interface BulkRole { prompt: string; negativePrompt?: string; name?: string }
export type BulkError = "empty"|"format"|"limit"|"tooLong"|"sequence";
function reject(code:BulkError):never { throw new Error(code) }
function validate(rows:unknown, max:number):BulkRole[] {
  if(!Array.isArray(rows)||!rows.length)reject("empty");
  if(rows.length>max)reject("limit");
  return rows.map(r=>{
    if(!r||typeof r!=="object"||Array.isArray(r)||typeof r.prompt!=="string"||
       Object.keys(r).some(k=>!["name","prompt","negativePrompt"].includes(k))||
       (r.name!==undefined&&(typeof r.name!=="string"||r.name.length>64))||
       (r.negativePrompt!==undefined&&typeof r.negativePrompt!=="string"))reject("format");
    return {prompt:r.prompt,...(r.name===undefined?{}:{name:r.name}),...(r.negativePrompt===undefined?{}:{negativePrompt:r.negativePrompt})};
  });
}
const digits="零一二三四五六七八九";
function number(s:string){if(/^\d+$/.test(s))return Number(s);const parts=s.split("十");return parts.length===2?(parts[0]?digits.indexOf(parts[0]):1)*10+(parts[1]?digits.indexOf(parts[1]):0):digits.indexOf(s);}
const role=/^\s*(?:【|\[)?(?:角色|人物|character|chara|キャラクター|캐릭터)\s*([0-9一二三四五六七八九十]+)\s*(?:】|\])?\s*[:：]?\s*(.*)$/i;
const neg=/^\s*(?:【|\[)?(?:负面|負面|负向|反向|negative)\s*([0-9一二三四五六七八九十]*)\s*(?:】|\])?\s*[:：]\s*(.*)$/i;
const pos=/^\s*(?:正向|正面|positive)\s*[:：]\s*/i;
export function parseBulkRoles(input:string,max:number):BulkRole[]{
  if(input.length>128000)reject("tooLong");
  let s=input.trim().replace(/\r\n?/g,"\n");if(!s)reject("empty");
  if(s.startsWith("~~~")||s.charCodeAt(0)===96){
    const fence=s.match(/^(?:\x60{3}|~{3})(?:json|text)?[ \t]*\n([\s\S]*?)\n(?:\x60{3}|~{3})$/i);if(!fence)reject("format");s=fence[1].trim();
  }
  if(s.startsWith("{")||(s.startsWith("[")&&!role.test(s.split("\n")[0]))){
    let obj;try{obj=JSON.parse(s)}catch{reject("format")}
    if(Array.isArray(obj))return validate(obj,max);
    if(!obj||typeof obj!=="object"||!Object.hasOwn(obj,"characters"))reject("format");
    return validate(obj.characters,max);
  }
  const lines=s.split("\n");if(!lines.some(l=>role.test(l))){
    if(lines.some(l=>neg.test(l)))reject("format");
    return validate(s.split(/\n[ \t]*\n+/).map(prompt=>({prompt:prompt.trim().replace(pos,"")})),max);
  }
  const groups=new Map<number,BulkRole>();let active=0,field:"prompt"|"negativePrompt"="prompt";
  for(const l of lines){
    const a=l.match(role),b=l.match(neg);
    if(a){active=number(a[1]);if(!Number.isInteger(active)||active<1||groups.has(active))reject("sequence");if(active>max)reject("limit");groups.set(active,{prompt:a[2].replace(pos,"")});field="prompt";}
    else if(b){if(b[1])active=number(b[1]);const row=groups.get(active);if(!row||row.negativePrompt!==undefined)reject("sequence");field="negativePrompt";row.negativePrompt=b[2];}
    else if(l.trim()){const row=groups.get(active);if(!row)reject("format");row[field]=[row[field],field==="prompt"?l.replace(pos,""):l].filter(Boolean).join("\n");}
  }
  return validate(Array.from({length:groups.size},(_,i)=>groups.get(i+1)??reject("sequence")),max);
}
export function formatBulkRoles(rows:readonly BulkRole[]){
  return JSON.stringify({characters:rows.map(({name,prompt,negativePrompt})=>({...(!name?{}:{name}),prompt,...(negativePrompt===undefined?{}:{negativePrompt})}))},null,2);
}
export function mergeBulkRoles<T extends BulkRole>(rows:BulkRole[],existing:T[]){
  return rows.map((r,i)=>({...{useCoords:false,x:0.5,y:0.5},...existing[i],...r}));
}
export function bulkAiInstructions(max:number, rules:string, current?:readonly BulkRole[]){
  return ["Return only valid JSON with this shape (the values below are examples):",
    '{"characters":[{"name":"Character 1","prompt":"silver hair, holding a book","negativePrompt":"hat"}]}',
    'Each object is one character. Keep separate positive and negative prompts, preserve meaningful quotes, line breaks and weights. Return 1–'+max+' characters in slot order. Do not add fields or markdown.',
    rules.trim(),current?.length?'Current characters to revise:\n'+formatBulkRoles(current):''].filter(Boolean).join("\n\n");
}

export function makeBulkPreset(existing:PositivePromptPreset[],name:string,rows:BulkRole[]):PositivePromptPreset{
  if(!name.trim()||name.trim().length>120)throw Error("Invalid preset name");
  return {id:crypto.randomUUID(),name:uniquePositivePromptPresetName(existing,name).value,createdAt:new Date().toISOString(),previewImages:[],
    prompt:rows.map(r=>r.prompt).join("\n"),captions:rows.map(r=>({...r,negativePrompt:r.negativePrompt??"",useCoords:false,x:.5,y:.5}))};
}
