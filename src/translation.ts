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
export function resolveTranslationTarget(preference:unknown,appLanguage:unknown):string {
 const target=normalizeTranslationPreference(preference);
 if(target!=='system')return target;
 const language=normalizeTranslationPreference(appLanguage);
 return language==='system'?'zh-CN':language;
}
export function baiduTranslationTarget(target:string):string {
 return TRANSLATION_LANGUAGES.find(l=>l.value===resolveTranslationTarget(target,'zh-CN'))!.baidu;
}
export function translationLanguageName(target:string):string {
 return TRANSLATION_LANGUAGES.find(l=>l.value===resolveTranslationTarget(target,'zh-CN'))!.name;
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
export function translationEditorText(language:unknown) {
 const key=resolveTranslationTarget('system',language);
 const row=({
  'zh-CN':['源语言','自动检测','互换语言','实时翻译','输入停止后自动翻译','请先选择源语言或完成自动检测'],
  'zh-TW':['來源語言','自動偵測','互換語言','即時翻譯','停止輸入後自動翻譯','請先選擇來源語言或完成自動偵測'],
  en:['Source language','Detect language','Swap languages','Live translation','Translate after typing pauses','Choose a source language or detect it first'],
  ja:['原文の言語','自動検出','言語を入れ替え','リアルタイム翻訳','入力が止まると自動翻訳','原文の言語を選ぶか自動検出してください'],
  ko:['원문 언어','자동 감지','언어 바꾸기','실시간 번역','입력을 멈추면 자동 번역','원문 언어를 선택하거나 먼저 감지하세요'],
 } as Record<string,string[]>)[key]??['Source language','Detect language','Swap languages','Live translation','Translate after typing pauses','Choose a source language or detect it first'];
 const keys=['sourceLanguage','auto','swap','live','liveHint','selectSource'] as const;
 return Object.fromEntries(keys.map((k,i)=>[k,row[i]])) as Record<typeof keys[number],string>;
}
const rows:Record<string,readonly string[]>={
 'zh-CN':['翻译预览','目标语言','跟随软件语言','原文','译文','翻译','重新翻译','正在翻译…','应用译文','复制译文','取消','翻译失败，请重试。','原文已变化，请重新翻译后应用。','已复制译文','复制失败，请重试。','预览不会修改原文；仅点击应用后替换。'],
 'zh-TW':['翻譯預覽','目標語言','跟隨軟體語言','原文','譯文','翻譯','重新翻譯','正在翻譯…','套用譯文','複製譯文','取消','翻譯失敗，請重試。','原文已變更，請重新翻譯後套用。','已複製譯文','複製失敗，請重試。','預覽不會修改原文；僅點擊套用後替換。'],
 'en':['Translation preview','Target language','Follow app language','Original','Translation','Translate','Translate again','Translating…','Apply translation','Copy translation','Cancel','Translation failed. Please retry.','The original changed. Translate again before applying.','Translation copied','Copy failed. Please retry.','Preview does not change the original. Apply to replace it.'],
 'ja':['翻訳プレビュー','翻訳先の言語','アプリの言語に合わせる','原文','訳文','翻訳','再翻訳','翻訳中…','訳文を適用','訳文をコピー','キャンセル','翻訳に失敗しました。再試行してください。','原文が変更されました。再翻訳してから適用してください。','訳文をコピーしました','コピーに失敗しました。','プレビューでは原文は変わりません。適用すると置き換えます。'],
 'ko':['번역 미리보기','대상 언어','앱 언어 따르기','원문','번역문','번역','다시 번역','번역 중…','번역 적용','번역 복사','취소','번역 실패. 다시 시도하세요.','원문이 변경되었습니다. 다시 번역한 후 적용하세요.','번역 복사됨','복사 실패. 다시 시도하세요.','미리보기는 원문을 변경하지 않습니다. 적용하면 교체됩니다.'],
};
export function translationText(language:unknown) {
 const r=rows[resolveTranslationTarget('system',language)]??rows.en;
 const keys=['title','target','system','source','result','run','retry','busy','apply','copy','cancel','failed','stale','copied','copyFailed','hint'] as const;
 return Object.fromEntries(keys.map((key,i)=>[key,r[i]])) as Record<typeof keys[number],string>;
}
