import {NAI_MAX_PIXEL_AREA} from './nai-dimensions';

// Product tiers use the 1024² normal canvas as 1 MP; show actual decimal MP too.
export const RESOLUTION_TIERS = [0.4, 1, 1.5, 2, 3] as const;
export const RESOLUTION_RATIOS = ['1:1','2:3','3:2','3:4','4:3','9:16','16:9'] as const;
export function resolutionForTier(tier:number,ratio:string) {
  if(!RESOLUTION_TIERS.includes(tier as typeof RESOLUTION_TIERS[number])) throw Error('Unknown resolution tier');
  const parts=ratio.split(':').map(Number), aspect=parts[0]/parts[1];
  if(parts.length!==2||!Number.isFinite(aspect)||aspect<1/768||aspect>768) throw Error('Invalid aspect ratio');
  const cap=Math.min(NAI_MAX_PIXEL_AREA,tier===0.4?409600:Math.round(tier*1024*1024));
  let best={width:64,height:64}, score=Infinity;
  // Search the 64px lattice instead of independently rounding past the pixel cap.
  for(let width=64;width<=cap/64;width+=64) {
    const ideal=width/aspect;
    for(const height of [Math.floor(ideal/64)*64,Math.ceil(ideal/64)*64]) {
      if(height<64||width*height>cap)continue;
      const error=4*Math.abs(Math.log((width/height)/aspect))+Math.abs(Math.log(width*height/cap));
      if(error<score){score=error;best={width,height};}
    }
  }
  return best;
}
export function nearestResolutionRatio(width:number,height:number) {
  const exact=RESOLUTION_RATIOS.find(r=>{const [w,h]=r.split(':').map(Number);return Math.abs(Math.log((width/height)/(w/h)))<0.045;});
  return exact??'custom';
}
export function nearestResolutionTier(width:number,height:number) {
  const pixels=width*height;
  return RESOLUTION_TIERS.find(t=>{const cap=t===0.4?409600:t*1024*1024;return pixels<=cap&&pixels>=cap*0.80;})??'custom';
}
export function resolutionLabels(language:unknown) {
  const labels:Record<string,{tier:string;ratio:string;custom:string;tiers:string[];normal:string;large:string;note:string;expand:string;collapse:string;resize:string}>={
    'zh-CN':{tier:'总分辨率',ratio:'画面比例',custom:'自定义',tiers:['小图','普通','大图','超大图','最大'],normal:'免费尺寸范围 · 是否免费仍取决于套餐与参数',large:'大图 · 请查看生成费用估算',note:'档位以 1024² 为基准；尺寸按 64 像素对齐，下面显示实际像素。',expand:'展开提示词工具栏',collapse:'收起提示词工具栏',resize:'拖动调整提示词高度；双击或 Home 恢复；方向键微调'},
    'zh-TW':{tier:'總解析度',ratio:'畫面比例',custom:'自訂',tiers:['小圖','一般','大圖','超大圖','最大'],normal:'免費尺寸範圍 · 是否免費仍取決於方案與參數',large:'大圖 · 請查看生成費用估算',note:'級距以 1024² 為基準；尺寸對齊 64 像素，下方顯示實際像素。',expand:'展開提示詞工具列',collapse:'收起提示詞工具列',resize:'拖曳調整提示詞高度；按兩下或 Home 還原；方向鍵微調'},
    'en-US':{tier:'Pixel tier',ratio:'Aspect ratio',custom:'Custom',tiers:['Small','Normal','Large','Extra large','Maximum'],normal:'Free-size range · eligibility still depends on plan and settings',large:'Large image · check the generation cost estimate',note:'Tiers use 1024² pixels; dimensions align to 64px. Actual pixels shown below.',expand:'Expand prompt tools',collapse:'Collapse prompt tools',resize:'Drag to resize; double-click or Home to reset; arrow keys to adjust'},
    'ja-JP':{tier:'画素数',ratio:'縦横比',custom:'カスタム',tiers:['小','通常','大','特大','最大'],normal:'無料サイズ範囲 · プランと設定によって料金が変わります',large:'大きい画像 · 生成料金の見積もりを確認',note:'1024² 基準、64px 単位で調整。実際の画素数は下記。',expand:'ツールを展開',collapse:'ツールを閉じる',resize:'ドラッグで高さ調整、ダブルクリックまたは Home でリセット、矢印キーで調整'},
    'ko-KR':{tier:'픽셀 크기',ratio:'화면 비율',custom:'사용자 지정',tiers:['작게','보통','크게','매우 크게','최대'],normal:'무료 크기 범위 · 실제 비용은 요금제와 설정에 따라 다름',large:'큰 이미지 · 생성 비용 예상 확인',note:'1024² 기준, 64px 단위로 조정. 아래에 실제 픽셀 표시.',expand:'프롬프트 도구 펼치기',collapse:'프롬프트 도구 접기',resize:'드래그로 높이 조절; 두 번 클릭 또는 Home 초기화; 방향키 조절'},
  };return labels[String(language)]??labels['en-US'];
}

