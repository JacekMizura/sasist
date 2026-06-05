import { scanFeedbackFlashClass } from "./scanFeedbackUtils";
import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";
import { WMS_Z } from "./wmsLayoutTokens";

/** Full-screen flash on scan result (green / red / yellow / orange). */
export function ScanFeedbackOverlay() {
  const { scanFeedback } = useWarehouseExecution();
  if (!scanFeedback) return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 animate-pulse ${scanFeedbackFlashClass(scanFeedback)}`}
      style={{ zIndex: WMS_Z.scanFlash }}
    />
  );
}
