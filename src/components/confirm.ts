import {manageModalPortal,motionReduced} from '../motion-system';
import './close-window-choice.css';
import './layout-choice.css';
let confirmationId=0;
import {useAppStore} from '../store';
import {featureKey,featureText} from '../feature-text';
/** Promise-based in-app confirmation used instead of blocking browser dialogs. */
type ConfirmationResult = "confirm" | "cancel" | "alternative";
type ConfirmationChoice = { label: string; onChange: (checked: boolean) => void };
type ConfirmationLabels = { confirm?: string; cancel?: string; alternative?: string; dismiss?: string; localized?: boolean };

export function confirmAction(message: string, title = "请确认", choice?: ConfirmationChoice, signal?: AbortSignal, buttonLabels?: ConfirmationLabels): Promise<boolean> {
  return showConfirmation(message, title, choice, signal, buttonLabels).then(result => result === "confirm");
}

type ConfirmationPreview = {label: string; src: string};
export function confirmLayoutIntro(message: string, title: string, signal: AbortSignal, labels: ConfirmationLabels, previews: readonly ConfirmationPreview[]) {
  return showConfirmation(message, title, undefined, signal, labels, {variant: "layout-choice", previews}).then(result => result === "confirm");
}

export async function confirmWindowClose(text: { closeDetail: string; closeTitle: string; remember: string; hide: string; closeQuit: string; cancel: string }) {
  let remember = false;
  const result = await showConfirmation(text.closeDetail, text.closeTitle, {
    label: text.remember, onChange: checked => { remember = checked; },
  }, undefined, { confirm: text.hide, alternative: text.closeQuit, cancel: text.cancel, localized: true }, {
    variant: "close-choice",
  });
  const action = result === "confirm" ? "tray" : result === "alternative" ? "quit" : "cancel";
  return { action, remember: action !== "cancel" && remember } as const;
}

type ConfirmationOptions = {
  /** Window close actions are guarded against
   *  carried-over clicks (double-click on the window close button, a press
   *  that started on another control, or key repeat). */
  variant?: "close-choice" | "layout-choice";
  previews?: readonly ConfirmationPreview[];
};

/** Pointer activations this soon after the dialog opens are treated as carry-over. */
export const CLOSE_CHOICE_GUARD_MS = 350;

