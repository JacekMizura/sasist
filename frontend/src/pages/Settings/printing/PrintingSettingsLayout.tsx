import { Outlet } from "react-router-dom";

import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import { PRINTING_SETTINGS_TABS } from "./printingSettingsTabs";

export default function PrintingSettingsLayout() {
  return (
    <SettingsModuleStack
      title="Drukarki"
      description="Agenci Windows, drukarki podłączone do agentów i domyślne urządzenia do druku z Sasist."
      tabs={PRINTING_SETTINGS_TABS}
      tabsExact={false}
      tabsAriaLabel="Drukarki — sekcje"
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
