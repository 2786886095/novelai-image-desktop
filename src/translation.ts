export const TRANSLATION_LANGUAGES = [
 {value:'zh-CN',label:'简体中文',name:'Simplified Chinese',baidu:'zh'},
 {value:'zh-TW',label:'繁體中文',name:'Traditional Chinese',baidu:'cht'},
 {value:'en',label:'English',name:'English',baidu:'en'},
 {value:'ja',label:'日本語',name:'Japanese',baidu:'jp'},
 {value:'ko',label:'한국어',name:'Korean',baidu:'kor'},
 {value:'fr',label:'Français',name:'French',baidu:'fra'},
 {value:'de',label:'Deutsch',name:'German',baidu:'de'},
 {value:'es',label:'Español',name:'Spanish',baidu:'spa'},
 {value:'ru',label:'Русский',name:'Russian',baidu:'ru'},
 {value:'pt',label:'Português',name:'Portuguese',baidu:'pt'},
 {value:'it',label:'Italiano',name:'Italian',baidu:'it'},
] as const;
const aliases:Record<string,string>={'zh':'zh-CN','zh-cn':'zh-CN','zh-tw':'zh-TW','en-us':'en','ja-jp':'ja','ko-kr':'ko','jp':'ja','kor':'ko','cht':'zh-TW','fra':'fr','spa':'es'};
export function normalizeTranslationPreference(value:unknown):string {
 if(typeof value!=='string'||!value.trim()||value==='system')return 'system';
 const code=aliases[value.trim().toLowerCase()]??value.trim().toLowerCase();
 return TRANSLATION_LANGUAGES.some(l=>l.value===code)?code:'system';
}
/** "system" follows the software language, which is always Simplified Chinese. */
export function resolveTranslationTarget(preference:unknown):string {
 const target=normalizeTranslationPreference(preference);
 return target==='system'?'zh-CN':target;
}
export function baiduTranslationTarget(target:string):string {
 return TRANSLATION_LANGUAGES.find(l=>l.value===resolveTranslationTarget(target))!.baidu;
}
export function translationLanguageName(target:string):string {
 return TRANSLATION_LANGUAGES.find(l=>l.value===resolveTranslationTarget(target))!.name;
}
export function normalizeTranslationSource(value:unknown):string {
 const result=normalizeTranslationPreference(value);
 return result==='system'?'auto':result;
}
export function parseTranslationReply(value:string,sourceLanguage:unknown='auto'):{text:string;sourceLanguage?:string} {
 let text=value.trim(),source=normalizeTranslationSource(sourceLanguage);
 try {const json=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,''));if(json&&typeof json.text==='string'){text=json.text.trim();if(source==='auto')source=normalizeTranslationSource(json.sourceLanguage);}}catch {/* Older AI providers may return plain text. */}
 return {text,...(source==='auto'?{}:{sourceLanguage:source})};
}
export function translationEditorText(_language:unknown) {
 const row=['源语言','自动检测','互换语言','实时翻译','输入停止后自动翻译','请先选择源语言或完成自动检测'];
 const keys=['sourceLanguage','auto','swap','live','liveHint','selectSource'] as const;
 return Object.fromEntries(keys.map((k,i)=>[k,row[i]])) as Record<typeof keys[number],string>;
}
const previewRow=['翻译预览','目标语言','跟随软件语言','原文','译文','翻译','重新翻译','正在翻译…','应用译文','复制译文','取消','翻译失败，请重试。','原文已变化，请重新翻译后应用。','已复制译文','复制失败，请重试。','预览不会修改原文；仅点击应用后替换。'];
export function translationText(_language:unknown) {
 const keys=['title','target','system','source','result','run','retry','busy','apply','copy','cancel','failed','stale','copied','copyFailed','hint'] as const;
 return Object.fromEntries(keys.map((key,i)=>[key,previewRow[i]])) as Record<typeof keys[number],string>;
}
