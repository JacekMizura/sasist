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
          { label: "Drukarki" },
        ]}
        title="Drukarki"
        description="Agenci Windows, drukarki podłączone do agentów i domyślne urządzenia do druku z Sasist."
        tabs={PRINTING_SETTINGS_TABS}
        tabsExact={false}
        tabsAriaLabel="Drukarki — sekcje"
      >
        <Outlet />
      </SettingsModuleStack>
    </PageLayout>
  );
}
