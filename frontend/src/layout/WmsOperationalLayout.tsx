import { Outlet, useLocation } from "react-router-dom";

import DevScannerPanel from "../components/wms/DevScannerPanel";
import { ScanFeedbackOverlay } from "../components/wms/execution/ScanFeedbackOverlay";
import { isWarehouseExecutionRoute } from "../components/wms/execution/executionRoutes";
import { WmsPickingCartProvider } from "../context/WmsPickingCartContext";
import { WarehouseExecutionProvider, useWarehouseExecution } from "../context/WarehouseExecutionContext";
import { WmsScannerProvider } from "../context/WmsScannerContext";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";
import WmsTopBar from "./WmsTopBar";

/**
 * Terminal WMS — wyłącznie dla `/wms/*`: zwarty pasek, bez menu ERP i bez szkieletu panelu zarządzania.
 * Tryb terminala ukrywa globalny pasek na trasach wykonawczych (scan-first).
 */
function WmsLayoutChrome() {
  const { pathname } = useLocation();
  const { warehouseMode } = useWarehouseExecution();
  const hideMenuTopBar = pathname === WMS_ROUTES.menu;
  const hideForExecution = warehouseMode && isWarehouseExecutionRoute(pathname);

  return (
    <div className="flex h-screen min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-white">
      {hideMenuTopBar || hideForExecution ? null : <WmsTopBar />}
      <ScanFeedbackOverlay />
      <main className="min-h-0 min-w-0 w-full flex-1 overflow-auto bg-white">
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