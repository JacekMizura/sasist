import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./App";
/** Self-hosted Inter (400–700) — no fonts.gstatic.com / Google Fonts CDN. */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
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

// StrictMode intentionally omitted: in DEV it remounts every component on first mount,
// which detaches <img src="/uploads/..."> mid-flight and shows as NS_BINDING_ABORTED in Firefox
// (Metody dostawy / ShippingMethodLogo). Production builds already no-op StrictMode checks;
// keeping the remount behaviour in DEV caused a false “broken uploads” signal.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
