export type InpaintRegion={x:number;y:number;width:number;height:number};
/** Keep the crop in original pixel coordinates; only its request is enlarged. */
export function focusedInpaintPlan(region:InpaintRegion,width:number,height:number) {
 if(!region||![width,height,region.x,region.y,region.width,region.height].every(Number.isFinite)||width<1||height<1||region.width<8||region.height<8)throw Error('请选择至少 8 × 8 像素的重绘区域。');
 const x=Math.max(0,Math.floor(region.x)),y=Math.max(0,Math.floor(region.y));
 const w=Math.min(width-x,Math.ceil(region.width)),h=Math.min(height-y,Math.ceil(region.height));
 if(w<8||h<8)throw Error('重绘区域超出原图。');
 const ratio=w/h;let best={width:1024,height:1024},score=Infinity;
 for(let tw=64;tw<=1600;tw+=64)for(let th=64;th<=1600;th+=64){const area=tw*th;if(area>1048576)continue;const value=5*Math.abs(Math.log(tw/th/ratio))+Math.abs(Math.log(area/1048576));if(value<score){score=value;best={width:tw,height:th};}}
 return {region:{x,y,width:w,height:h},size:best};
}
