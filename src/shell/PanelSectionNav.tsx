import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useAppStore } from "../store";
import { normalizeAppLanguage } from "../i18n";

/** Landmarks inside the workbench parameter column. Only the ones present in
 *  the active panel are shown, so the same bar serves generate / img2img /
 *  enhance / inpaint / postprocess without per-panel wiring. */
const SECTIONS = [
  { id: "model", selector: '[data-panel-section="model"]' },
  { id: "refs", selector: '[data-panel-section="refs"]' },
  { id: "prompt", selector: '[data-panel-section="prompt"]' },
  { id: "size", selector: ".compact-resolution, .i2i-size-control, .inpaint-size-controls" },
  { id: "seed", selector: ".seed-mode-switch" },
  { id: "advanced", selector: ".prompt-advanced-button" },
  { id: "batch", selector: '[data-panel-section="batch"]' },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const LABELS: Record<string, Record<SectionId, string> & { aria: string }> = {
  "zh-CN": { aria: "参数分区", model: "模型", refs: "角色/参考", prompt: "提示词", size: "尺寸", seed: "种子", advanced: "高级", batch: "批量" },
  "zh-TW": { aria: "參數分區", model: "模型", refs: "角色/參考", prompt: "提示詞", size: "尺寸", seed: "種子", advanced: "進階", batch: "批次" },
  "en-US": { aria: "Parameter sections", model: "Model", refs: "Characters/refs", prompt: "Prompt", size: "Size", seed: "Seed", advanced: "Advanced", batch: "Batch" },
  "ja-JP": { aria: "パラメーター区分", model: "モデル", refs: "キャラ/参照", prompt: "プロンプト", size: "サイズ", seed: "シード", advanced: "詳細", batch: "一括" },
  "ko-KR": { aria: "매개변수 구역", model: "모델", refs: "캐릭터/참조", prompt: "프롬프트", size: "크기", seed: "시드", advanced: "고급", batch: "일괄" },
};

export function PanelSectionNav() {
  const language = useAppStore((state) => state.settings?.language);
  const labels = LABELS[normalizeAppLanguage(language)] ?? LABELS["zh-CN"];
  const root = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState<SectionId[]>([]);
  const [current, setCurrent] = useState<SectionId | null>(null);
  const manualPinRef = useRef<{ id: SectionId; clampedTop: number; until: number } | null>(null);

  const scroller = useCallback(() => root.current?.closest(".left-panel")?.querySelector<HTMLElement>(".panel-scroll") ?? null, []);

  useEffect(() => {
    const panel = root.current?.closest(".left-panel");
    if (!panel) return;
    let frame = 0;
    let scrollEl: HTMLElement | null = null;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = scroller();
        if (el !== scrollEl) {
          scrollEl?.removeEventListener("scroll", measure);
          scrollEl = el;
          manualPinRef.current = null;
          scrollEl?.addEventListener("scroll", measure, { passive: true });
        }
        if (!el) { setPresent([]); return; }
        const found = SECTIONS.filter((section) => el.querySelector(section.selector)).map((section) => section.id);
        setPresent((previous) => (previous.join() === found.join() ? previous : found));

        const pin = manualPinRef.current;
        if (pin && found.includes(pin.id)) {
          if (performance.now() < pin.until || Math.abs(el.scrollTop - pin.clampedTop) <= 8) {
            setCurrent(pin.id);
            return;
          }
          manualPinRef.current = null;
        }

        const top = el.getBoundingClientRect().top + 12;
        let active: SectionId | null = found[0] ?? null;
        for (const id of found) {
          const target = el.querySelector<HTMLElement>(SECTIONS.find((section) => section.id === id)!.selector);
          if (target && target.getBoundingClientRect().top <= top + 4) active = id;
        }
        if (el.scrollHeight > el.clientHeight + 8 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && found.length) {
          active = found[found.length - 1];
        }
        setCurrent(active);
      });
    };
    const observer = new MutationObserver(measure);
    observer.observe(panel, { childList: true, subtree: true });
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); scrollEl?.removeEventListener("scroll", measure); };
  }, [scroller]);

  if (present.length < 3) return <div ref={root} className="panel-section-nav is-empty" aria-hidden="true" />;
  return (
    <div ref={root} className="panel-section-nav" role="navigation" aria-label={labels.aria}>
      {present.map((id) => (
        <button
          type="button"
          key={id}
          className={clsx(current === id && "active")}
          aria-current={current === id ? "true" : undefined}
          onClick={() => {
            const el = scroller();
            const target = el?.querySelector<HTMLElement>(SECTIONS.find((section) => section.id === id)!.selector);
            if (!el || !target) return;
            const rawOffset = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 6;
            const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
            const clampedTop = Math.max(0, Math.min(maxScroll, rawOffset));
            manualPinRef.current = { id, clampedTop, until: performance.now() + 700 };
            setCurrent(id);
            el.scrollTo({ top: clampedTop, behavior: document.documentElement.classList.contains("motion-reduced") ? "auto" : "smooth" });
          }}
        >
          {labels[id]}
        </button>
      ))}
    </div>
  );
}
