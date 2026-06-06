import { useCallback, useState } from "react";

import { executeReplenishmentStep } from "../../api/operationalReplenishmentApi";
import { assignOperationalTask, transitionOperationalTask } from "../../api/operationalOrchestrationApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import type { ReplenishmentRow } from "../../utils/replenishmentRowModel";
import { safeTrim } from "../../utils/safeStrings";

export type ExecutionStep = "scan_source" | "scan_product" | "scan_target" | "complete";

export function useReplenishmentExecution(onDone: () => void) {
  const [activeRow, setActiveRow] = useState<ReplenishmentRow | null>(null);
  const [step, setStep] = useState<ExecutionStep>("scan_source");
  const [busy, setBusy] = useState(false);
  const [scanBuffer, setScanBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = useCallback((row: ReplenishmentRow) => {
    setActiveRow(row);
    setStep("scan_source");
    setScanBuffer("");
    setError(null);
  }, []);

  const close = useCallback(() => {
    setActiveRow(null);
    setScanBuffer("");
    setError(null);
  }, []);

  const assign = useCallback(
    async (taskId: number, operatorUserId: number) => {
      await assignOperationalTask(DAMAGE_TENANT_ID, taskId, operatorUserId);
      onDone();
    },
    [onDone],
  );

  const start = useCallback(
    async (taskId: number, operatorUserId: number) => {
      await assignOperationalTask(DAMAGE_TENANT_ID, taskId, operatorUserId, true);
      onDone();
    },
    [onDone],
  );

  const block = useCallback(
    async (taskId: number, note?: string) => {
      await executeReplenishmentStep(DAMAGE_TENANT_ID, taskId, { step: "block", note });
      onDone();
    },
    [onDone],
  );

  const escalate = useCallback(
    async (taskId: number, note?: string) => {
      await executeReplenishmentStep(DAMAGE_TENANT_ID, taskId, { step: "escalate", note });
      onDone();
    },
    [onDone],
  );

  const submitScan = useCallback(async () => {
    if (!activeRow || !safeTrim(scanBuffer)) return;
    setBusy(true);
    setError(null);
    try {
      await executeReplenishmentStep(DAMAGE_TENANT_ID, activeRow.taskId, {
        step,
        scan_code: safeTrim(scanBuffer),
      });
      if (step === "scan_source") setStep("scan_product");
      else if (step === "scan_product") setStep("scan_target");
      else if (step === "scan_target") {
        await executeReplenishmentStep(DAMAGE_TENANT_ID, activeRow.taskId, { step: "complete" });
        close();
        onDone();
        return;
      }
      setScanBuffer("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd wykonania");
    } finally {
      setBusy(false);
    }
  }, [activeRow, scanBuffer, step, close, onDone]);

  const completeDirect = useCallback(async () => {
    if (!activeRow) return;
    setBusy(true);
    try {
      await executeReplenishmentStep(DAMAGE_TENANT_ID, activeRow.taskId, { step: "complete" });
      close();
      onDone();
    } finally {
      setBusy(false);
    }
  }, [activeRow, close, onDone]);

  const transition = useCallback(
    async (taskId: number, state: string) => {
      await transitionOperationalTask(DAMAGE_TENANT_ID, taskId, state);
      onDone();
    },
    [onDone],
  );

  return {
    activeRow,
    step,
    busy,
    scanBuffer,
    setScanBuffer,
    error,
    open,
    close,
    assign,
    start,
    block,
    escalate,
    submitScan,
    completeDirect,
    transition,
  };
}
