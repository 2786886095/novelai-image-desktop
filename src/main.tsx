import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./styles.css";

window.addEventListener("unhandledrejection", (event) => {
  console.error("[unhandledrejection]", event.reason);
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary scope="app" root>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
