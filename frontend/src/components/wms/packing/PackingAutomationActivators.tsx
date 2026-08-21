import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import type { OrderAutomationRule } from "../../../types/orderAutomation";
import type { PackingAutomationButtonsPosition } from "../../../types/wmsPackingExtendedUi";
import { loadOrderAutomationModuleSettings } from "../../../utils/orderAutomationLocalStore";
import { migrateManualTrigger, resolveManualTriggerColor } from "../../../utils/orderAutomationManualTrigger";
import {
  activatorButtonLabel,
  createExclusiveActivatorRunGate,
  packingAutomationActivatorRules,
  runOrderAutomationActivator,
} from "../../../utils/orderAutomationRun";

type Props = {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  /** Ustawienie „Wyświetlaj Aktywatory Automatyzacji…”. */
  showAutomationButtons: boolean;
  position: PackingAutomationButtonsPosition;
  onToast?: (message: string) => void;
  onError?: (message: string) => void;
  onStatusChanged?: () => void;
};

/**
 * Aktywatory ręcznych akcji automatycznych na ekranie pakowania.
 * Widoczność: showAutomationButtons + reguły z „Pakowanie WMS”.
 * Wykonanie: backend POST /automations/{id}/run.
 */
export function PackingAutomationActivators({
  tenantId,
  warehouseId,
  orderId,
  showAutomationButtons,
  position,
  onToast,
  onError,
  onStatusChanged,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rules, setRules] = useState<OrderAutomationRule[]>([]);
  const runGateRef = useRef(createExclusiveActivatorRunGate());

  useEffect(() => {
    if (!showAutomationButtons) {
      setRules([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await packingAutomationActivatorRules(tenantId, warehouseId);
        if (!cancelled) setRules(rows);
      } catch {
        if (!cancelled) setRules([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showAutomationButtons, tenantId, warehouseId]);

  const onRun = useCallback(
    async (rule: OrderAutomationRule) => {
      const moduleSettings = loadOrderAutomationModuleSettings(tenantId, warehouseId);
      if (moduleSettings.executionMode === "confirm") {
        const ok = window.confirm(moduleSettings.confirmMessage);
        if (!ok) return;
      }

      if (!runGateRef.current.tryBegin(rule.id)) return;
      setBusyId(rule.id);
      try {
        const result = await runOrderAutomationActivator({
          tenantId,
          warehouseId,
          orderId,
          rule,
          sourceLabel: "pakowania WMS",
        });
        onToast?.(result.successMessage);
        onStatusChanged?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Nie udało się wykonać akcji.";
        onError?.(msg);
      } finally {
        runGateRef.current.end(rule.id);
        setBusyId(null);
      }
    },
    [tenantId, warehouseId, orderId, onToast, onError, onStatusChanged],
  );

  if (!showAutomationButtons || rules.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="packing-automation-activators"
      aria-label="Aktywatory automatyzacji"
      data-position={position}
    >
      {rules.map((rule) => {
        const mt = migrateManualTrigger(rule.manualTrigger);
        const label = activatorButtonLabel(rule);
        const bg = resolveManualTriggerColor(mt.color);
        const busy = busyId === rule.id;
        const anyBusy = busyId != null;
        const Icon = getManualIconComponent(mt.iconKey || "Zap");
        return (
          <button
            key={rule.id}
            type="button"
            disabled={anyBusy}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: bg }}
            onClick={() => void onRun(rule)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
