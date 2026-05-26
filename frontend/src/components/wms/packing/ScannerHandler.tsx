import { useEffect } from "react";
import { useWmsScanner } from "../../../context/WmsScannerContext";

type Props = {
  onScan: (ean: string) => void;
  enabled: boolean;
};

/** Rejestruje globalny handler skanera WMS (scan-first). */
export function ScannerHandler({ onScan, enabled }: Props) {
  const { registerScanHandler } = useWmsScanner();

  useEffect(() => {
    if (!enabled) {
      registerScanHandler(null);
      return;
    }
    registerScanHandler((raw) => {
      onScan(raw);
    });
    return () => registerScanHandler(null);
  }, [enabled, onScan, registerScanHandler]);

  return null;
}
