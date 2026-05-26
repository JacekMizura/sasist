import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./App";
import "./index.css";

console.log("[APP] boot start");

window.onerror = (...args: unknown[]) => {
  console.error("[window.onerror]", ...args);
};
window.onunhandledrejection = (e: PromiseRejectionEvent) => {
  console.error("[promise rejection]", e.reason);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
