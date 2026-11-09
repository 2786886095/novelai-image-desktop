import {manageModalPortal,motionReduced} from '../motion-system';
let confirmationId=0;
import {useAppStore} from '../store';
import {featureKey,featureText} from '../feature-text';
/** Promise-based in-app confirmation used instead of blocking browser dialogs. */
type ConfirmationResult = "confirm" | "cancel" | "alternative";
type ConfirmationChoice = { label: string; onChange: (checked: boolean) => void };
type ConfirmationLabels = { confirm?: string; cancel?: string; alternative?: string; localized?: boolean };

export function confirmAction(message: string, title = "请确认", choice?: ConfirmationChoice, signal?: AbortSignal, buttonLabels?: ConfirmationLabels): Promise<boolean> {
  return showConfirmation(message, title, choice, signal, buttonLabels).then(result => result === "confirm");
}

export async function confirmWindowClose(text: { closeDetail: string; closeTitle: string; remember: string; hide: string; quit: string; cancel: string }) {
  let remember = false;
  const result = await showConfirmation(text.closeDetail, text.closeTitle, {
    label: text.remember, onChange: checked => { remember = checked; },
  }, undefined, { confirm: text.hide, alternative: text.quit, cancel: text.cancel, localized: true });
  const action = result === "confirm" ? "tray" : result === "alternative" ? "quit" : "cancel";
  return { action, remember: action !== "cancel" && remember } as const;
}

function showConfirmation(message: string, title: string, choice?: ConfirmationChoice, signal?: AbortSignal, buttonLabels?: ConfirmationLabels): Promise<ConfirmationResult> {
  return new Promise((resolve) => {
    if(signal?.aborted){resolve("cancel");return;}
    let settled = false;
    let release=()=>{},enterFrame=0;
    const titleId=`app-confirm-title-${++confirmationId}`;
    const backdrop = document.createElement("div");
    backdrop.className = "app-confirm-backdrop";
    backdrop.innerHTML = `
      <section class="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${titleId}-detail" tabindex="-1">
        <h3 id="${titleId}"></h3>
        <p id="${titleId}-detail"></p>
        <div class="app-confirm-actions">
          <button type="button" class="btn btn-secondary" data-result="cancel"></button>
          <button type="button" class="btn btn-primary primary" data-result="confirm"></button>
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
    const alternative = buttonLabels?.alternative ? document.createElement("button") : null;
    if (alternative) {
      alternative.type = "button";
      alternative.className = "btn btn-secondary";
      alternative.dataset.result = "alternative";
      backdrop.querySelector('[data-result="confirm"]')?.before(alternative);
    }
    const titleKey=featureKey(title),messageKey=featureKey(message);
    const render=()=>{
      const language=useAppStore.getState().settings?.language;
      const localized = (value: string, key = featureKey(value)) => buttonLabels?.localized ? value : featureText(language, key);
      if (heading) heading.textContent = localized(title, titleKey);
      if (body) body.textContent = localized(message, messageKey);
      if(option && choice)option.querySelector('span')!.textContent=localized(choice.label);
      backdrop.querySelector('[data-result="cancel"]')!.textContent=localized(buttonLabels?.cancel??'取消');
      backdrop.querySelector('[data-result="confirm"]')!.textContent=localized(buttonLabels?.confirm??'确认');
      if (alternative && buttonLabels?.alternative) alternative.textContent = localized(buttonLabels.alternative);
    };
    render();const unsubscribe=useAppStore.subscribe(render);
    const finish = (value: ConfirmationResult) => {
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
      if (target === backdrop || target.closest('[data-result="cancel"]')) finish("cancel");
      if (target.closest('[data-result="alternative"]')) finish("alternative");
      if (target.closest('[data-result="confirm"]')) finish("confirm");
    });
    backdrop.addEventListener("keydown", (event) => {
      if(settled)return;
      if (event.key === "Escape") {event.preventDefault();event.stopPropagation();finish("cancel");return;}
      if (event.key === "Tab") {
        const buttons=Array.from(backdrop.querySelectorAll<HTMLElement>('button,input'));
        const index=buttons.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();event.stopPropagation();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
      }
    });
    const abort=()=>finish("cancel");
    signal?.addEventListener('abort',abort,{once:true});
    document.body.appendChild(backdrop);
    release=manageModalPortal(backdrop);
    enterFrame=window.requestAnimationFrame(()=>{if(!settled)backdrop.classList.add('is-visible')});
    (backdrop.querySelector('[data-result="cancel"]') as HTMLElement | null)?.focus();
    if(signal?.aborted)abort();
  });
}
