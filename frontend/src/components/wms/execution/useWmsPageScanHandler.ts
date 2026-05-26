import { useEffect } from "react";
import { useWmsScanner } from "../../../context/WmsScannerContext";

/** Register page scan handler with automatic cleanup. */
export function useWmsPageScanHandler(
  handler: ((code: string) => void) | null,
  enabled = true,
) {
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
