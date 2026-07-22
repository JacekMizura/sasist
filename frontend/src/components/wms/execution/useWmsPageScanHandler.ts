import { useEffect } from "react";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import type { WmsScanHandler } from "../../../utils/wmsScanDispatch";

/** Register page scan handler with automatic cleanup (global WMS scan SSOT). */
export function useWmsPageScanHandler(handler: WmsScanHandler | null, enabled = true) {
  const { registerScanHandler } = useWmsScanner();

  useEffect(() => {
    if (!enabled || !handler) {
      registerScanHandler(null);
      return () => registerScanHandler(null);
    }
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [enabled, handler, registerScanHandler]);
}
