import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./App";
import "./index.css";

console.log("[APP] boot start");

window.onerror = (message, source, lineno, colno, error) => {
  console.error("[window.onerror]", {
    message,
    source,
    lineno,
    colno,
    stack: error?.stack,
    href: window.location.href,
    pathname: window.location.pathname,
  });
};
window.onunhandledrejection = (e: PromiseRejectionEvent) => {
  console.error("[promise rejection]", e.reason);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
