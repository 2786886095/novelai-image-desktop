import {app} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {atomicWriteFileSync} from './store';
export type DetectiveModelVariant='full'|'light';
export type DetectiveModelProfile={python?:string;assets?:string;downloadDirectory?:string};
export type DetectiveConfig=DetectiveModelProfile & {
  directory?:string;pid?:number;image?:string;variant?:DetectiveModelVariant;
  selectedVariant?:DetectiveModelVariant;downloadVariant?:DetectiveModelVariant;
  models?:Partial<Record<DetectiveModelVariant,DetectiveModelProfile>>;
};
export const validDetectiveVariant=(v:unknown):v is DetectiveModelVariant=>v==='full'||v==='light';
export function detectiveProfile(c:DetectiveConfig,v:DetectiveModelVariant):DetectiveModelProfile {return {...c.models?.[v]};}
export function updateDetectiveProfile(c:DetectiveConfig,v:DetectiveModelVariant,p:DetectiveModelProfile):DetectiveConfig {
  return {...c,models:{...c.models,[v]:{...detectiveProfile(c,v),...p}}};
}
export function readDetectiveConfig():DetectiveConfig {
  let c:DetectiveConfig={};
  try{c=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'artist-detective-runtime.json'),'utf8'));}catch{/* new config */}
  if(!c || typeof c!=='object' || Array.isArray(c))c={};
  let detected:DetectiveModelVariant|undefined;
  if(c.assets)try{const a=JSON.parse(fs.readFileSync(path.join(c.assets,'inference.json'),'utf8')).architecture;detected=a==='PE-Spatial-G14-448'?'full':a==='PE-Spatial-L14-448'?'light':undefined;}catch{/* legacy config */}
  const active=detected ?? (validDetectiveVariant(c.variant)?c.variant:'full');
  if(!c.models?.[active] && (c.python||c.assets))c=updateDetectiveProfile(c,active,{python:c.python,assets:c.assets,downloadDirectory:c.downloadDirectory});
  return {...c,variant:active,selectedVariant:validDetectiveVariant(c.selectedVariant)?c.selectedVariant:validDetectiveVariant(c.downloadVariant)?c.downloadVariant:active};
}
export function saveDetectiveConfig(c:DetectiveConfig) {
  atomicWriteFileSync(path.join(app.getPath('userData'),'artist-detective-runtime.json'),JSON.stringify(c,null,2));
}
