import {installStudioMotion} from './motion-system';
import {unlockCompletionSound} from "./completion-sound";
import {ImageCopySupport} from "./image-copy";
import { ImagePasteSupport } from "./image-paste";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";
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

installStudioAgent();
installStudioMotion();
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
        const { action, remember } = await confirmWindowClose(text);
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
