import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./App";
import "./index.css";
import { log, error as logError } from "./utils/logger";

log("[APP] boot start");

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
  logError("[promise rejection]", e.reason);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
