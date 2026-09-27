import tables from './store-locales.json';
import type {AppLanguage} from './types';
export const STORE_LOCALES=tables as Record<AppLanguage,Record<string,string>>;
const locale=(value:string|undefined):AppLanguage=>value && value in tables ? value as AppLanguage : 'zh-CN';
export function localizedStoreText(language:string|undefined,key:string){return STORE_LOCALES[locale(language)][key] ?? STORE_LOCALES['en-US'][key] ?? key;}
const exact=new Map<string,string>();
const patterns:Array<{key:string;names:string[];regex:RegExp}>=[];
for(const row of Object.values(STORE_LOCALES))for(const [key,text] of Object.entries(row)){
 if(!/\{\w+\}/.test(text)){exact.set(text,key);continue;}
 const names:string[]=[];
 const regex=new RegExp('^'+text.split(/(\{\w+\})/).map(part=>{
  if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '([\\s\\S]*?)';}
  return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 }).join('')+'$');patterns.push({key,names,regex});
}
/** Re-render an already emitted application status in the current language. Never translate user fields. */
export function localizeStoreMessage(language:string|undefined,message:string,depth=0):string {
 if(message.length>4096)return message; // Long upstream payloads are handled by the existing error compactor.
 const key=exact.get(message);if(key)return localizedStoreText(language,key);
 if(depth>3)return message;
 for(const pattern of patterns){const match=message.match(pattern.regex);if(!match)continue;
  const params=Object.fromEntries(pattern.names.map((name,i)=>[name,match[i+1]]));
  return localizedStoreText(language,pattern.key).replace(/\{(\w+)\}/g,(_,name:string)=>['spent','action','message','detail','error'].includes(name)?localizeStoreMessage(language,params[name]??'',depth+1):params[name]??'');
 }
 return message;
}
