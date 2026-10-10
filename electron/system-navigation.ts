import type { BrowserWindow } from "electron";

/** Send native Back to application state, never Chromium's URL history. */
export function wireSystemBack(window: BrowserWindow) {
  const send = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send("app:navigate-back");
  };
  window.on("app-command", (_event, command) => {
    if (command === "browser-backward") send();
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return;
    if (input.key === "BrowserBack" || input.key === "GoBack" ||
        (input.alt && !input.control && !input.meta && input.key === "ArrowLeft")) {
      event.preventDefault();
      send();
    }
  });
}
