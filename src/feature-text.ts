import entries from './feature-locales.json';
export const FEATURE_LANGUAGES=['zh-CN','zh-TW','en-US','ja-JP','ko-KR'] as const;
const catalog=entries as Record<string,string[]>;
const patterns=Object.keys(catalog).filter(key=>key.includes('{')).map(key=>{
  const names:string[]=[];
  const pattern=key.split(/(\{\w+\})/).map(part=>{
    if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '(.+?)';}
    return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }).join('');
  return {key,names,regex:new RegExp('^'+pattern+'$')};
});
/** Translate only known application messages. Paths, prompts and upstream diagnostics stay intact. */
export function featureText(language:string|undefined,key:string,params:Record<string,string|number>={}):string {
  const index=FEATURE_LANGUAGES.indexOf(language as typeof FEATURE_LANGUAGES[number]);
  let row=catalog[key], values=params;
  if(!row && key.startsWith('Error: '))return 'Error: '+featureText(language,key.slice(7),params);
  if(!row){for(const pattern of patterns){const match=key.match(pattern.regex);if(match){row=catalog[pattern.key];values=Object.fromEntries(pattern.names.map((name,i)=>[name,match[i+1]]));break;}}}
  return (row?.[index<0?0:index] ?? key).replace(/\{(\w+)\}/g,(token,name)=>values[name]===undefined?token:String(values[name]));
}
/** Resolve an already translated dialog label when the locale changes while it is open. */
export function featureKey(text:string){return Object.keys(catalog).find(key=>catalog[key].includes(text)) ?? text;}
