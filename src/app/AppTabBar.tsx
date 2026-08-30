import { useMemo } from "react";
import clsx from "clsx";
import { Icon } from "../components/icons";
import { getLocalizedTabItems } from "../i18n";
import { useAppStore } from "../store";

export default function AppTabBar() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const language = useAppStore((state) => state.settings?.language);
  const tabItems = useMemo(() => getLocalizedTabItems(language), [language]);

  return (
    <div className="tab-bar">
      {tabItems.map(({ value, label, icon, title }) => (
        <button
          key={value}
          className={clsx(activeTab === value && "active")}
          title={title}
          onClick={() => setActiveTab(value)}
        >
          <span className="tab-icon"><Icon name={icon} /></span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

