import { Navigate } from "react-router-dom";

/**
 * Legacy Settings → Drukarki removed.
 * Device / Agent / printer mapping SSOT is Ustawienia WMS → Stanowiska.
 */
export default function PrintingSettingsModule() {
  return <Navigate to="/settings/wms/workstations" replace />;
}
