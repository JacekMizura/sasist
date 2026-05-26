import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import { normalizeScanEan } from "../../../utils/wmsScanNormalize";
import { useScanFeedback } from "./useScanFeedback";

type Options<T> = {
  resolve: (scan: string) => Promise<T>;
  onResolved: (result: T, scan: string) => void;
  placeholder?: string;
  notFoundMessage?: string;
  enabled?: boolean;
};

/** Hub pattern: normalize → API resolve → navigate + scan feedback. */
export function useWmsScanResolveNavigate<T>({
  resolve,
  onResolved,
  placeholder = "Skanuj kod kreskowy",
  notFoundMessage = "Brak dopasowania dla skanu.",
  enabled = true,
}: Options<T>) {
  const navigate = useNavigate();
  const { setScannerInputPlaceholder, refocusScannerInput } = useWmsScanner();
  const scanFx = useScanFeedback();

  const onScan = useCallback(
    async (raw: string) => {
      if (!enabled) return;
      const scan = normalizeScanEan(raw);
      if (!scan) return;
      try {
        const result = await resolve(scan);
        scanFx.success(undefined, scan);
        onResolved(result, scan);
        refocusScannerInput();
      } catch {
        scanFx.error(notFoundMessage);
      }
    },
    [enabled, notFoundMessage, onResolved, refocusScannerInput, resolve, scanFx],
  );

  const bindPlaceholder = useCallback(() => {
    setScannerInputPlaceholder(placeholder);
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [placeholder, setScannerInputPlaceholder]);

  return { onScan, bindPlaceholder, navigate };
}
