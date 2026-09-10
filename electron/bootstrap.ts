// Keep the recovery helper out of normal startup/IPC and before Chromium ready.
if (process.env.LANGBAI_CREDENTIAL_HELPER === "1") {
  require("./credential-helper").runCredentialHelper();
} else {
  require("./main");
}
