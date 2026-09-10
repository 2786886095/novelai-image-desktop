import type { ArtistPoolTotal } from "../artist-lab";
import type { AppLanguage } from "../types";

const TEXT = {
 "zh-CN": {title:"Danbooru 画师候选库",description:"按作品数排行，仅刷新所选数量的画师。",count:"本次刷新数量",refresh:"刷新所选画师",warning:"一次加载较多画师可能短暂卡顿；默认 1000 名，可按需增加。",total:"全站有效画师 Tag 总量",checking:"统计中…",unknown:"暂未获取（不影响已加载候选）",atLeast:"至少",time:"统计于",pending:"修改数量后，点击刷新生效。",done:"本次数量刷新完成"},
 "zh-TW": {title:"Danbooru 畫師候選庫",description:"按作品數排行，僅重新整理所選數量的畫師。",count:"本次重新整理數量",refresh:"重新整理所選畫師",warning:"一次載入較多畫師可能短暫卡頓；預設 1000 名，可按需增加。",total:"全站有效畫師 Tag 總量",checking:"統計中…",unknown:"暫未取得（不影響已載入候選）",atLeast:"至少",time:"統計於",pending:"修改數量後，點擊重新整理生效。",done:"本次数量重新整理完成"},
 "en-US": {title:"Danbooru artist pool",description:"Fetch only the selected number of top artists, ranked by post count.",count:"Artists to refresh",refresh:"Refresh selected artists",warning:"Loading many artists at once may briefly freeze the UI. Default: 1,000; increase as needed.",total:"Total active artist tags",checking:"Counting…",unknown:"Unavailable (loaded candidates remain usable)",atLeast:"At least",time:"Counted at",pending:"After changing the count, click refresh to apply.",done:"Selected artist refresh complete"},
 "ja-JP": {title:"Danbooru 絵師候補",description:"投稿数順で、指定した人数だけを更新します。",count:"更新する人数",refresh:"指定した絵師を更新",warning:"大量の絵師を一度に読み込むと一時的に画面が停止する場合があります。初期値は1000名です。",total:"有効な絵師タグの総数",checking:"集計中…",unknown:"未取得（読み込み済み候補は利用可能）",atLeast:"最低",time:"集計日時",pending:"人数の変更後、更新ボタンで反映します。",done:"指定人数の更新完了"},
 "ko-KR": {title:"Danbooru 작가 후보",description:"게시물 수순으로 선택한 수만큼만 갱신합니다.",count:"갱신할 작가 수",refresh:"선택한 작가 갱신",warning:"많은 작가를 한 번에 불러오면 잠시 멈출 수 있습니다. 기본 1,000명이며 필요에 따라 늘리세요.",total:"활성 작가 태그 총수",checking:"집계 중…",unknown:"미확인 (불러온 후보는 사용 가능)",atLeast:"최소",time:"집계 시각",pending:"수를 변경한 후 갱신 버튼을 눌러 적용하세요.",done:"선택한 수만큼 갱신 완료"},
} satisfies Record<AppLanguage,Record<string,string>>;
export const artistPoolSelectionText=(language:AppLanguage)=>TEXT[language];
export function ArtistPoolTotalStatus({value,loading,language}:{value:ArtistPoolTotal|null;loading:boolean;language:AppLanguage}){
 const t=TEXT[language];
 return <div className="artist-pool-total" role="status" aria-live="polite">
  <span>{t.total}：{value?.total!=null ? `${value.lowerBound?t.atLeast+" ":""}${value.total.toLocaleString(language)}` : loading?t.checking:t.unknown}</span>
  {value?.checkedAt&&<small>{t.time} {new Date(value.checkedAt).toLocaleString(language)}{loading?` · ${t.checking}`:""}</small>}
 </div>;
}
