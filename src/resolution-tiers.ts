import {NAI_MAX_PIXEL_AREA} from './nai-dimensions';

// Product tiers use the 1024² normal canvas as 1 MP; show actual decimal MP too.
export const RESOLUTION_TIERS = [0.4, 1, 1.5, 2, 3] as const;
export const RESOLUTION_RATIOS = ['1:1','2:3','3:2','3:4','4:3','9:16','16:9','1:2','2:1','1:3','3:1','21:9','9:21'] as const;
export function resolutionForTier(tier:number,ratio:string) {
  if(!RESOLUTION_TIERS.includes(tier as typeof RESOLUTION_TIERS[number])) throw Error('Unknown resolution tier');
  const parts=ratio.split(':').map(Number), aspect=parts[0]/parts[1];
  if(parts.length!==2||!Number.isFinite(aspect)||aspect<1/768||aspect>768) throw Error('Invalid aspect ratio');
  const cap=Math.min(NAI_MAX_PIXEL_AREA,tier===0.4?409600:Math.round(tier*1024*1024));
  let best={width:64,height:64}, score=Infinity;
  // Search the 64px lattice instead of independently rounding past the pixel cap.
  for(let width=64;width<=cap/64;width+=64) {
    const ideal=width/aspect;
    for(const height of [Math.floor(ideal/64)*64,Math.ceil(ideal/64)*64,Math.floor(cap/width/64)*64,Math.floor(ideal*Math.exp(.079)/64)*64,Math.ceil(ideal*Math.exp(-.079)/64)*64]) {
      if(height<64||width*height>cap)continue;
      const ratioError=Math.abs(Math.log((width/height)/aspect));
      const usable=width*height>=cap*.80&&ratioError<.08;
      const error=(usable?0:100)+4*ratioError+Math.abs(Math.log(width*height/cap));
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
/** Invalid/unfinished numeric input must remain editable, not crash a preset click. */
export function resolutionPickerRatio(width:number,height:number) {
  const ratio=nearestResolutionRatio(width,height);
  if(ratio!=='custom')return ratio;
  const aspect=width/height;
  return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&aspect>=1/768&&aspect<=768?`${width}:${height}`:'1:1';
}
/** A tool can restrict the shared picker without restricting generation globally. */
export function resolutionSizeAllowed(size:{width:number;height:number},maxDimension?:number) {
  return [size.width,size.height].every(v=>Number.isInteger(v)&&v>=64&&v%64===0&&(maxDimension===undefined||v<=maxDimension));
}
export function resolutionLabels(language:unknown) {
  const labels:Record<string,{tier:string;ratio:string;custom:string;tiers:string[];normal:string;large:string;note:string;expand:string;collapse:string;resize:string}>={
    'zh-CN':{tier:'总分辨率',ratio:'画面比例',custom:'自定义',tiers:['小图','普通','大图','超大图','最大'],normal:'免费尺寸范围 · 是否免费仍取决于套餐与参数',large:'大图 · 请查看生成费用估算',note:'档位以 1024² 为基准；尺寸按 64 像素对齐，下面显示实际像素。',expand:'展开提示词工具栏',collapse:'收起提示词工具栏',resize:'拖动调整提示词高度；双击或 Home 恢复；方向键微调'},
  };return labels[String(language)]??labels['zh-CN'];
}

