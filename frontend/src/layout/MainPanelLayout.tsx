import { Outlet } from "react-router-dom";

import ErpShellLayout from "./ErpShellLayout";

/**
 * Panel główny: zamówienia, asortyment, analityka, dashboard z kartami na stronie `/dashboard`.
 * Top bar: {@link ../components/layout/topbar/AppTopBar} w {@link ./ErpShellLayout}.
 * Montowany wyłącznie jako layout-route w {@link ../App.tsx} (ścieżka bez `path`, potomkowie z `path="..."`).
 */
export default function MainPanelLayout() {
  return (
    <ErpShellLayout headerMode="panel">
      <Outlet />
    </ErpShellLayout>
  );
}
