import {expect,it} from 'vitest';
import * as focused from './focused-inpaint';
import {inpaintSizePlan,validateInpaintSize} from './inpaint-size';
const roi={x:128,y:256,width:512,height:768};
const custom={width:1024,height:1536};
it.each([
 ['1152x1728 original','original',{width:1152,height:1728}],
 ['4K original','original',{width:4096,height:4096}],
 ['1152x1728 custom','custom',{width:1152,height:1728}],
 ['legal custom focused','custom',{width:896,height:1152}],
] as const)('focused preserves original canvas: %s',(_name,mode,source)=>{
 const p=inpaintSizePlan(mode,custom,source,roi);
 expect(p.outputSize).toEqual(source);
 expect(p.requestSize).toEqual(focused.focusedInpaintPlan(roi,source.width,source.height).size);
 expect((p as {region?:unknown}).region).toEqual(roi);
});
it('ordinary nonfocused custom keeps exact custom dimensions',()=>{
 expect(inpaintSizePlan('custom',custom,{width:1152,height:1728})).toEqual({outputSize:custom,requestSize:custom});
});
it('ordinary nonfocused original keeps strict work size validation',()=>{
 expect(()=>inpaintSizePlan('original',custom,{width:1152,height:1728})).toThrow(/1600/);
});
it('existing request validation is not weakened',()=>{
 for(const width of [0,63,65,1728,Infinity,NaN])expect(()=>validateInpaintSize({width,height:1024})).toThrow();
});
it.each([
 [4096,4096,768,768,1024,1024],
 [1536,864,1024,576,1344,768],
 [768,768,768,768,1024,1024],
 [1536,384,1536,384,2048,512],
 [640,640,640,640,1024,1024],
])('matches observed official arithmetic %sx%s',(w,h,rw,rh,tw,th)=>{
 const p=focused.focusedInpaintPlan({x:0,y:0,width:w,height:h},4096,4096);
 expect(p.region).toEqual({x:0,y:0,width:rw,height:rh});
 expect(p.size).toEqual({width:tw,height:th});
});
it('exports one source ROI clamp for UI and backend, with no input mutation',()=>{
 const clamp=(focused as any).clampFocusedInpaintRegion;
 expect(typeof clamp).toBe('function');
 const input={x:100,y:200,width:1536,height:864};const old={...input};
 const r=clamp(input,4096,4096);expect(r).toEqual({x:100,y:200,width:1024,height:576});
 expect(clamp(r,4096,4096)).toEqual(r);expect(input).toEqual(old);
});
it.each([[1,1],[-1,1],[1,-1],[-1,-1]])('caps drag in direction %s,%s and preserves snapped anchor',(sx,sy)=>{
 const clamp=(focused as any).clampFocusedInpaintDrag;
 expect(typeof clamp).toBe('function');const anchor={x:2048,y:2048};
 const r=clamp(anchor,{x:2048+sx*2048,y:2048+sy*2048},4096,4096);
 expect(r.width).toBe(768);expect(r.height).toBe(768);
 expect(sx>0?r.x:r.x+r.width).toBe(anchor.x);expect(sy>0?r.y:r.y+r.height).toBe(anchor.y);
});
it('snaps drag coordinates on the mask grid before clipping and keeps integer ROI inside image',()=>{
 const clamp=(focused as any).clampFocusedInpaintDrag;
 expect(typeof clamp).toBe('function');
 expect(clamp({x:10,y:18},{x:75,y:85},100,100)).toEqual({x:8,y:16,width:64,height:72});
 const r=clamp({x:4000,y:4000},{x:-100,y:-200},4096,4096);
 for(const v of Object.values(r))expect(Number.isInteger(v)).toBe(true);
 expect(r.x).toBeGreaterThanOrEqual(0);expect(r.y).toBeGreaterThanOrEqual(0);
 expect(r.x+r.width).toBeLessThanOrEqual(4096);expect(r.y+r.height).toBeLessThanOrEqual(4096);
 expect(r.width*r.height).toBeLessThanOrEqual(589824);
});
it('keeps an unconstrained canvas clip separate from NovelAI selection cap',()=>{
 const clip=(focused as any).clipInpaintRegion;expect(typeof clip).toBe('function');
 expect(clip({x:0,y:0,width:4096,height:4096},4096,4096)).toEqual({x:0,y:0,width:4096,height:4096});
});
it.each([[8,4096],[4096,8],[8,8],[12,1000000]])('client safety for extreme strip %sx%s is positive 64 aligned and at most 1MP',(width,height)=>{
 const p=focused.focusedInpaintPlan({x:0,y:0,width,height},Math.max(width,4096),Math.max(height,4096));
 expect(p.region.width*p.region.height).toBeLessThanOrEqual(589824);
 expect(p.size.width).toBeGreaterThanOrEqual(64);expect(p.size.height).toBeGreaterThanOrEqual(64);
 expect(p.size.width%64).toBe(0);expect(p.size.height%64).toBe(0);
 expect(p.size.width*p.size.height).toBeLessThanOrEqual(1048576);
});
it('invalid canvas and empty selections remain rejected',()=>{
 for(const width of [0,NaN,Infinity,-1,7])expect(()=>focused.focusedInpaintPlan({x:0,y:0,width,height:10},100,100)).toThrow();
 for(const width of [0,NaN,Infinity,-1])expect(()=>focused.focusedInpaintPlan(roi,width,4096)).toThrow();
});
