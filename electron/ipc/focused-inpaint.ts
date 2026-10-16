import {PNG} from 'pngjs';
import {focusedInpaintPlan,FOCUSED_INPAINT_SELECTION_MAX_PIXELS,type InpaintRegion} from '../../src/focused-inpaint';
import {type InpaintSize} from '../../src/inpaint-size';

export function prepareFocusedInpaintInput(sourceBuffer:Buffer,maskBuffer:Buffer,region:InpaintRegion,target?:InpaintSize,resize?:(data:Buffer,w:number,h:number)=>Buffer) {
 const source:PNG=PNG.sync.read(sourceBuffer),mask:PNG=PNG.sync.read(maskBuffer);
 if(mask.width!==source.width||mask.height!==source.height)throw Error('蒙版与原图尺寸不一致，请重新绘制蒙版。');
 // The optional legacy target belongs to full-image inpaint only. A focused
 // request crops the original pixels; its work size never resizes the canvas.
 void target;void resize;
 if(!region||![region.x,region.y,region.width,region.height].every(Number.isInteger)||region.x<0||region.y<0||region.width<8||region.height<8||region.x+region.width>source.width||region.y+region.height>source.height)throw Error('重绘选区必须是原图内至少 8 × 8 像素的整数区域，请重新选择。');
 if(region.width*region.height>FOCUSED_INPAINT_SELECTION_MAX_PIXELS)throw Error(`重绘选区过大（最多 ${FOCUSED_INPAINT_SELECTION_MAX_PIXELS} 原图像素），请缩小重绘区域后重试。`);
 const plan=focusedInpaintPlan(region,source.width,source.height),r=plan.region;
 // The UI shows a bounded ROI, but programmatic callers must not silently lose
 // part of their mask if a planner would adjust the submitted selection.
 if(r.x!==region.x||r.y!==region.y||r.width!==region.width||r.height!==region.height)throw Error('重绘选区需要调整，请重新选择区域后重试。');
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
