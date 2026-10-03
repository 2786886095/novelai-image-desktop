import {expect,it} from 'vitest';
import {createStudioScrollFollower} from './scroll-follower';
it('an empty or non-overflowing transcript cannot be marked away by clicking blank space or wheeling up',()=>{
 for(const height of [0,200,400]){
  const el={scrollTop:0,clientHeight:400,scrollHeight:height};let follow=true;
  const f=createStudioScrollFollower(el,()=>1,()=>{},value=>{follow=value;});
  f.intentUp();expect(follow).toBe(true);expect(el.scrollTop).toBe(0);
  el.scrollHeight=1000;f.intentUp();expect(follow).toBe(false);f.dispose();
 }
});
it('one latest click stays pinned through delayed image and disclosure layout growth',()=>{
 const el={scrollTop:50,clientHeight:400,scrollHeight:1000},frames=new Map<number,()=>void>();let n=0,follow=true;
 const f=createStudioScrollFollower(el,fn=>{frames.set(++n,fn);return n;},id=>frames.delete(id),value=>{follow=value;});
 const flush=()=>{const work=[...frames.values()];frames.clear();work.forEach(fn=>fn());};
 f.intentUp();expect(follow).toBe(false);f.latest();expect(el.scrollTop).toBe(600);flush();el.scrollHeight=1500;f.scrolled();f.pin();flush();expect(el.scrollTop).toBe(1100);expect(follow).toBe(true);
 f.intentUp();el.scrollTop=40;el.scrollHeight=1700;f.pin();flush();expect(el.scrollTop).toBe(40);expect(follow).toBe(false);f.dispose();
});