function showConfirmation(message: string, title: string, choice?: ConfirmationChoice, signal?: AbortSignal, buttonLabels?: ConfirmationLabels, options: ConfirmationOptions = {}): Promise<ConfirmationResult> {
  return new Promise((resolve) => {
    if(signal?.aborted){resolve("cancel");return;}
    let settled = false;
    let release=()=>{},enterFrame=0;
    const titleId=`app-confirm-title-${++confirmationId}`;
    const closeChoice = options.variant === "close-choice";
    const layoutChoice = options.variant === "layout-choice";
    const guardActivation = closeChoice || layoutChoice;
    const backdrop = document.createElement("div");
    backdrop.className = closeChoice ? "app-confirm-backdrop is-window-close" : "app-confirm-backdrop";
    backdrop.innerHTML = `
      <section class="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${titleId}-detail" tabindex="-1">
        <h3 id="${titleId}"></h3>
        <p id="${titleId}-detail"></p>
        <div class="app-confirm-actions">
          <button type="button" class="btn btn-secondary" data-result="cancel"></button>
          <button type="button" class="btn btn-primary primary" data-result="confirm"></button>
        </div>
      </section>`;
    if (closeChoice) backdrop.querySelector(".app-confirm-dialog")?.classList.add("is-close-choice");
    const dialog = backdrop.querySelector("section");
    const heading = backdrop.querySelector("h3");
    const body = backdrop.querySelector("p");
    const dismiss = layoutChoice && buttonLabels?.dismiss ? document.createElement("button") : null;
    if (layoutChoice && dialog) {
      dialog.classList.add("is-layout-choice");
      dialog.setAttribute("role", "dialog");
      if (dismiss) {
        dismiss.type = "button";
        dismiss.className = "btn btn-icon app-layout-choice-dismiss";
        dismiss.dataset.result = "dismiss";
        dismiss.textContent = "×";
        dialog.prepend(dismiss);
      }
    }
    if (layoutChoice && dialog && options.previews?.length) {
      const grid = document.createElement("div");
      grid.className = "app-layout-choice-previews";
      for (const preview of options.previews) {
        const card = document.createElement("figure");
        const image = document.createElement("img");
        image.alt = "";
        image.width = 1180;
        image.height = 767;
        image.src = preview.src;
        const caption = document.createElement("figcaption");
        caption.textContent = preview.label;
        card.append(caption, image);
        grid.append(card);
      }
      body?.after(grid);
    }
    const option=choice?document.createElement('label'):null;
    if(option && choice){
      option.className=closeChoice?'checkbox-line close-choice-remember':'checkbox-line';
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
    const openedAt = performance.now();
    let pressed: Element | null = null;
    const setLabel = (button: Element | null, label: string) => {
      if (button) button.textContent = label;
    };
    const render=()=>{
      const language=useAppStore.getState().settings?.language;
      const localized = (value: string, key = featureKey(value)) => buttonLabels?.localized ? value : featureText(language, key);
      if (heading) heading.textContent = localized(title, titleKey);
      if (body) body.textContent = localized(message, messageKey);
      if(option && choice)option.querySelector('span')!.textContent=localized(choice.label);
      setLabel(backdrop.querySelector('[data-result="cancel"]'), localized(buttonLabels?.cancel??'取消'));
      setLabel(backdrop.querySelector('[data-result="confirm"]'), localized(buttonLabels?.confirm??'确认'));
      if (alternative && buttonLabels?.alternative) setLabel(alternative, localized(buttonLabels.alternative));
      if (dismiss && buttonLabels?.dismiss) {
        const label = localized(buttonLabels.dismiss);
        dismiss.setAttribute("aria-label", label);
        dismiss.title = label;
      }
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
    const pointerTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element === backdrop ? backdrop : element?.closest('[data-result]') ?? null;
    };
    backdrop.addEventListener("pointerdown", (event) => { pressed = pointerTarget(event.target); }, true);
    backdrop.addEventListener("click", (event) => {
      if(settled)return;event.stopPropagation();
      const target = event.target as HTMLElement;
      // Close choice: a pointer click only counts when it both started and
      // ended on the same action, and not in the first moments after opening.
      if (layoutChoice && target === backdrop) return;
      if (guardActivation && event.detail > 0) {
        const hit = pointerTarget(target);
        const accepted = hit !== null && hit === pressed && performance.now() - openedAt >= CLOSE_CHOICE_GUARD_MS;
        pressed = null;
        if (!accepted) return;
      }
      if (target === backdrop || target.closest('[data-result="cancel"],[data-result="dismiss"]')) finish("cancel");
      else if (target.closest('[data-result="alternative"]')) finish("alternative");
      else if (target.closest('[data-result="confirm"]')) finish("confirm");
    });
    backdrop.addEventListener("keydown", (event) => {
      if(settled)return;
      if (guardActivation && (event.repeat || (layoutChoice && performance.now() - openedAt < CLOSE_CHOICE_GUARD_MS)) && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); return; }
      if (event.key === "Escape") {event.preventDefault();event.stopPropagation();if(!layoutChoice)finish("cancel");return;}

      if (event.key === "Tab") {
        const buttons=Array.from(backdrop.querySelectorAll<HTMLElement>('button,input'));
        const index=buttons.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();event.stopPropagation();const next=index===-1?(event.shiftKey?buttons.length-1:0):(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length;
        buttons[next]?.focus();
      }
    });
    const abort=()=>finish("cancel");
    signal?.addEventListener('abort',abort,{once:true});
    document.body.appendChild(backdrop);
    release=manageModalPortal(backdrop);
    enterFrame=window.requestAnimationFrame(()=>{if(!settled)backdrop.classList.add('is-visible')});
    (layoutChoice ? dialog : backdrop.querySelector<HTMLElement>('[data-result="cancel"]'))?.focus();
    if(signal?.aborted)abort();
  });
}
