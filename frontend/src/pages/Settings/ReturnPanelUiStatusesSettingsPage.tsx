import { Navigate } from "react-router-dom";

/** Legacy URL — konfigurator statusów panelu jest w zakładce Statusy modułu zwrotów. */
export default function ReturnPanelUiStatusesSettingsPage() {
  return <Navigate to="/orders/returns/statuses" replace />;
}
