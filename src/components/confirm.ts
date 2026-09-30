import {useAppStore} from '../store';
import {featureKey,featureText} from '../feature-text';
/** Promise-based in-app confirmation used instead of blocking browser dialogs. */
export function confirmAction(message: string, title = "请确认", choice?:{label:string;onChange:(checked:boolean)=>void}, signal?:AbortSignal, buttonLabels?:{confirm:string;cancel:string}): Promise<boolean> {
  return new Promise((resolve) => {
    if(signal?.aborted){resolve(false);return;}
    let settled = false;
    const backdrop = document.createElement("div");
    backdrop.className = "app-confirm-backdrop";
    backdrop.innerHTML = `
      <section class="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" tabindex="-1">
        <h3 id="app-confirm-title"></h3>
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
    const previousFocus=document.activeElement as HTMLElement | null;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      signal?.removeEventListener('abort',abort);
      backdrop.classList.add("is-leaving");
      window.setTimeout(() => backdrop.remove(), 130);
      resolve(value);
      previousFocus?.focus();
    };
    backdrop.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target === backdrop || target.closest('[data-result="cancel"]')) finish(false);
      if (target.closest('[data-result="confirm"]')) finish(true);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(false);
      if (event.key === "Tab") {
        const buttons=Array.from(backdrop.querySelectorAll<HTMLElement>('button,input'));
        const index=buttons.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
      }
    });
    const abort=()=>finish(false);
    signal?.addEventListener('abort',abort,{once:true});
    document.body.appendChild(backdrop);
    window.requestAnimationFrame(() => backdrop.classList.add("is-visible"));
    (backdrop.querySelector('[role="alertdialog"]') as HTMLElement | null)?.focus();
    if(signal?.aborted)abort();
  });
}
