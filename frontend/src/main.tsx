import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./App";
import "./index.css";
import { log, error as logError } from "./utils/logger";
import {
  clearStaleChunkReloadFlag,
  recoverFromStaleChunkError,
} from "./utils/staleChunkRecovery";

log("[APP] boot start");

/** After a successful boot, allow future deploys to recover again — but not instantly (avoids reload loops). */
window.setTimeout(() => {
  clearStaleChunkReloadFlag();
}, 4000);

window.onerror = (message, source, lineno, colno, err) => {
  logError("[window.onerror]", {
    message,
    source,
    lineno,
    colno,
    stack: err?.stack,
    href: window.location.href,
    pathname: window.location.pathname,
  });
};
window.onunhandledrejection = (e: PromiseRejectionEvent) => {
  if (recoverFromStaleChunkError(e.reason)) {
    e.preventDefault();
    return;
  }
  logError("[promise rejection]", e.reason);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
