import {memo, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode} from 'react';
import type {CharCaption} from '../types';

export const characterEditLabels = (language: unknown) => {
 const strings: Record<string,string[]> = {
 'zh-CN':['拖动排序','同步位置','保留位置','角色顺序已更改','全部角色','选择要保存的角色'],
 'zh-TW':['拖曳排序','同步位置','保留位置','角色順序已變更','全部角色','選擇要儲存的角色'],
 'en-US':['Drag to reorder','Sync positions','Keep positions','Character order changed','All characters','Characters to save'],
 'ja-JP':['ドラッグして並べ替え','位置を同期','位置を保持','順序を変更しました','すべてのキャラクター','保存するキャラクター'],
 'ko-KR':['드래그하여 정렬','위치 동기화','위치 유지','캐릭터 순서 변경됨','모든 캐릭터','저장할 캐릭터'],
 };
 const [drag,sync,keep,changed,all,select] = strings[String(language)] ?? strings['en-US'];
 return {drag,sync,keep,changed,all,select};
};

export function reorderCharacters(items: CharCaption[], from: number, to: number) {
 if(from<0||to<0||from>=items.length||to>=items.length||from===to)return items;
 const next=[...items];next.splice(to,0,next.splice(from,1)[0]);return next;
}
export function syncCharacterSlots(items: CharCaption[], slots: CharCaption[]) {
 if(items.length!==slots.length || items.some(c=>!slots.some(s=>s.id===c.id))) return items;
 return items.map((c,i)=>({...c,x:slots[i].x,y:slots[i].y,useCoords:slots[i].useCoords}));
}

export function AnimatedCollapse({open,children,id,className='',lazy=false}:{open:boolean;children:ReactNode;id?:string;className?:string;lazy?:boolean}) {
 const [visited,setVisited]=useState(open);
 useEffect(()=>{if(open)setVisited(true);},[open]);
 return <div id={id} className={`animated-collapse ${open?'is-open':''} ${className}`} inert={!open} aria-hidden={!open}><div>{!lazy||open||visited?children:null}</div></div>;
}

/** Use the compact slots, not hit-tested rows (which move during the drag). */
export function characterDropIndex(centers: number[], y: number) {
 if (!centers.length || !Number.isFinite(y)) return -1;
 return centers.reduce((best, center, index) => Math.abs(center-y)<Math.abs(centers[best]-y)?index:best, 0);
}

