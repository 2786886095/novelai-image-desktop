import {manageModalPortal,motionReduced} from '../motion-system';
import {naiAccountText} from '../nai-accounts-locales';
import './relay-recommendation-dialog.css';

let sequence=0;
/** Informational local dialog only. No website, account or credential request. */
export function confirmRelayRecommendation(language?:Parameters<typeof naiAccountText>[0]):Promise<boolean>{
 return new Promise(resolve=>{
  let settled=false,release=()=>{},frame=0;
  const id=`relay-intro-${++sequence}`;
  const host=document.createElement('div');host.className='app-confirm-backdrop relay-intro-backdrop';
  host.innerHTML=`<section class="app-confirm-dialog relay-intro-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-description" tabindex="-1">
   <header class="relay-intro-heading"><img width="40" height="40" alt="" aria-hidden="true"/><div><h3 id="${id}-title"></h3><span class="relay-intro-domain">nai.langbai.cc</span></div></header>
   <p class="relay-intro-description" id="${id}-description"></p>
   <figure class="relay-intro-preview"><img width="1193" height="766"/><figcaption></figcaption></figure>
   <div class="app-confirm-actions"><button type="button" class="btn btn-secondary" data-result="cancel"></button><button type="button" class="btn btn-primary primary" data-result="confirm"></button></div></section>`;
  host.querySelector('img')!.src=`${import.meta.env.BASE_URL}relay-brand/brand-mark.svg`;
  const preview=host.querySelector<HTMLImageElement>('.relay-intro-preview img')!;
  preview.src=`${import.meta.env.BASE_URL}relay-brand/site-preview.png`;
  preview.alt=naiAccountText(language,'relayPreviewAlt');
  host.querySelector('figcaption')!.textContent=naiAccountText(language,'relayPreviewCaption');
  host.querySelector('h3')!.textContent=naiAccountText(language,'relayRecommendation');
  host.querySelector('p')!.textContent=naiAccountText(language,'relayIntro');
  const back=host.querySelector<HTMLButtonElement>('[data-result="cancel"]')!;
  const enter=host.querySelector<HTMLButtonElement>('[data-result="confirm"]')!;
  back.textContent=naiAccountText(language,'relayBack');enter.textContent=naiAccountText(language,'relayVisit');
  const finish=(value:boolean)=>{
   if(settled)return;settled=true;window.cancelAnimationFrame(frame);
   host.inert=true;host.setAttribute('aria-hidden','true');host.style.pointerEvents='none';host.classList.remove('is-visible');host.classList.add('is-leaving');
   release();window.setTimeout(()=>host.remove(),motionReduced()?0:160);resolve(value);
  };
  back.addEventListener('click',()=>finish(false));enter.addEventListener('click',()=>finish(true));
  host.addEventListener('click',event=>{event.stopPropagation();if(event.target===host)finish(false);});
  host.addEventListener('keydown',event=>{
   event.stopPropagation();
   if(event.key==='Escape'){event.preventDefault();finish(false);}
   if(event.key==='Tab'){event.preventDefault();(document.activeElement===back?enter:back).focus();}
  });
  document.body.append(host);release=manageModalPortal(host);
  frame=window.requestAnimationFrame(()=>{if(!settled)host.classList.add('is-visible');});
  back.focus();
 });
}
