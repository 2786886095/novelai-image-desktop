import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ReactElement,RefObject} from 'react';

const hooks=vi.hoisted(()=>({effects:[] as Array<()=>void|(()=>void)>,setters:[] as ReturnType<typeof vi.fn>[]}));
vi.mock('react',async original=>{
  const actual=await original<typeof import('react')>();
  return {...actual,useRef:<T,>(value:T)=>({current:value}),useLayoutEffect:(effect:()=>void|(()=>void))=>hooks.effects.push(effect),
    useState:<T,>(initial:T|(()=>T))=>{let value=typeof initial==='function'?(initial as ()=>T)():initial;const set=vi.fn((next:T|((previous:T)=>T))=>{value=typeof next==='function'?(next as (previous:T)=>T)(value):next;});hooks.setters.push(set);return [value,set];}};
});
vi.mock('../../components/ui',()=>({AppPortal:'app-portal-test'}));
vi.mock('../../components/portal-layer',()=>({resolveSelectPortalLayer:vi.fn(()=>20021)}));

import {ComfyResultActionsMenu,comfyAnchorMenuPosition} from './ComfyResultActionsMenu';

describe('Comfy image-action fixed geometry',()=>{
  const anchor={left:760,right:792,top:100,bottom:132};
  const viewport={width:1000,height:700};
  it('right-aligns below a real anchor, not at the viewport origin',()=>{
    expect(comfyAnchorMenuPosition(anchor,{width:420,height:200},viewport)).toEqual({left:372,top:140,width:420,maxHeight:552,opensUp:false});
  });
  it('flips above when below is too short and above has more room',()=>{
    expect(comfyAnchorMenuPosition({...anchor,top:600,bottom:632},{width:420,height:200},viewport)).toEqual({left:372,top:392,width:420,maxHeight:584,opensUp:true});
  });
  it('stays below when both sides fit even if above is bigger',()=>{
    const position=comfyAnchorMenuPosition({...anchor,top:400,bottom:432},{width:420,height:100},viewport);
    expect(position.opensUp).toBe(false);expect(position.top).toBe(440);
  });
  it('clamps both horizontal edges at8px',()=>{
    expect(comfyAnchorMenuPosition({...anchor,left:0,right:32},{width:420,height:200},viewport).left).toBe(8);
    expect(comfyAnchorMenuPosition({...anchor,left:999,right:1031},{width:420,height:200},viewport).left).toBe(572);
  });
  it('shrinks the menu to a narrow viewport instead of creating horizontal overflow',()=>{
    expect(comfyAnchorMenuPosition(anchor,{width:420,height:200},{width:260,height:700})).toMatchObject({left:8,width:244});
  });
  it('uses the larger side and limits height when neither side fits',()=>{
    expect(comfyAnchorMenuPosition({...anchor,top:250,bottom:282},{width:420,height:1000},viewport)).toMatchObject({top:290,maxHeight:402,opensUp:false});
    expect(comfyAnchorMenuPosition({...anchor,top:450,bottom:482},{width:420,height:1000},viewport)).toMatchObject({top:8,maxHeight:434,opensUp:true});
  });
  it('accounts for visualViewport offsets and a custom anchor gap',()=>{
    expect(comfyAnchorMenuPosition({left:25,right:57,top:90,bottom:122},{width:420,height:100},{left:20,top:40,width:300,height:400},4))
      .toEqual({left:28,top:126,width:284,maxHeight:306,opensUp:false});
  });
  it.each([{width:0,height:0},{width:10,height:10},{width:1,height:500}])('never emits negative size in a tiny viewport %j',tiny=>{
    const position=comfyAnchorMenuPosition(anchor,{width:420,height:1000},tiny);
    for(const value of [position.left,position.top,position.width,position.maxHeight])expect(Number.isFinite(value)).toBe(true);
    expect(position.width).toBeGreaterThanOrEqual(0);expect(position.maxHeight).toBeGreaterThanOrEqual(0);
    expect(position.width).toBeLessThanOrEqual(tiny.width);
  });
  it('does not leak NaN or Infinity from unavailable measurements',()=>{
    const position=comfyAnchorMenuPosition({left:NaN,right:Infinity,top:NaN,bottom:Infinity},{width:NaN,height:Infinity},{width:NaN,height:Infinity});
    for(const value of [position.left,position.top,position.width,position.maxHeight])expect(Number.isFinite(value)).toBe(true);
  });
});

