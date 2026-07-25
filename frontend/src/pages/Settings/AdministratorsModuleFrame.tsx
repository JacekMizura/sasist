import { Plus } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { SettingsModuleStack } from "../../components/layout/SettingsModuleStack";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import { ADMINISTRATORS_TABS } from "./administratorsTabs";

/**
 * Shared chrome for all tabbed routes under `/settings/administrators/*`
 * (edit/create routes stay outside this layout in {@link AdministratorsLayout}).
 *
 * Reference Primary CTA for the whole app: „Dodaj użytkownika” via {@link PrimaryButton}.
 */
export default function AdministratorsModuleFrame() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isUserListTab = pathname === "/settings/administrators" || pathname === "/settings/administrators/";

  const addUserCta = isUserListTab ? (
    <PrimaryButton onClick={() => navigate("/settings/administrators/new")}>
      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      Dodaj użytkownika
    </PrimaryButton>
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
