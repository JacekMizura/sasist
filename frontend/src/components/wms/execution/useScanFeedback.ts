import { useCallback } from "react";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import {
  useWarehouseExecution,
  type ScanFeedbackKind,
} from "../../../context/WarehouseExecutionContext";
import { playScanFeedbackSound, vibrateScanHint } from "./scanFeedbackUtils";

export function useScanFeedback() {
  const { pulseScanFeedback } = useWarehouseExecution();
  const { showScannerError, showScannerToast, refocusScannerInput, appendScanToHistory } =
    useWmsScanner();

  const feedback = useCallback(
    (kind: ScanFeedbackKind, message?: string, opts?: { history?: string }) => {
      pulseScanFeedback(kind);
      playScanFeedbackSound(kind);
      vibrateScanHint(kind);
      if (opts?.history) appendScanToHistory(opts.history);
      if (message) {
        if (kind === "success") showScannerToast(message);
        else showScannerError(message);
      }
      refocusScannerInput();
    },
    [
      appendScanToHistory,
      pulseScanFeedback,
      refocusScannerInput,
      showScannerError,
      showScannerToast,
    ],
  );

  return {
    feedback,
    success: (message?: string, history?: string) =>
      feedback("success", message, history ? { history } : undefined),
    error: (message: string) => feedback("error", message),
    conflict: (message: string) => feedback("conflict", message),
    warning: (message: string) => feedback("warning", message),
  };
}
