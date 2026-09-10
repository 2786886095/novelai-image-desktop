import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { imageOutcomeText, type ImageFailureStage } from "./image-outcome";

export interface ImageFailureNotice {
  conversationId: string;
  messageId: string;
  stage: ImageFailureStage;
  message: string;
}

export function ImageFailureDialog({ failure, language, onClose, onOpen }: {
  failure: ImageFailureNotice; language: unknown; onClose: () => void; onOpen: () => void;
}) {
  const titleId = useId(), bodyId = useId();
  const dialog = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const text = imageOutcomeText(language);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => { setVisible(true); dialog.current?.querySelector<HTMLButtonElement>("button")?.focus(); });
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div className={`app-confirm-backdrop${visible ? " is-visible" : ""}`} style={{ zIndex: "var(--z-help)", "--surface": "var(--bg-canvas)" } as CSSProperties}>
      <section ref={dialog} className="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
        style={{ maxHeight: "80vh", overflowY: "auto", overflowWrap: "anywhere" }}
        onKeyDown={event => {
          if (event.key === "Escape") { event.stopPropagation(); onClose(); }
          if (event.key === "Tab") {
            const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button");
            if (!buttons?.length) return;
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }}>
        <h3 id={titleId}>{failure.stage === "proposal" ? text.proposalTitle : text.generationTitle}</h3>
        <p id={bodyId}>{failure.message}</p>
        <p>{text.retained}</p>
        <div className="app-confirm-actions">
          <button type="button" data-result="cancel" onClick={onClose}>{text.close}</button>
          <button type="button" className="primary" onClick={onOpen}>{text.open}</button>
        </div>
      </section>
    </div>, document.body,
  );
}
