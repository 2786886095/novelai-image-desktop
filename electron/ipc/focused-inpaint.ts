import {PNG} from 'pngjs';
import {focusedInpaintPlan,type InpaintRegion} from '../../src/focused-inpaint';
import {scaledInpaintRegion,validateInpaintSize,type InpaintSize} from '../../src/inpaint-size';

export function prepareFocusedInpaintInput(sourceBuffer:Buffer,maskBuffer:Buffer,region:InpaintRegion,target?:InpaintSize,resize?:(data:Buffer,w:number,h:number)=>Buffer) {
 let source:PNG=PNG.sync.read(sourceBuffer),mask:PNG=PNG.sync.read(maskBuffer);
 if(mask.width!==source.width||mask.height!==source.height)throw Error('蒙版与原图尺寸不一致，请重新绘制蒙版。');
 if(target) {
  validateInpaintSize(target);
  region=scaledInpaintRegion(region,source,target);
  if(source.width!==target.width||source.height!==target.height) {
   if(!resize)throw Error('重绘尺寸缩放不可用。');
   const scaledMask=new PNG({width:target.width,height:target.height});
   for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++){const from=(Math.min(mask.height-1,Math.floor(y*mask.height/target.height))*mask.width+Math.min(mask.width-1,Math.floor(x*mask.width/target.width)))*4;mask.data.copy(scaledMask.data,(y*target.width+x)*4,from,from+4);}
   mask=scaledMask;source=PNG.sync.read(resize(sourceBuffer,target.width,target.height));
  }
 }
 const plan=focusedInpaintPlan(region,source.width,source.height),r=plan.region;
 if(mask.width!==source.width||mask.height!==source.height)throw Error('蒙版与原图尺寸不一致，请重新绘制蒙版。');
 const crop=new PNG({width:r.width,height:r.height}),cropMask=new PNG({width:r.width,height:r.height});let selected=false;
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const from=((r.y+y)*source.width+r.x+x)*4,to=(y*r.width+x)*4;source.data.copy(crop.data,to,from,from+4);mask.data.copy(cropMask.data,to,from,from+4);selected ||= mask.data[from+3]>0&&mask.data[from]>0;}
 if(!selected)throw Error('选区内没有重绘蒙版，请先涂抹需要修改的位置。');
 return {...plan,source,mask,crop:PNG.sync.write(crop),cropMask:PNG.sync.write(cropMask)};
}
export function compositeFocusedPatch(patch:Buffer,input:ReturnType<typeof prepareFocusedInpaintInput>,resize:(data:Buffer,w:number,h:number)=>Buffer) {
 const {region:r,source,mask}=input,p=PNG.sync.read(resize(patch,r.width,r.height));
 if(p.width!==r.width||p.height!==r.height)throw Error('重绘结果尺寸异常。');
 const output=new PNG({width:source.width,height:source.height});source.data.copy(output.data);
 for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const to=((r.y+y)*source.width+r.x+x)*4,from=(y*r.width+x)*4;
  // No writes outside the crop or original painted mask, including alpha.
  if(mask.data[to+3]>0&&mask.data[to]>0)p.data.copy(output.data,to,from,from+4);
 }
 return PNG.sync.write(output);
}