// These tests exercise the component's own subscriptions with a small deterministic
// DOM-shaped harness. They do not render Chromium or claim native paint/focus proof.
class Hub {
  listeners=new Map<string,Set<EventListenerOrEventListenerObject>>();
  addEventListener(type:string,listener:EventListenerOrEventListenerObject){const set=this.listeners.get(type)??new Set();set.add(listener);this.listeners.set(type,set);}
  removeEventListener(type:string,listener:EventListenerOrEventListenerObject){this.listeners.get(type)?.delete(listener);}
  emit(type:string,event:object){for(const listener of [...(this.listeners.get(type)??[])]){if(typeof listener==='function')listener(event as Event);else listener.handleEvent(event as Event);}}
  listenerCount(){return [...this.listeners.values()].reduce((sum,listeners)=>sum+listeners.size,0);}
}
class FakeNode extends Hub {}

function mount(focusFirst=false){
  const doc=Object.assign(new Hub(),{activeElement:null as unknown,defaultView:null as unknown});
  const viewport=Object.assign(new Hub(),{width:1200,height:800,offsetLeft:0,offsetTop:0});
  const frames=new Map<number,FrameRequestCallback>();let frame=0;
  const observers:Array<{observe:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}>=[];
  class Observer {observe=vi.fn();disconnect=vi.fn();constructor(){observers.push(this);}}
  const view=Object.assign(new Hub(),{innerWidth:1200,innerHeight:800,visualViewport:viewport,Node:FakeNode,ResizeObserver:Observer,
    requestAnimationFrame:vi.fn((callback:FrameRequestCallback)=>{frames.set(++frame,callback);return frame;}),cancelAnimationFrame:vi.fn((id:number)=>frames.delete(id))});
  doc.defaultView=view;
  function element(rect:{left:number;right:number;top:number;bottom:number},height=200){
    const node=Object.assign(new FakeNode(),{ownerDocument:doc,isConnected:true,scrollHeight:height,children:new Set<unknown>(),
      getBoundingClientRect:()=>({...rect,width:rect.right-rect.left,height:rect.bottom-rect.top}),getClientRects:()=>[rect],
      closest:vi.fn(()=>null as unknown),contains:(target:unknown)=>target===node||node.children.has(target),
      focus:vi.fn(()=>{doc.activeElement=node;}),querySelector:vi.fn(()=>null as unknown)});
    return node;
  }
  const stage=element({left:500,right:1200,top:50,bottom:800});
  const trigger=element({left:1000,right:1032,top:100,bottom:132});trigger.closest.mockReturnValue(stage);
  const menu=element({left:612,right:1032,top:140,bottom:340});
  const action=element({left:630,right:900,top:150,bottom:180});menu.children.add(action);menu.querySelector.mockReturnValue(action);
  const onClose=vi.fn();
  const tree=ComfyResultActionsMenu({anchor:{current:trigger} as unknown as RefObject<HTMLButtonElement|null>,id:'image-actions',label:'Image actions',focusFirst,onClose,children:<button>Reveal</button>}) as ReactElement<{children:ReactElement<Record<string,unknown>>}>;
  const surface=tree.props.children;
  (surface.props.ref as {current:unknown}).current=menu;
  const cleanups=hooks.effects.map(effect=>effect());
  const cleanup=()=>{for(const release of cleanups)release?.();};
  return {doc,view,viewport,frames,observers,stage,trigger,menu,action,onClose,tree,surface,cleanup};
}

