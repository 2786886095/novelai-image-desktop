/** Promise-based in-app confirmation used instead of blocking browser dialogs. */
export function confirmAction(message: string, title = "请确认"): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const backdrop = document.createElement("div");
    backdrop.className = "app-confirm-backdrop";
    backdrop.innerHTML = `
      <section class="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title">
        <h3 id="app-confirm-title"></h3>
        <p></p>
        <div class="app-confirm-actions">
          <button type="button" data-result="cancel">取消</button>
          <button type="button" class="primary" data-result="confirm">确认</button>
        </div>
      </section>`;
    const heading = backdrop.querySelector("h3");
    const body = backdrop.querySelector("p");
    if (heading) heading.textContent = title;
    if (body) body.textContent = message;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      backdrop.classList.add("is-leaving");
      window.setTimeout(() => backdrop.remove(), 130);
      resolve(value);
    };
    backdrop.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target === backdrop || target.closest('[data-result="cancel"]')) finish(false);
      if (target.closest('[data-result="confirm"]')) finish(true);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(false);
      if (event.key === "Enter") finish(true);
    });
    document.body.appendChild(backdrop);
    window.requestAnimationFrame(() => backdrop.classList.add("is-visible"));
    (backdrop.querySelector('[data-result="confirm"]') as HTMLButtonElement | null)?.focus();
  });
}
