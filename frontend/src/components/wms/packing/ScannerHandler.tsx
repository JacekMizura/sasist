import { useEffect } from "react";
import { useWmsScanner } from "../../../context/WmsScannerContext";

/**
 * Podpina globalny skaner WMS do handlera ekranu pakowania.
 * Gdy ``enabled=false`` nie czyści handlera — bramka opakowań może go przejąć.
 */
export function ScannerHandler({
  onScan,
  enabled,
}: {
  onScan: (raw: string) => void;
  enabled: boolean;
}) {
  const { registerScanHandler } = useWmsScanner();

  useEffect(() => {
    if (!enabled) return;
    registerScanHandler((raw) => {
      onScan(raw);
    });
    return () => registerScanHandler(null);
  }, [enabled, onScan, registerScanHandler]);

  return null;
}