describe('Comfy image-action nonmodal lifecycle (mocked DOM)',()=>{
  beforeEach(()=>{hooks.effects.length=0;hooks.setters.length=0;vi.clearAllMocks();});
  it('uses AppPortal with a labelled nonmodal region and initial anchored fixed coordinates',()=>{
    const state=mount();
    expect(state.tree.type).toBe('app-portal-test');expect(state.surface.props.role).toBe('region');
    expect(state.surface.props['aria-label']).toBe('Image actions');expect(state.surface.props['aria-modal']).toBeUndefined();
    expect(state.surface.props.style).toMatchObject({position:'fixed',left:612,top:140,zIndex:20021});
    expect(state.surface.props.className).toBe('menu-pop comfy-studio-image-menu');state.cleanup();
  });
  it('focuses the first action only for a keyboard-open request',()=>{
    const state=mount(true);expect(state.action.focus).toHaveBeenCalledWith({preventScroll:true});state.cleanup();
  });
  it('does not steal focus for pointer-open or outside interactions',()=>{
    const state=mount();expect(state.action.focus).not.toHaveBeenCalled();
    state.doc.emit('pointerdown',{target:new FakeNode()});expect(state.onClose).toHaveBeenCalledTimes(1);expect(state.trigger.focus).not.toHaveBeenCalled();state.cleanup();
  });
  it('ignores inside/trigger pointerdown and closes on outside focusin',()=>{
    const state=mount();state.doc.emit('pointerdown',{target:state.action});state.doc.emit('pointerdown',{target:state.trigger});
    expect(state.onClose).not.toHaveBeenCalled();state.doc.emit('focusin',{target:new FakeNode()});expect(state.onClose).toHaveBeenCalledOnce();state.cleanup();
  });
  it('Escape closes and returns focus without closing another surface',()=>{
    const state=mount();const event={target:state.action,key:'Escape',defaultPrevented:false,preventDefault:vi.fn(),stopPropagation:vi.fn()};
    state.doc.emit('keydown',event);expect(event.preventDefault).toHaveBeenCalledOnce();expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(state.trigger.focus).toHaveBeenCalledWith({preventScroll:true});expect(state.onClose).toHaveBeenCalledOnce();state.cleanup();
  });
  it.each([false,true])('Tab closes via anchor but leaves native traversal unprevented (shift=%s)',shiftKey=>{
    const state=mount();const event={target:state.action,key:'Tab',shiftKey,defaultPrevented:false,preventDefault:vi.fn(),stopPropagation:vi.fn()};
    state.doc.emit('keydown',event);expect(state.trigger.focus).toHaveBeenCalledWith({preventScroll:true});
    expect(state.onClose).toHaveBeenCalledOnce();expect(event.preventDefault).not.toHaveBeenCalled();expect(event.stopPropagation).not.toHaveBeenCalled();state.cleanup();
  });
  it('coalesces scroll/resize and removes all listeners, observer and pending frame on unmount',()=>{
    const state=mount();expect(state.doc.listenerCount()).toBe(3);expect(state.view.listenerCount()).toBe(2);expect(state.viewport.listenerCount()).toBe(2);
    expect(state.observers).toHaveLength(1);expect(state.observers[0].observe).toHaveBeenCalledTimes(3);
    state.view.emit('scroll',{});state.view.emit('resize',{});state.viewport.emit('resize',{});
    expect(state.frames.size).toBe(1);state.cleanup();
    expect(state.frames.size).toBe(0);expect(state.observers[0].disconnect).toHaveBeenCalledOnce();
    expect(state.doc.listenerCount()+state.view.listenerCount()+state.viewport.listenerCount()).toBe(0);
  });
  it('closes when scrolling clips the trigger outside its result stage',()=>{
    const state=mount();state.trigger.getBoundingClientRect=()=>({left:1000,right:1032,top:10,bottom:42,width:32,height:32});
    state.view.emit('scroll',{});for(const callback of [...state.frames.values()])callback(0);
    expect(state.onClose).toHaveBeenCalledOnce();expect(state.trigger.focus).not.toHaveBeenCalled();state.cleanup();
  });
});
