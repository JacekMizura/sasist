import { Plus } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { SettingsModuleStack } from "../../components/layout/SettingsModuleStack";
import { ADMINISTRATORS_TABS } from "./administratorsTabs";

/**
 * Shared chrome for all tabbed routes under `/settings/administrators/*`
 * (edit/create routes stay outside this layout in {@link AdministratorsLayout}).
 */
export default function AdministratorsModuleFrame() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isUserListTab = pathname === "/settings/administrators" || pathname === "/settings/administrators/";

  const primaryAction = isUserListTab ? (
    <button
      type="button"
      onClick={() => navigate("/settings/administrators/new")}
      className="relative z-10 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
    >
      <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
      Dodaj użytkownika
    </button>
  ) : null;

  return (
    <SettingsModuleStack
      breadcrumbs={[
        { label: "Ustawienia", to: "/settings/company" },
        { label: "Administratorzy" },
      ]}
      title="Administratorzy"
      actions={primaryAction}
      tabs={ADMINISTRATORS_TABS}
      tabsExact
      tabsAriaLabel="Moduł Administratorzy"
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
