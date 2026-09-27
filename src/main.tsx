import {unlockCompletionSound} from "./completion-sound";
import {ImageCopySupport} from "./image-copy";
import { ImagePasteSupport } from "./image-paste";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";
import {installStudioAgent} from './studio-agent';

installStudioAgent();
document.addEventListener("pointerdown", unlockCompletionSound, {once:true});
document.addEventListener("keydown", unlockCompletionSound, {once:true});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandledrejection]", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary scope="app" root>
      <ImagePasteSupport />
      <ImageCopySupport />
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
