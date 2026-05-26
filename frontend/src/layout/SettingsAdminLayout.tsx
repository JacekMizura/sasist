import { Outlet } from "react-router-dom";

import ErpShellLayout from "./ErpShellLayout";

/**
 * Ustawienia, administratorzy, dokumenty, moduły `/admin/*` — ten sam sidebar ERP co w panelu,
 * ale zawsze standardowy nagłówek (bez paska operacyjnego z dashboardu).
 * Montowany wyłącznie jako layout-route w {@link ../App.tsx}.
 */
export default function SettingsAdminLayout() {
  return (
    <ErpShellLayout headerMode="settings">
      <Outlet />
    </ErpShellLayout>
  );
}
