import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Icon } from "../components/icons";
import { IconText } from "../components/ui";
import { desktopUiText, getChromeText } from "../i18n";
import { useAppStore } from "../store";
import { APP_NAME, APP_VERSION } from "../types";

const DOCS_URL = "https://docs.novelai.net/en/image/";
const APP_ICON_URL = "./icon.png";

export function AppTitleBar() {
  const account = useAppStore((state) => state.account);
  const refreshAccount = useAppStore((state) => state.refreshAccount);
  const language = useAppStore((state) => state.settings?.language);
  const t = useCallback((key: string) => desktopUiText(language, key), [language]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uiCapture") === "opusUsage") return;
    if (!account.hasToken || account.tierLevel !== 3) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshAccount();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [account.hasToken, account.tierLevel, refreshAccount]);

  return (
    <header className="title-bar">
      <div className="window-title">
        <img className="title-icon" src={APP_ICON_URL} alt="" />
        {APP_NAME}
        <span className="title-ver">v{APP_VERSION}</span>
      </div>
      <div className={clsx("title-account", account.hasToken && "online")}>
        <span className="pulse-dot" />
        {account.hasToken
          ? `${account.tierName ?? t("title.connected")} · Anlas ${account.anlasBalance ?? t("common.unknown")}${account.stale ? t("title.cached") : ""}`
          : t("title.notConnected")}
      </div>
      <div className="window-controls">
        <button aria-label="Minimize" onClick={() => window.naiDesktop.minimize()}><Icon name="minimize" /></button>
        <button aria-label="Maximize" onClick={() => window.naiDesktop.maximize()}><Icon name="maximize" /></button>
        <button aria-label="Close" className="close" onClick={() => window.naiDesktop.close()}>
          <Icon name="close" />
        </button>
      </div>
    </header>
  );
}

export function AppMenuBar({ openSettings }: { openSettings: () => void }) {
  const settings = useAppStore((state) => state.settings);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const [streamUpdating, setStreamUpdating] = useState(false);
  const chromeText = getChromeText(settings?.language);
  const streamEnabled = settings?.streamPreviewEnabled ?? true;

  const toggleStreamPreview = async () => {
    if (!settings || streamUpdating) return;
    setStreamUpdating(true);
    try {
      await window.naiDesktop.setSetting("streamPreviewEnabled", !streamEnabled);
      await refreshSettings();
    } finally {
      setStreamUpdating(false);
    }
  };

  return (
    <nav className="menu-bar compact-toolbar">
      <div className="menu-actions-row">
        <button
          type="button"
          className={clsx("menu-action", "stream-preview-toggle", streamEnabled && "active")}
          role="switch"
          aria-checked={streamEnabled}
          aria-label={`${chromeText.streamPreview}：${streamEnabled ? chromeText.streamOn : chromeText.streamOff}`}
          title={`${chromeText.streamPreview}：${streamEnabled ? chromeText.streamOn : chromeText.streamOff}`}
          disabled={!settings || streamUpdating}
          onClick={() => void toggleStreamPreview()}
        >
          <IconText icon={<Icon name={streamEnabled ? "eye" : "eyeOff"} />}>
            <span className="stream-preview-label">{chromeText.streamPreview}</span>
          </IconText>
          <span className="stream-preview-state" aria-hidden="true"><i /></span>
        </button>
        <button
          className="menu-action"
          onClick={() => settings?.outputDir && window.naiDesktop.openInExplorer(settings.outputDir)}
        >
          <IconText icon={<Icon name="folder" />}>{chromeText.outputDir}</IconText>
        </button>
        <button className="menu-action" onClick={openSettings}>
          <IconText icon={<Icon name="settings" />}>{chromeText.settings}</IconText>
        </button>
        <button className="menu-action" onClick={() => window.naiDesktop.openExternal(DOCS_URL)}>
          <IconText icon={<Icon name="help" />}>{chromeText.docs}</IconText>
        </button>
      </div>
    </nav>
  );
}
