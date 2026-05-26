import { scanFeedbackFlashClass } from "./scanFeedbackUtils";
import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";

/** Full-screen flash on scan result (green / red / yellow / orange). */
export function ScanFeedbackOverlay() {
  const { scanFeedback } = useWarehouseExecution();
  if (!scanFeedback) return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-[200] animate-pulse ${scanFeedbackFlashClass(scanFeedback)}`}
    />
  );
}
