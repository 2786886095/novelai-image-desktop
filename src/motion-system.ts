/** Shared interaction lifecycle. Visual-only exits never retain live controls. */
export const STUDIO_MOTION = {enter:200,exit:160,menuEnter:160,menuExit:120,
  enterEase:'cubic-bezier(0,0,.2,1)',exitEase:'cubic-bezier(.4,0,1,1)'} as const;
const ghosts=new Set<HTMLElement>();
const activeAnimations=new Set<Animation>();
export function cancelStudioAnimations(){for(const animation of activeAnimations)animation.cancel();activeAnimations.clear();}
function play(node:Element,frames:Keyframe[],duration:number){
 const animation=node.animate(frames,{duration,easing:STUDIO_MOTION.enterEase});activeAnimations.add(animation);
 const forget=()=>activeAnimations.delete(animation);
 animation.addEventListener('finish',forget,{once:true});animation.addEventListener('cancel',forget,{once:true});
 return()=>{animation.cancel();forget();};
}
const modals:HTMLElement[]=[];
let rootWasInert=false;
export function motionReduced(){return typeof window==='undefined'||document.documentElement.classList.contains('motion-reduced');}
/** Fade only the mounted content; never transform a portal's containing block. */
export function animateStudioEntry(target:Element|NodeListOf<Element>|null,duration=150){
 if(!target||motionReduced())return()=>{};
 const nodes=target instanceof Element?[target]:Array.from(target);
 const stops=nodes.map(node=>play(node,[{opacity:0},{opacity:1}],duration));
 return()=>stops.forEach(stop=>stop());
}
/** Only leaf headings move; fixed/portalled controls keep their coordinate space. */
export function animateStudioHeading(node:Element|null){
 if(!node||motionReduced())return()=>{};
 return play(node,[{transform:'translateY(5px)'},{transform:'translateY(0)'}],220);
}
export function animatePortalEntry(host:HTMLElement|null){
 const surface=host?.firstElementChild;
 if(!surface||motionReduced()||surface.matches('[data-disclosure-open]'))return()=>{};
 const stop=animateStudioEntry(surface,200);
 const heading=animateStudioHeading(surface.querySelector('h1,h2,h3'));
 return()=>{stop();heading();};
}
function clearGhosts(){for(const ghost of ghosts){ghost.remove();}ghosts.clear();}
export function installStudioMotion(){
 let dark=document.documentElement.classList.contains('theme-dark'),frame=0;
 const sync=()=>{const html=document.documentElement,next=html.classList.contains('theme-dark');if(dark!==next){dark=next;html.dataset.studioThemeChanging='true';cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{delete html.dataset.studioThemeChanging;});}html.dataset.studioMotion=motionReduced()?'reduced':'full';if(motionReduced()){clearGhosts();cancelStudioAnimations();}};
 const observer=new MutationObserver(sync);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});sync();
 const loaded=(event:Event)=>{const img=event.target;if(img instanceof HTMLImageElement&&!motionReduced()&&img.closest('.history-item,.aitag-card,.works-tile,.favorite-image'))play(img,[{opacity:0},{opacity:1}],240);};
 document.addEventListener('load',loaded,true);
 return()=>{observer.disconnect();document.removeEventListener('load',loaded,true);cancelAnimationFrame(frame);clearGhosts();cancelStudioAnimations();};
}
export function manageModalPortal(host:HTMLElement|null){
 if(!host?.querySelector('.modal-backdrop,[role="dialog"],[role="alertdialog"],.style-image-lightbox,.gallery-favorite-lightbox'))return()=>{};
 const previous=document.activeElement as HTMLElement|null,root=document.getElementById('root');
 if(!modals.length&&root){rootWasInert=root.inert;root.inert=true;}modals.push(host);
 const key=(event:KeyboardEvent)=>{if(event.key!=='Tab'||event.defaultPrevented||modals.at(-1)!==host||document.querySelector('.select-menu-popover[data-disclosure-open="true"]'))return;
  const nodes=[...host.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(node=>node.getClientRects().length&&!node.closest('[inert]'));
  const index=nodes.indexOf(document.activeElement as HTMLElement);if(!nodes.length)return;
  if(event.shiftKey&&index<=0){event.preventDefault();nodes.at(-1)?.focus();}else if(!event.shiftKey&&(index<0||index===nodes.length-1)){event.preventDefault();nodes[0].focus();}
 };document.addEventListener('keydown',key);
 return()=>{document.removeEventListener('keydown',key);const index=modals.indexOf(host);if(index>=0)modals.splice(index,1);if(!modals.length&&root)root.inert=rootWasInert;if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});};
}
export function cancelPortalExits(){clearGhosts();}
export function retainPortalExit(host:HTMLElement|null){
 if(!host||motionReduced())return;
 // Menus and preview dialogs with their own retained closing phase must not exit twice.
 if(host.querySelector('[data-disclosure-open],[data-closing="true"]'))return;
 const surface=host.firstElementChild;
 if(!(surface instanceof HTMLElement)||!surface.matches('.modal-backdrop,[role="dialog"],[role="alertdialog"],.reference-ui-mask,.style-image-lightbox,.gallery-favorite-lightbox,.toast,.context-menu,.menu-pop,.tavern-composer-popover'))return;
 if(!surface.getClientRects().length||getComputedStyle(surface).visibility==='hidden')return;
 const clone=surface.cloneNode(true) as HTMLElement;
 clone.classList.add('studio-motion-ghost');clone.inert=true;clone.setAttribute('aria-hidden','true');clone.removeAttribute('role');clone.removeAttribute('id');
 for(const node of clone.querySelectorAll('[id],[autofocus],[role]')){node.removeAttribute('id');node.removeAttribute('autofocus');node.removeAttribute('role');}
 // StrictMode's rehearsal reconnects the same host; do not create a phantom overlay.
 queueMicrotask(()=>{if(host.isConnected||motionReduced())return;document.body.append(clone);ghosts.add(clone);
  const animation=clone.animate([{opacity:1},{opacity:0}],{duration:STUDIO_MOTION.exit,easing:STUDIO_MOTION.exitEase});
  const remove=()=>{clone.remove();ghosts.delete(clone);};animation.addEventListener('finish',remove,{once:true});animation.addEventListener('cancel',remove,{once:true});
  window.setTimeout(remove,STUDIO_MOTION.exit+100);
 });
}
