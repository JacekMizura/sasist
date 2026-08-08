import { useCallback, useMemo, useState } from "react";
import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import { patchOrderUiStatus } from "../../../api/orderUiStatusApi";
import type { OrderAutomationRule } from "../../../types/orderAutomation";
import type { PackingAutomationButtonsPosition } from "../../../types/wmsPackingExtendedUi";
import {
  appendAutomationExecutionLog,
  loadAutomationRules,
  loadOrderAutomationModuleSettings,
  newUid,
} from "../../../utils/orderAutomationLocalStore";
import { migrateManualTrigger, resolveManualTriggerColor } from "../../../utils/orderAutomationManualTrigger";

type Props = {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  /** Ustawienie „Wyświetlaj Aktywatory Automatyzacji…”. */
  showAutomationButtons: boolean;
  position: PackingAutomationButtonsPosition;
  onToast?: (message: string) => void;
  onStatusChanged?: () => void;
};

function packingVisibleRules(tenantId: number, warehouseId: number): OrderAutomationRule[] {
  return loadAutomationRules(tenantId, warehouseId, "orders").filter((rule) => {
    if (!rule.enabled) return false;
    const mt = migrateManualTrigger(rule.manualTrigger);
    if (!mt.enabled) return false;
    if (mt.buttonEnabled === false) return false;
    // Tylko reguły z „Pakowanie WMS”.
    return mt.visibleOnWmsPacking !== false;
  });
}

async function runRuleOnOrder(opts: {
  tenantId: number;
  warehouseId: number;
  orderId: number;
  rule: OrderAutomationRule;
}): Promise<string[]> {
  const executed: string[] = [];
  for (const effect of opts.rule.effects ?? []) {
    if (effect.kind === "change_status") {
      const raw = effect.payload.order_ui_status_id;
      const statusId = Number(raw);
      if (!Number.isFinite(statusId) || statusId <= 0) {
        throw new Error("Brak statusu w akcji automatycznej.");
      }
      await patchOrderUiStatus(opts.orderId, opts.tenantId, opts.warehouseId, statusId);
      executed.push(`change_status→${statusId}`);
    }
  }
  return executed;
}

/**
 * Aktywatory ręcznych akcji automatycznych na ekranie pakowania.
 * Widoczność sterowana wyłącznie przez showAutomationButtons + flagę „Pakowanie WMS”.
 */
export function PackingAutomationActivators({
  tenantId,
  warehouseId,
  orderId,
  showAutomationButtons,
  position,
  onToast,
  onStatusChanged,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const rules = useMemo(() => {
    if (!showAutomationButtons) return [];
    return packingVisibleRules(tenantId, warehouseId);
  }, [showAutomationButtons, tenantId, warehouseId]);

  const onRun = useCallback(
    async (rule: OrderAutomationRule) => {
      if (busyId) return;
      const moduleSettings = loadOrderAutomationModuleSettings(tenantId, warehouseId);
      if (moduleSettings.executionMode === "confirm") {
        const ok = window.confirm(moduleSettings.confirmMessage);
        if (!ok) return;
      }
      setBusyId(rule.id);
      try {
        const effectsExecuted = await runRuleOnOrder({
          tenantId,
          warehouseId,
          orderId,
          rule,
        });
        appendAutomationExecutionLog(tenantId, warehouseId, {
          id: newUid("log"),
          ts: new Date().toISOString(),
          ruleId: rule.id,
          ruleName: rule.name,
          level: "success",
          message: "Uruchomiono z pakowania WMS",
          orderId: String(orderId),
          effectsExecuted,
          kind: "execution",
        });
        onToast?.(`Wykonano: ${rule.manualTrigger.label.trim() || rule.name}`);
        onStatusChanged?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Nie udało się wykonać akcji.";
        appendAutomationExecutionLog(tenantId, warehouseId, {
          id: newUid("log"),
          ts: new Date().toISOString(),
          ruleId: rule.id,
          ruleName: rule.name,
          level: "error",
          message: msg,
          orderId: String(orderId),
          kind: "execution",
        });
        onToast?.(msg);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, tenantId, warehouseId, orderId, onToast, onStatusChanged],
  );

  if (!showAutomationButtons || rules.length === 0) return null;

  const positionClass =
    position === "right"
      ? "flex flex-col items-stretch gap-2"
      : position === "floating"
        ? "fixed bottom-4 right-4 z-40 flex max-w-sm flex-wrap justify-end gap-2"
        : "flex flex-wrap items-center gap-2";

  return (
    <div className={positionClass} data-testid="packing-automation-activators" aria-label="Aktywatory automatyzacji">
      {rules.map((rule) => {
        const mt = migrateManualTrigger(rule.manualTrigger);
        const label = mt.label.trim() || rule.name || "Akcja";
        const bg = resolveManualTriggerColor(mt.color);
        const busy = busyId === rule.id;
        const Icon = getManualIconComponent(mt.iconKey || "Zap");
        return (
          <button
            key={rule.id}
            type="button"
            disabled={busy || busyId != null}
            onClick={() => void onRun(rule)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: bg }}
            title={mt.shortcut?.trim() ? `${label} (${mt.shortcut.trim()})` : label}
          >
            {mt.iconSource === "custom" && mt.customImageDataUrl ? (
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
