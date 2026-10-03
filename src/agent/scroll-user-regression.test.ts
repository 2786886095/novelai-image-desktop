import {expect,it} from 'vitest';
import {createStudioScrollFollower} from './scroll-follower';
it('small upward intent cancels queued pin and cannot resume inside old 100px threshold',()=>{
 const el={scrollTop:600,clientHeight:400,scrollHeight:1000};const frames=new Map<number,()=>void>();let seq=0,following=true;
 const f=createStudioScrollFollower(el,fn=>{frames.set(++seq,fn);return seq;},id=>frames.delete(id),v=>following=v);
 f.pin();f.intentUp();expect(frames.size).toBe(0);el.scrollTop=560;f.scrolled();expect(following).toBe(false);
 el.scrollHeight=1200;f.pin();for(const fn of frames.values())fn();expect(el.scrollTop).toBe(560);
 el.scrollTop=770;f.scrolled();expect(following).toBe(false);el.scrollTop=800;f.scrolled();expect(following).toBe(true);f.dispose();
});
it('one Latest follows later growth; empty transcript never enters away state',()=>{
 const el={scrollTop:0,clientHeight:400,scrollHeight:400};const frames=new Map<number,()=>void>();let seq=0,following=true;
 const f=createStudioScrollFollower(el,fn=>{frames.set(++seq,fn);return seq;},id=>frames.delete(id),v=>following=v);f.intentUp();expect(following).toBe(true);
 el.scrollHeight=1000;f.intentUp();f.latest();expect(el.scrollTop).toBe(600);for(const fn of [...frames.values()])fn();frames.clear();el.scrollHeight=1500;f.pin();for(const fn of [...frames.values()])fn();expect(el.scrollTop).toBe(1100);expect(following).toBe(true);f.dispose();
});
