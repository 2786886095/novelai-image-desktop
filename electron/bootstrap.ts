// Keep the recovery helper out of normal startup/IPC and before Chromium ready.
if (process.env.LANGBAI_CREDENTIAL_HELPER === "1") {
  require("./credential-helper").runCredentialHelper();
} else {
  try {
    require("./main");
  } catch (error) {
    const { app, dialog } = require("electron") as typeof import("electron");
    dialog.showErrorBox("启动失败 / Startup failed", String(error));
    app.quit();
  }
}
