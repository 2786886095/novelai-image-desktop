import {useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {AppPortal} from '../../components/ui';
import {resolveSelectPortalLayer} from '../../components/portal-layer';

const MENU_WIDTH=420;
const MENU_ESTIMATED_HEIGHT=280;
const VIEWPORT_INSET=8;

export interface ComfyMenuViewport {width:number;height:number;left?:number;top?:number}
export interface ComfyMenuPosition {left:number;top:number;width:number;maxHeight:number;opensUp:boolean}

/** Pure CSS-pixel geometry; visualViewport offsets stay in the anchor's coordinate space. */
export function comfyAnchorMenuPosition(
  anchor:Pick<DOMRectReadOnly,'left'|'right'|'top'|'bottom'>,
  menu:{width:number;height:number},viewport:ComfyMenuViewport,gap=8,
):ComfyMenuPosition {
  const finite=(value:number|undefined,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
  const viewportWidth=Math.max(0,finite(viewport.width)),viewportHeight=Math.max(0,finite(viewport.height));
  const originLeft=finite(viewport.left),originTop=finite(viewport.top);
  const insetX=Math.min(VIEWPORT_INSET,viewportWidth/2),insetY=Math.min(VIEWPORT_INSET,viewportHeight/2);
  const leftEdge=originLeft+insetX,rightEdge=originLeft+viewportWidth-insetX;
  const topEdge=originTop+insetY,bottomEdge=originTop+viewportHeight-insetY;
  const width=Math.min(Math.max(0,finite(menu.width,MENU_WIDTH)),Math.max(0,rightEdge-leftEdge));
  const height=Math.max(0,finite(menu.height,MENU_ESTIMATED_HEIGHT)),distance=Math.max(0,finite(gap,8));
  const anchorTop=finite(anchor.top,topEdge),anchorBottom=finite(anchor.bottom,anchorTop);
  const below=Math.max(0,bottomEdge-Math.max(topEdge,anchorBottom+distance));
  const above=Math.max(0,Math.min(bottomEdge,anchorTop-distance)-topEdge);
  const opensUp=height>below&&above>below,maxHeight=opensUp?above:below;
  const visibleHeight=Math.min(height,maxHeight);
  const left=Math.max(leftEdge,Math.min(finite(anchor.right,leftEdge)-width,rightEdge-width));
  const preferredTop=opensUp?anchorTop-distance-visibleHeight:anchorBottom+distance;
  const top=Math.max(topEdge,Math.min(preferredTop,bottomEdge-visibleHeight));
  return {left,top,width,maxHeight,opensUp};
}

export interface ComfyResultActionsMenuProps {
  anchor:RefObject<HTMLButtonElement|null>;
  id:string;
  label:string;
  onClose:()=>void;
  focusFirst?:boolean;
  children:ReactNode;
}

function viewportFor(view:Window):ComfyMenuViewport {
  const visual=view.visualViewport;
  return {width:visual&&visual.width>0?visual.width:view.innerWidth,height:visual&&visual.height>0?visual.height:view.innerHeight,
    left:visual?.offsetLeft??0,top:visual?.offsetTop??0};
}

function initialPosition(anchor:HTMLButtonElement|null){
  const view=anchor?.ownerDocument.defaultView;
  if(!anchor||!view||!anchor.isConnected)return null;
  return {...comfyAnchorMenuPosition(anchor.getBoundingClientRect(),{width:MENU_WIDTH,height:MENU_ESTIMATED_HEIGHT},viewportFor(view)),zIndex:resolveSelectPortalLayer(anchor)};
}

/** A local nonmodal action panel, mounted only while open; no shade or root inert state. */
export function ComfyResultActionsMenu({anchor,id,label,onClose,focusFirst=false,children}:ComfyResultActionsMenuProps){
  const panel=useRef<HTMLDivElement>(null),closeLatest=useRef(onClose),closing=useRef(false),focused=useRef(false);
  closeLatest.current=onClose;
  // A real anchor rect is available before first render. Never paint a menu at(0,0)
  // while waiting for an effect; the layout effect only refines measured height.
  const [position,setPosition]=useState(()=>initialPosition(anchor.current));

  useLayoutEffect(()=>{
    const trigger=anchor.current,view=trigger?.ownerDocument.defaultView,surface=panel.current;
    if(!trigger||!view||!surface){closeLatest.current();return;}
    const doc=trigger.ownerDocument,visual=view.visualViewport;
    let disposed=false,frame:number|undefined;
    const close=(restoreFocus=false)=>{
      if(disposed||closing.current)return;
      closing.current=true;
      if(restoreFocus&&trigger.isConnected)trigger.focus({preventScroll:true});
      closeLatest.current();
    };
    const visible=()=>{
      if(!trigger.isConnected||!trigger.getClientRects().length)return false;
      const rect=trigger.getBoundingClientRect(),viewport=viewportFor(view);
      const left=viewport.left??0,top=viewport.top??0;
      if(rect.right<=left||rect.left>=left+viewport.width||rect.bottom<=top||rect.top>=top+viewport.height)return false;
      const stage=trigger.closest('.comfy-studio-stage');
      if(!stage)return true;
      const bounds=stage.getBoundingClientRect();
      return rect.right>bounds.left&&rect.left<bounds.right&&rect.bottom>bounds.top&&rect.top<bounds.bottom;
    };
    const update=()=>{
      frame=undefined;
      if(disposed||closing.current)return;
      if(!visible()){close();return;}
      const bounds=surface.getBoundingClientRect();
      const next={...comfyAnchorMenuPosition(trigger.getBoundingClientRect(),{width:MENU_WIDTH,height:Math.max(surface.scrollHeight,bounds.height)},viewportFor(view)),zIndex:resolveSelectPortalLayer(trigger)};
      setPosition(previous=>previous&&Object.keys(next).every(key=>previous[key as keyof typeof previous]===next[key as keyof typeof next])?previous:next);
    };
    const schedule=()=>{if(!disposed&&!closing.current&&frame===undefined)frame=view.requestAnimationFrame(update);};
    const within=(target:EventTarget|null)=>{
      // Event targets can be Window; contains() must receive a Node from this realm.
      const NodeClass=doc.defaultView?.Node;
      return Boolean(NodeClass&&target instanceof NodeClass&&(surface.contains(target)||trigger.contains(target)));
    };
    const outside=(event:Event)=>{if(!within(event.target))close();};
    const keydown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||!within(event.target))return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}
      else if(event.key==='Tab'){
        // Move the starting point back to the trigger, but do not prevent the
        // default: native forward/backward Tab traversal must leave this panel.
        close(true);
      }
    };
    doc.addEventListener('pointerdown',outside,true);doc.addEventListener('focusin',outside,true);doc.addEventListener('keydown',keydown);
    view.addEventListener('resize',schedule);view.addEventListener('scroll',schedule,true);
    visual?.addEventListener('resize',schedule);visual?.addEventListener('scroll',schedule);
    const observer=typeof view.ResizeObserver==='function'?new view.ResizeObserver(schedule):null;
    observer?.observe(trigger);observer?.observe(surface);
    const stage=trigger.closest('.comfy-studio-stage');if(stage)observer?.observe(stage);
    update();
    if(focusFirst&&!focused.current&&!closing.current){
      focused.current=true;
      (surface.querySelector<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')??surface).focus({preventScroll:true});
    }
    return()=>{
      disposed=true;if(frame!==undefined)view.cancelAnimationFrame(frame);observer?.disconnect();
      doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('focusin',outside,true);doc.removeEventListener('keydown',keydown);
      view.removeEventListener('resize',schedule);view.removeEventListener('scroll',schedule,true);
      visual?.removeEventListener('resize',schedule);visual?.removeEventListener('scroll',schedule);
    };
  },[anchor,focusFirst]);

  if(!position)return null;
  return <AppPortal><div ref={panel} id={id} role="region" aria-label={label} tabIndex={-1}
    className="menu-pop comfy-studio-image-menu" data-comfy-image-actions="true" data-opens-up={position.opensUp?'true':'false'}
    style={{position:'fixed',left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight,zIndex:position.zIndex,
      boxSizing:'border-box',minWidth:0,minHeight:0,overflowY:'auto',overflowX:'hidden'}}>{children}</div></AppPortal>;
}
