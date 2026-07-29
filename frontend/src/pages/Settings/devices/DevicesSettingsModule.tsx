import { Navigate, Route, Routes } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import type { TabItem } from "../../../components/TopTabsNavigation";
import { DEVICES_SETTINGS_BASE } from "./constants";
import { DeviceDetailPanel } from "./DeviceDetailPanel";
import { EventsPanel } from "./EventsPanel";
import { InventoryPanel } from "./InventoryPanel";

/** Edge inventory / events only — Stanowiska live under Ustawienia WMS. */
const TABS: TabItem[] = [
  { path: `${DEVICES_SETTINGS_BASE}/inventory`, label: "Urządzenia" },
  { path: `${DEVICES_SETTINGS_BASE}/events`, label: "Zdarzenia" },
];

export default function DevicesSettingsModule() {
  return (
    <PageLayout fullBleed>
      <SettingsModuleStack
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/company" },
          { label: "Urządzenia" },
        ]}
        title="Urządzenia"
        tabs={TABS}
        tabsExact={false}
        tabsAriaLabel="Urządzenia edge"
      >
        <Routes>
          <Route index element={<Navigate to={`${DEVICES_SETTINGS_BASE}/inventory`} replace />} />
          <Route path="agents" element={<Navigate to="/settings/wms/workstations" replace />} />
          <Route path="inventory" element={<InventoryPanel />} />
          <Route path="device/:deviceId" element={<DeviceDetailPanel />} />
          <Route path="events" element={<EventsPanel />} />
          <Route path="*" element={<Navigate to={`${DEVICES_SETTINGS_BASE}/inventory`} replace />} />
        </Routes>
      </SettingsModuleStack>
    </PageLayout>
  );
}
