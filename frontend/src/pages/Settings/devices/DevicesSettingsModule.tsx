import { Navigate, Route, Routes } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import type { TabItem } from "../../../components/TopTabsNavigation";
import { AgentsPanel } from "./AgentsPanel";
import { DEVICES_SETTINGS_BASE } from "./constants";
import { DeviceDetailPanel } from "./DeviceDetailPanel";
import { EventsPanel } from "./EventsPanel";
import { InventoryPanel } from "./InventoryPanel";

const TABS: TabItem[] = [
  { path: `${DEVICES_SETTINGS_BASE}/agents`, label: "Agenci" },
  { path: `${DEVICES_SETTINGS_BASE}/inventory`, label: "Urządzenia" },
  { path: `${DEVICES_SETTINGS_BASE}/events`, label: "Zdarzenia" },
  { path: "/settings/printers/queue", label: "Druk (kolejka)" },
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
          <Route index element={<Navigate to="agents" replace />} />
          <Route path="agents" element={<AgentsPanel />} />
          <Route path="inventory" element={<InventoryPanel />} />
          <Route path="device/:deviceId" element={<DeviceDetailPanel />} />
          <Route path="events" element={<EventsPanel />} />
          <Route path="*" element={<Navigate to="agents" replace />} />
        </Routes>
      </SettingsModuleStack>
    </PageLayout>
  );
}