type CharacterDrag = {
 id:string; pointerId:number; handle:HTMLButtonElement; list:HTMLElement;
 x:number; y:number; startX:number; startY:number; offsetX:number; offsetY:number;
 minHeight:string; anchor:string; ghost?:HTMLElement; frame?:number;
 rows:HTMLElement[]; tops:number[]; heights:number[]; transforms:string[];
 from:number; to:number; moved:boolean; scroller:HTMLElement|null; lastTime:number;
};
export function useCharacterReorder(items:CharCaption[],commit:(items:CharCaption[])=>void) {
 const [dragId,setDragId]=useState<string|null>(null),[overId,setOverId]=useState<string|null>(null);
 const [slots,setSlots]=useState<CharCaption[]|null>(null);
 const active=useRef<CharacterDrag|null>(null);
 const current=useRef({items,commit}); current.current={items,commit};
 const move=(id:string,target:string)=>{
  const {items,commit}=current.current;
  const next=reorderCharacters(items,items.findIndex(c=>c.id===id),items.findIndex(c=>c.id===target));
  if(next===items)return;
  setSlots(previous=>previous??items.map(c=>({...c})));commit(next);
 };
 const cleanup=()=>{
  const d=active.current; active.current=null;if(!d)return;
  if(d.frame!==undefined)cancelAnimationFrame(d.frame);
  d.ghost?.remove();
  d.rows.forEach((row,i)=>{row.style.transform=d.transforms[i]??'';row.classList.remove('char-drag-placeholder');});
  d.list.style.minHeight=d.minHeight;d.list.style.overflowAnchor=d.anchor;
  if(d.handle.hasPointerCapture(d.pointerId))d.handle.releasePointerCapture(d.pointerId);
 };
 const cancel=()=>{cleanup();setDragId(null);setOverId(null);};
 useEffect(()=>()=>cleanup(),[]);
 useEffect(()=>{
  if(!dragId)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();cancel();}};
  window.addEventListener('blur',cancel);window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key,true);};
 },[dragId]);
 const paint=(d:CharacterDrag)=>{
  const rect=d.list.getBoundingClientRect();
  if(d.ghost){d.ghost.style.left=`${d.x-d.offsetX}px`;d.ghost.style.top=`${d.y-d.offsetY}px`;}
  const clip=d.scroller?.getBoundingClientRect();
  const inside=d.x>=rect.left-40&&d.x<=rect.right+40&&d.y>=Math.max(0,clip?.top??0)-24&&d.y<=Math.min(window.innerHeight,clip?.bottom??window.innerHeight)+24;
  const to=inside?characterDropIndex(d.tops.map((top,i)=>rect.top+top+d.heights[i]/2),d.y):-1;
  if(to===d.to)return;
  d.to=to;setOverId(to<0?null:d.rows[to].dataset.characterId??null);
  const order=d.rows.map((_,i)=>i);order.splice(to<0?d.from:to,0,order.splice(d.from,1)[0]);
  const gap=d.tops.length>1?d.tops[1]-d.tops[0]-d.heights[0]:0;
  let top=d.tops[0];
  for(const index of order){d.rows[index].style.transform=`translateY(${top-d.tops[index]}px)`;top+=d.heights[index]+gap;}
 };
 useLayoutEffect(()=>{
  const d=active.current;if(!d||!dragId)return;
  // React has now folded the rows. Clone only the compact header, never inputs or IDs.
  d.rows=[...d.list.querySelectorAll<HTMLElement>(':scope > [data-character-id]')];
  d.from=d.rows.findIndex(row=>row.dataset.characterId===d.id);if(d.from<0){cancel();return;}
  const rect=d.list.getBoundingClientRect();
  d.tops=d.rows.map(row=>row.getBoundingClientRect().top-rect.top);
  d.heights=d.rows.map(row=>row.getBoundingClientRect().height);
  d.transforms=d.rows.map(row=>row.style.transform);
  const row=d.rows[d.from],head=row.querySelector('.char-row-head');if(!head){cancel();return;}
  const ghost=document.createElement('div');ghost.className='char-row collapsed char-drag-preview';
  ghost.append(head.cloneNode(true));ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  ghost.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  ghost.style.width=`${row.getBoundingClientRect().width}px`;ghost.style.height=`${d.heights[d.from]}px`;
  d.offsetY=Math.min(d.offsetY,d.heights[d.from]/2);d.ghost=ghost;
  document.body.append(ghost);row.classList.add('char-drag-placeholder');
  d.to=-2;paint(d);
  const tick=(time:number)=>{
   if(active.current!==d)return;
   const elapsed=Math.min(32,time-d.lastTime||16);d.lastTime=time;
   if(d.scroller&&d.moved){const bounds=d.scroller.getBoundingClientRect();
    if(d.x>=bounds.left&&d.x<=bounds.right){const top=Math.max(0,bounds.top),bottom=Math.min(window.innerHeight,bounds.bottom);
     const speed=d.y<top+40?-Math.min(1,(top+40-d.y)/40):d.y>bottom-40?Math.min(1,(d.y-bottom+40)/40):0;
     d.scroller.scrollTop+=speed*elapsed*.65;
    }
   }
   paint(d);d.frame=requestAnimationFrame(tick);
  };
  d.frame=requestAnimationFrame(tick);
 },[dragId]);
 const handle=(id:string)=>({
  onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>{
   if(e.button!==0||items.length<2||active.current)return;
   const list=e.currentTarget.closest<HTMLElement>('[data-character-list]');
   const row=e.currentTarget.closest<HTMLElement>('[data-character-id]');if(!list||!row)return;
   e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
   let scroller=list.parentElement;while(scroller&&!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))scroller=scroller.parentElement;
   const rect=row.getBoundingClientRect();
   active.current={id,pointerId:e.pointerId,handle:e.currentTarget,list,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,minHeight:list.style.minHeight,anchor:list.style.overflowAnchor,rows:[],tops:[],heights:[],transforms:[],from:0,to:-1,moved:false,scroller,lastTime:0};
   list.style.minHeight=`${list.getBoundingClientRect().height}px`;list.style.overflowAnchor='none';setDragId(id);setOverId(id);
  },
  onPointerMove:(e:PointerEvent<HTMLButtonElement>)=>{const d=active.current;if(!d||e.pointerId!==d.pointerId)return;
   d.x=e.clientX;d.y=e.clientY;d.moved ||= Math.hypot(d.x-d.startX,d.y-d.startY)>5;
  },
  onPointerUp:(e:PointerEvent<HTMLButtonElement>)=>{
   const d=active.current;if(!d||e.pointerId!==d.pointerId)return;
   d.x=e.clientX;d.y=e.clientY;paint(d);
   const target=d.rows[d.to]?.dataset.characterId;
   if(d.moved&&target)move(d.id,target);cancel();
  },
  onPointerCancel:cancel,onLostPointerCapture:()=>{if(active.current)cancel();},
  onKeyDown:(e:React.KeyboardEvent<HTMLButtonElement>)=>{
   if(e.key==='Escape'){cancel();return;}
   if(active.current||e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;e.preventDefault();
   const index=items.findIndex(c=>c.id===id)+(e.key==='ArrowUp'?-1:1);if(items[index])move(id,items[index].id);
  },
 });
 return {dragId,overId,handle,slots,keep:()=>setSlots(null),sync:()=>{if(slots)commit(syncCharacterSlots(items,slots));setSlots(null);}};
}

