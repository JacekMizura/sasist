import { Outlet } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import { PRINTING_SETTINGS_TABS } from "./printingSettingsTabs";

export default function PrintingSettingsLayout() {
  return (
    <PageLayout fullBleed>
      <SettingsModuleStack
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/company" },
          { label: "Urządzenia" },
        ]}
        title="Urządzenia"
        tabs={PRINTING_SETTINGS_TABS}
        tabsExact={false}
        tabsAriaLabel="Urządzenia — sekcje"
      >
        <Outlet />
      </SettingsModuleStack>
    </PageLayout>
  );
}
