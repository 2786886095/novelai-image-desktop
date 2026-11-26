import packs from "./multilingual-tag-packs.json";
export const TAG_PACK_MANIFEST=packs;
export const TAG_PACK_LANGUAGES=["zh-CN","zh-TW","ja-JP","ko-KR"] as const;
export type TagPackLanguage=typeof TAG_PACK_LANGUAGES[number];
export const TAG_PACK_NAMES:Record<TagPackLanguage,string>={"zh-CN":"简体中文","zh-TW":"繁體中文","ja-JP":"日本語","ko-KR":"한국어"};
export function tagPackLanguage(value:unknown):TagPackLanguage|null{
 return typeof value==="string"&&(TAG_PACK_LANGUAGES as readonly string[]).includes(value)?value as TagPackLanguage:null;
}
export type TagPackStatus={active:TagPackLanguage|null;installed:TagPackLanguage[];updatedAt:string;preferred?:TagPackLanguage|null;outdated?:Partial<Record<TagPackLanguage,string>>};
export type TagPackPage={rows:import("../src/types").TagSuggestion[];total:number;page:number};
export const TAG_BROWSE_GROUPS=["all",...Array.from({length:17},(_,i)=>String(i).padStart(2,"0"))];
export const TAG_BROWSE_PAGE_SIZE=24;
export const TAG_PACK_SORTS=["relevance","popular","alphabetical"] as const;
export type TagPackSort=typeof TAG_PACK_SORTS[number];
export function tagPackSort(value:unknown):TagPackSort {
 return value==="popular"||value==="alphabetical"?value:"relevance";
}

export const packUpdateLabel=(lang:unknown)=>({"zh-CN":"更新词库","zh-TW":"更新詞庫","en-US":"Update dictionary","ja-JP":"辞書を更新","ko-KR":"사전 업데이트"}[String(lang)]??"更新词库");
