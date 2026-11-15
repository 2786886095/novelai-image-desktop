import packs from "./multilingual-tag-packs.json";
export const TAG_PACK_MANIFEST=packs;
export const TAG_PACK_LANGUAGES=["zh-CN","zh-TW","ja-JP","ko-KR"] as const;
export type TagPackLanguage=typeof TAG_PACK_LANGUAGES[number];
export const TAG_PACK_NAMES:Record<TagPackLanguage,string>={"zh-CN":"简体中文","zh-TW":"繁體中文","ja-JP":"日本語","ko-KR":"한국어"};
export function tagPackLanguage(value:unknown):TagPackLanguage|null{
 return typeof value==="string"&&(TAG_PACK_LANGUAGES as readonly string[]).includes(value)?value as TagPackLanguage:null;
}
export type TagPackStatus={active:TagPackLanguage|null;installed:TagPackLanguage[];updatedAt:string};