export const CharacterPositionMarker=memo(function CharacterPositionMarker({caption,index,label,onCommit}:{caption:CharCaption;index:number;label:string;onCommit:(id:string,patch:Partial<CharCaption>)=>void}) {
 const drag=useRef<{rect:DOMRect;dx:number;dy:number;x:number;y:number}|null>(null);
 const reset=(button:HTMLButtonElement)=>{button.style.left=`${caption.x*100}%`;button.style.top=`${caption.y*100}%`;drag.current=null;};
 const update=(e:PointerEvent<HTMLButtonElement>)=>{
  const d=drag.current;if(!d)return;
  d.x=Math.min(1,Math.max(0,(e.clientX-d.rect.left-d.dx)/d.rect.width));
  d.y=Math.min(1,Math.max(0,(e.clientY-d.rect.top-d.dy)/d.rect.height));
  e.currentTarget.style.left=`${d.x*100}%`;e.currentTarget.style.top=`${d.y*100}%`;
 };
 return <button type="button" className="char-position-marker" style={{left:`${caption.x*100}%`,top:`${caption.y*100}%`}} aria-label={label}
  onPointerDown={e=>{
   if(e.button!==0)return;const rect=e.currentTarget.parentElement!.getBoundingClientRect();if(!rect.width||!rect.height)return;
   e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
   drag.current={rect,dx:e.clientX-rect.left-caption.x*rect.width,dy:e.clientY-rect.top-caption.y*rect.height,x:caption.x,y:caption.y};
  }}
  onPointerMove={update}
  onPointerUp={e=>{update(e);const d=drag.current;if(!d)return;drag.current=null;onCommit(caption.id,{x:d.x,y:d.y,useCoords:true});e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={e=>reset(e.currentTarget)} onLostPointerCapture={e=>{if(drag.current)reset(e.currentTarget);}}
  onKeyDown={e=>{
   if(e.key==='Escape'){reset(e.currentTarget);return;}
   const step=e.shiftKey?.05:.01;let {x,y}=caption;
   if(e.key==='ArrowLeft')x-=step;else if(e.key==='ArrowRight')x+=step;else if(e.key==='ArrowUp')y-=step;else if(e.key==='ArrowDown')y+=step;else return;
   e.preventDefault();onCommit(caption.id,{x:Math.min(1,Math.max(0,x)),y:Math.min(1,Math.max(0,y)),useCoords:true});
  }}>{index+1}</button>;
});
