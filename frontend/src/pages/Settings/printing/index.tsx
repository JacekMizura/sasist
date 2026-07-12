import { Navigate, Route, Routes } from "react-router-dom";

import PrintersPage from "../PrintersPage";
import PrintingAutoPrintPage from "./PrintingAutoPrintPage";
import PrintingAgentsPage from "./PrintingAgentsPage";
import PrintingDefaultsPage from "./PrintingDefaultsPage";
import PrintingDevicesPage from "./PrintingDevicesPage";
import PrintingQueuePage from "./PrintingQueuePage";
import PrintingSettingsLayout from "./PrintingSettingsLayout";

export default function PrintingSettingsModule() {
  return (
    <Routes>
      <Route element={<PrintingSettingsLayout />}>
        <Route index element={<Navigate to="agents" replace />} />
        <Route path="agents" element={<PrintingAgentsPage />} />
        <Route path="devices" element={<PrintingDevicesPage />} />
        <Route path="queue" element={<PrintingQueuePage />} />
        <Route path="defaults" element={<PrintingDefaultsPage />} />
        <Route path="auto-print" element={<PrintingAutoPrintPage />} />
        <Route path="legacy" element={<PrintersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/settings/printers/agents" replace />} />
    </Routes>
  );
}
