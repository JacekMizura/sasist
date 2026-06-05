import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import DevScannerPanel from "../components/wms/DevScannerPanel";
import { ACTIVE_OPERATION_CONTEXT_BAR_OFFSET } from "../components/wms/execution/activeOperationContext";
import { ExecutionGlobalContextBar } from "../components/wms/execution/ExecutionGlobalContextBar";
import { WmsExecutionModeStrip } from "../components/wms/execution/WmsExecutionModeStrip";
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
  const showExecutionChrome = warehouseMode && isWarehouseExecutionRoute(pathname);

  useEffect(() => {
    if (showExecutionChrome) {
      document.documentElement.style.setProperty("--wms-active-ctx-offset", ACTIVE_OPERATION_CONTEXT_BAR_OFFSET);
    } else {
      document.documentElement.style.removeProperty("--wms-active-ctx-offset");
    }
    return () => document.documentElement.style.removeProperty("--wms-active-ctx-offset");
  }, [showExecutionChrome]);

  return (
    <div className="flex h-screen min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-white">
      {showExecutionChrome ? (
        <div className="sticky top-0 z-50 shrink-0">
          <WmsExecutionModeStrip />
          <ExecutionGlobalContextBar />
        </div>
      ) : hideMenuTopBar ? null : (
        <WmsTopBar />
      )}
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