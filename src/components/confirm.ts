import {manageModalPortal,motionReduced} from '../motion-system';
let confirmationId=0;
import {useAppStore} from '../store';
import {featureKey,featureText} from '../feature-text';
/** Promise-based in-app confirmation used instead of blocking browser dialogs. */
export function confirmAction(message: string, title = "请确认", choice?:{label:string;onChange:(checked:boolean)=>void}, signal?:AbortSignal, buttonLabels?:{confirm:string;cancel:string}): Promise<boolean> {
  return new Promise((resolve) => {
    if(signal?.aborted){resolve(false);return;}
    let settled = false;
    let release=()=>{},enterFrame=0;
    const titleId=`app-confirm-title-${++confirmationId}`;
    const backdrop = document.createElement("div");
    backdrop.className = "app-confirm-backdrop";
    backdrop.innerHTML = `
      <section class="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <h3 id="${titleId}"></h3>
        <p></p>
        <div class="app-confirm-actions">
          <button type="button" data-result="cancel"></button>
          <button type="button" class="primary" data-result="confirm"></button>
        </div>
      </section>`;
    const heading = backdrop.querySelector("h3");
    const body = backdrop.querySelector("p");
    const option=choice?document.createElement('label'):null;
    if(option && choice){
      option.className='checkbox-line';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=false;
      const text=document.createElement('span');text.textContent=choice.label;
      checkbox.addEventListener('change',()=>choice.onChange(checkbox.checked));
      option.append(checkbox,text);body?.after(option);
    }
    const titleKey=featureKey(title),messageKey=featureKey(message);
    const render=()=>{
      const language=useAppStore.getState().settings?.language;
      if (heading) heading.textContent = featureText(language,titleKey);
      if (body) body.textContent = featureText(language,messageKey);
      if(option && choice)option.querySelector('span')!.textContent=featureText(language,featureKey(choice.label));
      backdrop.querySelector('[data-result="cancel"]')!.textContent=featureText(language,featureKey(buttonLabels?.cancel??'取消'));
      backdrop.querySelector('[data-result="confirm"]')!.textContent=featureText(language,featureKey(buttonLabels?.confirm??'确认'));
    };
    render();const unsubscribe=useAppStore.subscribe(render);
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      signal?.removeEventListener('abort',abort);
      window.cancelAnimationFrame(enterFrame);
      // The remainder is visual-only: release hit-testing and modal locks before resolving.
      backdrop.inert=true;backdrop.setAttribute('aria-hidden','true');backdrop.style.pointerEvents='none';
      backdrop.classList.remove('is-visible');backdrop.classList.add('is-leaving');
      release();
      window.setTimeout(()=>backdrop.remove(),motionReduced()?0:160);
      resolve(value);
    };
    backdrop.addEventListener("click", (event) => {
      if(settled)return;event.stopPropagation();
      const target = event.target as HTMLElement;
      if (target === backdrop || target.closest('[data-result="cancel"]')) finish(false);
      if (target.closest('[data-result="confirm"]')) finish(true);
    });
    backdrop.addEventListener("keydown", (event) => {
      if(settled)return;
      if (event.key === "Escape") {event.preventDefault();event.stopPropagation();finish(false);return;}
      if (event.key === "Tab") {
        const buttons=Array.from(backdrop.querySelectorAll<HTMLElement>('button,input'));
        const index=buttons.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();event.stopPropagation();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
      }
    });
    const abort=()=>finish(false);
    signal?.addEventListener('abort',abort,{once:true});
    document.body.appendChild(backdrop);
    release=manageModalPortal(backdrop);
    enterFrame=window.requestAnimationFrame(()=>{if(!settled)backdrop.classList.add('is-visible')});
    (backdrop.querySelector('[data-result="cancel"]') as HTMLElement | null)?.focus();
    if(signal?.aborted)abort();
  });
}
