import { Outlet } from "react-router-dom";

import ErpShellLayout from "./ErpShellLayout";

/**
 * Panel główny: zamówienia, asortyment, analityka, dashboard z kartami na stronie `/dashboard`.
 * Cienki pasek KPI na wszystkich stronach panelu: {@link ../components/layout/PanelGlobalStatusStrip} w {@link ./ErpShellLayout}.
 * Montowany wyłącznie jako layout-route w {@link ../App.tsx} (ścieżka bez `path`, potomkowie z `path="..."`).
 */
export default function MainPanelLayout() {
  return (
    <ErpShellLayout headerMode="panel">
      <Outlet />
    </ErpShellLayout>
  );
}
