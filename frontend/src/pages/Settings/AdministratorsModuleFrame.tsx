import { Plus } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { SettingsModuleStack } from "../../components/layout/SettingsModuleStack";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { ADMINISTRATORS_TABS } from "./administratorsTabs";

/**
 * Shared chrome for all tabbed routes under `/settings/administrators/*`
 * (edit/create routes stay outside this layout in {@link AdministratorsLayout}).
 *
 * Pixel-parity with Ustawienia → Użytkownicy screenshots:
 * Home > Ustawienia > Użytkownicy → bare underline tabs (+ orange CTA on list tab).
 */
export default function AdministratorsModuleFrame() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isUserListTab = pathname === "/settings/administrators" || pathname === "/settings/administrators/";

  const addUserCta = isUserListTab ? (
    <button
      type="button"
      onClick={() => navigate("/settings/administrators/new")}
      className={brandPrimaryButtonClass}
    >
      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      Dodaj użytkownika
    </button>
  ) : null;

  return (
    <SettingsModuleStack
      breadcrumbs={[
        { label: "Ustawienia", to: "/settings/company" },
        { label: "Użytkownicy" },
      ]}
      hideTitle
      tabs={ADMINISTRATORS_TABS}
      tabsExact
      tabsChrome="bare"
      tabsTrailing={addUserCta}
      tabsAriaLabel="Moduł Użytkownicy"
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
