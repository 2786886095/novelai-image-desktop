import {useLayoutEffect,useRef} from 'react';
import {animateStudioEntry,animateStudioHeading} from './motion-system';

/** Animate the view change, not edits/streaming updates; never remount its form. */
export function useStudioRegionMotion(key: unknown, enabled = true) {
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!enabled||!node)return;
  const stop=animateStudioEntry(node,200);
  const stopHeading=animateStudioHeading(node.querySelector('h1,h2,h3,.panel-head strong'));
  return()=>{stop();stopHeading();};
 },[key,enabled]);
 return ref;
}
