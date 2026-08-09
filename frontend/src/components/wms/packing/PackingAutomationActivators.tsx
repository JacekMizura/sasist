import { useCallback, useMemo, useRef, useState } from "react";
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
 * Wykonanie: wspólny runner ({@link runOrderAutomationActivator}).
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
  const runGateRef = useRef(createExclusiveActivatorRunGate());

  const rules = useMemo(() => {
    if (!showAutomationButtons) return [];
    return packingAutomationActivatorRules(tenantId, warehouseId);
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
            data-testid={`packing-automation-activator-${rule.id}`}
            data-busy={busy ? "true" : "false"}
            disabled={anyBusy}
            aria-busy={busy}
            onClick={() => void onRun(rule)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: bg }}
            title={mt.shortcut?.trim() ? `${label} (${mt.shortcut.trim()})` : label}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2.25} aria-hidden />
            ) : mt.iconSource === "custom" && mt.customImageDataUrl ? (
              <img src={mt.customImageDataUrl} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
            ) : (
              <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
