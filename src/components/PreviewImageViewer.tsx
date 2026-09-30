import '../preview-unified.css';
import {motionReduced,STUDIO_MOTION} from '../motion-system';
import {ImageFavoriteButton} from './ImageFavoriteButton';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from './ui';
import {useAppStore} from '../store';
import {historyPickerText} from './HistoryImagePicker';
import {desktopUiText} from '../i18n';
export type PreviewImage={src:string;alt:string};
export function PreviewImageViewer({images,index,onIndex,renderImage,showNavigation=true,onBackgroundClick}:{images:PreviewImage[];index:number;onIndex:(index:number)=>void;renderImage?:ReactNode;showNavigation?:boolean;onBackgroundClick:()=>void}) {
 const language=useAppStore(s=>s.settings?.language),text=historyPickerText(language);
 const zoomLabels:Record<string,string[]>={'zh-CN':['缩小','放大'],'zh-TW':['縮小','放大'],'ja-JP':['縮小','拡大'],'ko-KR':['축소','확대']};
 const zoomText=zoomLabels[String(language)]??['Zoom out','Zoom in'];
 const [scale,setScale]=useState(1),[pan,setPan]=useState({x:0,y:0});
 const root=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),img=useRef<HTMLImageElement>(null),drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const moved=useRef(false);
 const backgroundPress=useRef(false);
 const pointerStart=useRef<{x:number;y:number}|null>(null);
 const isBlank=(target:EventTarget)=>target instanceof Element&&!target.closest("img,button,a,input,textarea,select,video,canvas,[role=button],.image-preview-controls span");
 const image=images[index];
 const closePreview=useRef(onBackgroundClick);closePreview.current=onBackgroundClick;
 useEffect(()=>{const el=stage.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();e.stopPropagation();if(!e.deltaY)return;setScale(value=>{const next=Math.min(8,Math.max(1,value*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.002))),bounds=el.getBoundingClientRect(),picture=img.current??el.querySelector('img');const x=e.clientX-bounds.left-bounds.width/2,y=e.clientY-bounds.top-bounds.height/2;setPan(previous=>{const maxX=Math.max(0,((picture?.offsetWidth??0)*next-bounds.width)/2),maxY=Math.max(0,((picture?.offsetHeight??0)*next-bounds.height)/2);return{x:Math.max(-maxX,Math.min(maxX,x-(x-previous.x)*next/value)),y:Math.max(-maxY,Math.min(maxY,y-(y-previous.y)*next/value))};});return next;});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const reset=()=>{setScale(1);setPan({x:0,y:0});};
 useEffect(()=>{reset();drag.current=null;const element=img.current??stage.current?.querySelector('img');if(element&&!motionReduced()){const animation=element.animate([{opacity:0},{opacity:1}],{duration:160,easing:STUDIO_MOTION.enterEase});return()=>animation.cancel();}},[image?.src]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const surface=root.current?.closest('[role="dialog"]')??root.current?.parentElement;
  const key=(event:Event)=>{const e=event as KeyboardEvent;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePreview.current();return;}
   if(e.key==='Tab'){
    const nodes=[...surface?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')??[]].filter(n=>n!==root.current&&n.getClientRects().length&&!n.closest('[inert]'));
    e.preventDefault();e.stopPropagation();if(!nodes.length)return;
    const current=nodes.indexOf(document.activeElement as HTMLElement);
    const next=current<0?(e.shiftKey?nodes.length-1:0):(current+(e.shiftKey?-1:1)+nodes.length)%nodes.length;
    nodes[next].focus({preventScroll:true});
   }
  };
  surface?.addEventListener('keydown',key,true);root.current?.focus({preventScroll:true});
  return()=>{surface?.removeEventListener('keydown',key,true);if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});};
 },[]);
 function move(delta:number){const next=index+delta;if(next>=0&&next<images.length)onIndex(next);}
 function zoom(next:number){setScale(Math.min(8,Math.max(1,next)));setPan({x:0,y:0});}
 return <div ref={root} className="image-preview-viewer" tabIndex={0} onPointerDownCapture={e=>{moved.current=false;pointerStart.current={x:e.clientX,y:e.clientY};backgroundPress.current=e.button===0&&isBlank(e.target);}} onPointerMoveCapture={e=>{const start=pointerStart.current;if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)moved.current=true;}} onPointerCancel={()=>{pointerStart.current=null;backgroundPress.current=false;}} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(e.detail>1)return;if(moved.current){moved.current=false;return;}if(backgroundPress.current&&isBlank(e.target))onBackgroundClick();backgroundPress.current=false;}} onKeyDown={e=>{
  if((e.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onBackgroundClick();return;}
  const delta=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;
  if(delta&&showNavigation){e.preventDefault();e.stopPropagation();move(delta);}
 }}>
 <div className="image-preview-controls">{image&&<ImageFavoriteButton src={image.src}/>}{showNavigation&&<><Button disabled={index<=0} onClick={()=>move(-1)}>{text[1]}</Button><span>{index+1} / {images.length}</span><Button disabled={index+1>=images.length} onClick={()=>move(1)}>{text[2]}</Button></>}<Button aria-label={zoomText[0]} disabled={scale<=1} onClick={()=>zoom(scale/1.25)}>−</Button><span>{Math.round(scale*100)}%</span><Button aria-label={zoomText[1]} disabled={scale>=8} onClick={()=>zoom(scale*1.25)}>+</Button><Button onClick={reset}>{desktopUiText(language,'viewer.reset')}</Button></div>
 <div ref={stage} className="image-preview-stage" style={{cursor:scale>1?'grab':'default'}} onPointerDown={e=>{
  moved.current=false;root.current?.focus({preventScroll:true});if(scale<=1||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};
 }} onPointerMove={e=>{const element=img.current??stage.current?.querySelector("img");if(!drag.current||!element||!stage.current)return;const d=drag.current; if(Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y)>4)moved.current=true; const maxX=Math.max(0,(element.offsetWidth*scale-stage.current.clientWidth)/2),maxY=Math.max(0,(element.offsetHeight*scale-stage.current.clientHeight)/2);setPan({x:Math.max(-maxX,Math.min(maxX,d.px+e.clientX-d.x)),y:Math.max(-maxY,Math.min(maxY,d.py+e.clientY-d.y))});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
 {renderImage?<div className="image-preview-transform" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`}} onDragStart={e=>e.preventDefault()}>{renderImage}</div>:image&&<img ref={img} src={image.src} alt={image.alt} draggable={false} style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${scale})`}}/>}
 </div></div>;
}
