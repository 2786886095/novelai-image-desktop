import { memo, startTransition, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { Icon } from "../components/icons";
import { getLocalizedTabItems } from "../i18n";
import { useAppStore } from "../store";

function AppTabBar() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const language = useAppStore((state) => state.settings?.language);
  const barRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ x: 0, width: 0, ready: false });
  const tabItems = useMemo(
    () => getLocalizedTabItems(language),
    [language],
  );

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const updateIndicator = () => {
      const active = bar.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (!active) return;
      const barRect = bar.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setIndicator({ x: rect.left - barRect.left, width: rect.width, ready: true });
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(bar);
    window.addEventListener("resize", updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [activeTab, tabItems]);

  return (
    <div
      ref={barRef}
      className="tab-bar"
      style={{
        "--tab-indicator-x": `${indicator.x}px`,
        "--tab-indicator-width": `${indicator.width}px`,
      } as CSSProperties}
    >
      <span className={clsx("tab-active-indicator", indicator.ready && "is-ready")} aria-hidden="true" />
      {tabItems.map(({ value, label, icon, title }) => (
        <button
          key={value}
          type="button"
          data-tab={value}
          className={clsx(activeTab === value && "active")}
          aria-label={title}
          aria-current={activeTab === value ? "page" : undefined}
          onClick={() => startTransition(() => setActiveTab(value))}
        >
          <span className="tab-icon"><Icon name={icon} /></span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default memo(AppTabBar);
