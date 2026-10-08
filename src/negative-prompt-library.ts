import builtins from '../shared/negative-prompt-presets.json';
export interface NegativePromptPreset {id:string;name:string;prompt:string;createdAt:string}
export const NEGATIVE_BUILTINS:readonly NegativePromptPreset[]=builtins;
function valid(p:unknown):p is NegativePromptPreset {if(!p||typeof p!=='object')return false;const v=p as NegativePromptPreset;return typeof v.id==='string'&&!!v.id&&v.id.length<=100&&typeof v.name==='string'&&!!v.name.trim()&&v.name.length<=100&&typeof v.prompt==='string'&&!!v.prompt.trim()&&v.prompt.length<=100000&&typeof v.createdAt==='string';}
export function normalizeNegativePromptPresets(value:unknown):NegativePromptPreset[]{
 if(value===undefined||value===null)return NEGATIVE_BUILTINS.map(p=>({...p}));
 if(!Array.isArray(value))return NEGATIVE_BUILTINS.map(p=>({...p}));
 const ids=new Set<string>();return value.filter(valid).filter(p=>{if(ids.has(p.id))return false;ids.add(p.id);return true;}).slice(0,2000).map(({id,name,prompt,createdAt})=>({id,name,prompt,createdAt}));
}
export function parseNegativeLibrary(text:string):NegativePromptPreset[]{
 if(text.length>5000000)throw Error('Library file exceeds 5 MB');
 const doc=JSON.parse(text.replace(/^\uFEFF/,''));
 if(doc?.identifier!=='langbai-negative-prompt-library'||doc.version!==1||!Array.isArray(doc.presets)||doc.presets.length>2000||doc.presets.some((p:unknown)=>!valid(p)))throw Error('Invalid negative prompt library');
 const entries=normalizeNegativePromptPresets(doc.presets);if(entries.length!==doc.presets.length)throw Error('Duplicate preset IDs');return entries;
}
export function exportNegativeLibrary(presets:NegativePromptPreset[]){return JSON.stringify({identifier:'langbai-negative-prompt-library',version:1,presets:normalizeNegativePromptPresets(presets)},null,2);}
/** Preserve literal tag weights, repetitions and line breaks. Do not normalize prompts. */
export function applyNegativePreset(current:string,prompt:string,mode:'replace'|'append') {return mode==='replace'||!current.trim()?prompt:!prompt.trim()?current:current+(current.trimEnd().endsWith(',')?' ':', ')+prompt;}
export function mergeNegativeLibrary(current:NegativePromptPreset[],imported:NegativePromptPreset[],newId:()=>string):NegativePromptPreset[]{
 const next=current.map(p=>({...p}));for(const p of imported){if(next.some(e=>e.name===p.name&&e.prompt===p.prompt))continue;next.push({...p,id:next.some(e=>e.id===p.id)?newId():p.id});}if(next.length>2000)throw Error('Maximum 2000 presets');return next;
}
const labels:Record<string,string[]>={
 'zh-CN':['负面提示词库','选择后预览，再替换或追加；不会改动正面提示词。','搜索名称或提示词','保存当前','新建','编辑','删除','导入','导出','替换','追加','关闭','保存','取消','名称','负面提示词','暂无预设','已保存','已应用负面提示词','确认删除此预设？'],
 'zh-TW':['負面提示詞庫','選擇後預覽，再取代或追加；不會改動正面提示詞。','搜尋名稱或提示詞','儲存目前','新增','編輯','刪除','匯入','匯出','取代','追加','關閉','儲存','取消','名稱','負面提示詞','尚無預設','已儲存','已套用負面提示詞','確認刪除此預設？'],
 'ja-JP':['ネガティブライブラリ','プレビュー後に置換または追加。正面プロンプトは変更しません。','名前・プロンプトを検索','現在を保存','新規','編集','削除','読込','書出し','置換','追加','閉じる','保存','キャンセル','名前','ネガティブプロンプト','プリセットなし','保存しました','適用しました','このプリセットを削除しますか？'],
 'ko-KR':['부정 프롬프트 라이브러리','미리 보기 후 교체 또는 추가합니다. 긍정 프롬프트는 변경하지 않습니다.','이름 또는 프롬프트 검색','현재 저장','새로 만들기','편집','삭제','가져오기','내보내기','교체','추가','닫기','저장','취소','이름','부정 프롬프트','프리셋 없음','저장됨','적용됨','이 프리셋을 삭제할까요?'],
 'en-US':['Negative prompt library','Preview, then replace or append. Positive prompts are never changed.','Search names or prompts','Save current','New','Edit','Delete','Import','Export','Replace','Append','Close','Save','Cancel','Name','Negative prompt','No presets','Saved','Negative prompt applied','Delete this preset?']};
export function negativeLibraryText(language:unknown){return labels[String(language)]??labels['en-US'];}
