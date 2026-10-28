import type { ArtistPoolTotal } from "../artist-lab";
import type { AppLanguage } from "../types";

const TEXT = {
 "zh-CN": {title:"Danbooru 画师候选库",description:"按作品数排行，仅刷新所选数量的画师。",count:"本次刷新数量",refresh:"刷新所选画师",warning:"一次加载较多画师可能短暂卡顿；默认 1000 名，可按需增加。",total:"全站有效画师 Tag 总量",checking:"统计中…",unknown:"暂未获取（不影响已加载候选）",atLeast:"至少",time:"统计于",pending:"修改数量后，点击刷新生效。",done:"本次数量刷新完成"},
} satisfies Record<AppLanguage,Record<string,string>>;
export const artistPoolSelectionText=(language:AppLanguage)=>TEXT[language];
export function ArtistPoolTotalStatus({value,loading,language}:{value:ArtistPoolTotal|null;loading:boolean;language:AppLanguage}){
 const t=TEXT[language];
 return <div className="artist-pool-total" role="status" aria-live="polite">
  <span>{t.total}：{value?.total!=null ? `${value.lowerBound?t.atLeast+" ":""}${value.total.toLocaleString(language)}` : loading?t.checking:t.unknown}</span>
  {value?.checkedAt&&<small>{t.time} {new Date(value.checkedAt).toLocaleString(language)}{loading?` · ${t.checking}`:""}</small>}
 </div>;
}
