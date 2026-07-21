import { Outlet } from "react-router-dom";

import DevScannerPanel from "../components/wms/DevScannerPanel";
import { ScanFeedbackOverlay } from "../components/wms/execution/ScanFeedbackOverlay";
import { WMS_Z } from "../components/wms/execution/wmsLayoutTokens";
import { WmsMessageProvider } from "../components/wms/WmsMessageProvider";
import { WmsPickingCartProvider } from "../context/WmsPickingCartContext";
import { WarehouseExecutionProvider } from "../context/WarehouseExecutionContext";
import { WmsScannerProvider } from "../context/WmsScannerContext";
import WmsTopBar from "./WmsTopBar";
import WmsWarehouseAccessGate from "./WmsWarehouseAccessGate";
import { WmsOperationalModeGate } from "../pages/wms/WmsOperationalModeGate";

/**
 * Unified WMS shell — one top navigation for every mode (picking, recovery, braki, packing, …).
 * Workflow headers live inside page content, not as duplicate fixed layers.
 * Background: white (#ffffff) — no grey page fills in WMS operator UI.
 */
function WmsLayoutChrome() {
  return (
    <div className="flex h-screen min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0" style={{ zIndex: WMS_Z.topNav }}>
        <WmsTopBar />
      </div>
      <ScanFeedbackOverlay />
      <main className="min-h-0 w-full max-w-none flex-1 overflow-y-auto bg-white">
        <WmsWarehouseAccessGate>
          <WmsOperationalModeGate>
            <Outlet />
          </WmsOperationalModeGate>
        </WmsWarehouseAccessGate>
      </main>
    </div>
  );
}

export default function WmsOperationalLayout() {
  return (
    <WarehouseExecutionProvider>
      <WmsScannerProvider>
        <WmsPickingCartProvider>
          <WmsMessageProvider>
            <DevScannerPanel />
            <WmsLayoutChrome />
          </WmsMessageProvider>
        </WmsPickingCartProvider>
      </WmsScannerProvider>
    </WarehouseExecutionProvider>
  );
}
