export const foldSnapshot=(previous,next)=>previous?.revision!==undefined&&previous.revision===next.revision?previous:next;
export function startPolling({read,publish,onError,isVisible,interval=5000,setTimer=setTimeout,clearTimer=clearTimeout}){
 let stopped=false,timer;
 const schedule=()=>{if(!stopped)timer=setTimer(tick,interval)};
 async function tick(){
  if(stopped)return;
  if(isVisible())try{const data=await read();if(!stopped)publish(data)}catch(error){if(!stopped)onError(error)}
  schedule();
 }
 schedule();return()=>{stopped=true;clearTimer(timer)};
}
