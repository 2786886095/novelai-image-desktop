import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from './ui';
import {useAppStore} from '../store';
import {historyPickerText} from './HistoryImagePicker';
import {desktopUiText} from '../i18n';
export type PreviewImage={src:string;alt:string};
export function PreviewImageViewer({images,index,onIndex,renderImage,showNavigation=true,onBackgroundClick}:{images:PreviewImage[];index:number;onIndex:(index:number)=>void;renderImage?:ReactNode;showNavigation?:boolean;onBackgroundClick?:()=>void}) {
 const language=useAppStore(s=>s.settings?.language),text=historyPickerText(language);
 const zoomLabels:Record<string,string[]>={'zh-CN':['缩小','放大'],'zh-TW':['縮小','放大'],'ja-JP':['縮小','拡大'],'ko-KR':['축소','확대']};
 const zoomText=zoomLabels[String(language)]??['Zoom out','Zoom in'];
 const [scale,setScale]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const root=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),img=useRef<HTMLImageElement>(null),drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const moved=useRef(false);
 const image=images[index];
 const reset=()=>{setScale(1);setPan({x:0,y:0});};
 useEffect(()=>{reset();drag.current=null;},[image?.src]);
 useEffect(()=>{root.current?.focus({preventScroll:true});},[]);
 function move(delta:number){const next=index+delta;if(next>=0&&next<images.length)onIndex(next);}
 function zoom(next:number){setScale(Math.min(8,Math.max(1,next)));setPan({x:0,y:0});}
 return <div ref={root} className="image-preview-viewer" tabIndex={0} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(moved.current){moved.current=false;return;}if(e.target===stage.current)onBackgroundClick?.();}} onKeyDown={e=>{
  if((e.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))return;
  const delta=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;
  if(delta&&showNavigation){e.preventDefault();e.stopPropagation();move(delta);}
 }}>
 <div className="image-preview-controls">{showNavigation&&<><Button disabled={index<=0} onClick={()=>move(-1)}>{text[1]}</Button><span>{index+1} / {images.length}</span><Button disabled={index+1>=images.length} onClick={()=>move(1)}>{text[2]}</Button></>}<Button aria-label={zoomText[0]} disabled={scale<=1} onClick={()=>zoom(scale/1.25)}>−</Button><span>{Math.round(scale*100)}%</span><Button aria-label={zoomText[1]} disabled={scale>=8} onClick={()=>zoom(scale*1.25)}>+</Button><Button onClick={reset}>{desktopUiText(language,'viewer.reset')}</Button></div>
 <div ref={stage} className="image-preview-stage" style={{cursor:scale>1?'grab':'default'}} onWheel={e=>{e.preventDefault();zoom(scale*(e.deltaY<0?1.16:1/1.16));}} onPointerDown={e=>{
  moved.current=false;root.current?.focus({preventScroll:true});if(scale<=1||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};
 }} onPointerMove={e=>{const element=img.current??stage.current?.querySelector("img");if(!drag.current||!element||!stage.current)return;const d=drag.current; if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>4)moved.current=true; const maxX=Math.max(0,(element.offsetWidth*scale-stage.current.clientWidth)/2),maxY=Math.max(0,(element.offsetHeight*scale-stage.current.clientHeight)/2);setPan({x:Math.max(-maxX,Math.min(maxX,d.px+e.clientX-d.x)),y:Math.max(-maxY,Math.min(maxY,d.py+e.clientY-d.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
 {renderImage?<div className="image-preview-transform" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`}} onDragStart={e=>e.preventDefault()}>{renderImage}</div>:image&&<img ref={img} src={image.src} alt={image.alt} draggable={false} style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`}}/>}
 </div></div>;
}
