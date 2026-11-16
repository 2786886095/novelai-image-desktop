import {installStudioMotion} from './motion-system';
import {unlockCompletionSound} from "./completion-sound";
import {ImageCopySupport} from "./image-copy";
import { ImagePasteSupport } from "./image-paste";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import classicStyles from "./styles.css?inline";
import redesignedStyles from "./styles-redesign.css?inline";
import shellStyles from "./shell/studio-shell.css?inline";
import paletteStyles from "./shell/qq-theme.css?inline";
import { attachDesktopLayoutStyles } from "./shell/desktop-layout";
import "./favorites.css";
import "./layout-motion.css";
import "./studio-interactions.css";
import "./studio-typography.css";
import "./studio-controls.css";
import "./typography.css";
import {FavoritesNoticeSupport} from "./components/LocalFavorites";
import {McpEventSupport} from "./components/McpServerSettings";
import {installStudioAgent} from './studio-agent';
import {confirmWindowClose} from './components/confirm';
import {windowTrayText} from './window-tray-text';
import {useAppStore} from './store';
import {installTaskTracker} from './shell/task-tracker';
import {shellText} from './shell/shell-text';
attachDesktopLayoutStyles(document, classicStyles, redesignedStyles, shellStyles + "\n" + paletteStyles);

installStudioAgent();
installStudioMotion();
installTaskTracker(useAppStore);
document.addEventListener("pointerdown", unlockCompletionSound, {once:true});
document.addEventListener("keydown", unlockCompletionSound, {once:true});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandledrejection]", event.reason);
});

function RendererReady() {
  React.useEffect(() => {
    const api = window.naiDesktop;
    const offChoice = api?.onCloseChoiceRequest?.((requestId, language) => {
      const text = windowTrayText(language);
      void api.acknowledgeCloseChoice(requestId).then(async accepted => {
        if (!accepted) return;
        const hints = shellText(language).closeConfirm;
        const { action, remember } = await confirmWindowClose({ ...text, trayHint: hints.trayHint, quitHint: hints.quitHint, cancelHint: hints.cancelHint });
        api.sendCloseChoice(requestId, action, remember);
      }).catch(() => api.sendCloseChoice(requestId, "cancel", false));
    });
    const offTrayError = api?.onCloseTrayUnavailable?.(message => useAppStore.getState().setToast(message));
    window.dispatchEvent(new Event('studio:renderer-ready'));
    return () => { offChoice?.(); offTrayError?.(); };
  }, []);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary scope="app" root>
      <ImagePasteSupport />
      <ImageCopySupport />
      <FavoritesNoticeSupport />
      <McpEventSupport />
      <App />
      <RendererReady />
    </AppErrorBoundary>
  </React.StrictMode>,
);
