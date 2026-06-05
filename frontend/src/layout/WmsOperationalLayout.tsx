import { Outlet, useLocation } from "react-router-dom";

import DevScannerPanel from "../components/wms/DevScannerPanel";
import { ExecutionGlobalContextBar } from "../components/wms/execution/ExecutionGlobalContextBar";
import { WmsExecutionModeStrip } from "../components/wms/execution/WmsExecutionModeStrip";
import { ScanFeedbackOverlay } from "../components/wms/execution/ScanFeedbackOverlay";
import { isWarehouseExecutionRoute } from "../components/wms/execution/executionRoutes";
import { WMS_Z } from "../components/wms/execution/wmsLayoutTokens";
import { WmsPickingCartProvider } from "../context/WmsPickingCartContext";
import { WarehouseExecutionProvider, useWarehouseExecution } from "../context/WarehouseExecutionContext";
import { WmsScannerProvider } from "../context/WmsScannerContext";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";
import WmsTopBar from "./WmsTopBar";

/**
 * Terminal WMS — AppShell: top chrome reserves space, page content scrolls below.
 * Only top nav + operational context bar are fixed in the shell (flex siblings, not overlays).
 */
function WmsLayoutChrome() {
  const { pathname } = useLocation();
  const { warehouseMode } = useWarehouseExecution();
  const hideMenuTopBar = pathname === WMS_ROUTES.menu;
  const showExecutionChrome = warehouseMode && isWarehouseExecutionRoute(pathname);

  return (
    <div className="flex h-screen min-h-0 w-full flex-1 flex-col overflow-hidden bg-slate-100">
      {showExecutionChrome ? (
        <div className="shrink-0" style={{ zIndex: WMS_Z.workflowBar }}>
          <WmsExecutionModeStrip />
          <ExecutionGlobalContextBar />
        </div>
      ) : hideMenuTopBar ? null : (
        <div className="shrink-0" style={{ zIndex: WMS_Z.topNav }}>
          <WmsTopBar />
        </div>
      )}
      <ScanFeedbackOverlay />
      <main className="min-h-0 w-full flex-1 overflow-y-auto bg-slate-100">
        <Outlet />
      </main>
    </div>
  );
}

export default function WmsOperationalLayout() {
  return (
    <WarehouseExecutionProvider>
      <WmsScannerProvider>
        <WmsPickingCartProvider>
          <DevScannerPanel />
          <WmsLayoutChrome />
        </WmsPickingCartProvider>
      </WmsScannerProvider>
    </WarehouseExecutionProvider>
  );
}
