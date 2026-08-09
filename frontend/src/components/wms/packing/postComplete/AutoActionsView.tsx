import { useEffect, useState } from "react";
import type { WmsPackingOrderDetailApi, WmsPackingPostPackStepApi } from "../../../../api/wmsPackingApi";
import { getWmsPackingSettings } from "../../../../api/wmsPackingSettingsApi";
import type { PackingAfterActionsBehavior } from "../../../../types/wmsPackingExtendedUi";
import type { WmsPackingAutoActions } from "../../../../types/wmsPackingSettings";
import { DAMAGE_TENANT_ID } from "../../../../pages/damage/damageShared";
import { ScannerHandler } from "../ScannerHandler";
import { AutoActionsShell } from "./AutoActionsShell";
import {
  AUTO_ACTIONS_FINAL_SCAN,
  buildAutoActionDisplaySteps,
} from "./autoActionsModel";

export type AutoActionsViewProps = {
  detail: WmsPackingOrderDetailApi;
  /** Wynik rzeczywistego potoku POST …/finish — bez fake ✓✓ z konfiguracji. */
  postPackPipeline?: WmsPackingPostPackStepApi[] | null;
  warehouseId: number | null;
  /** Efekt po akcjach — steruje komunikatem końcowym (nawigacja jest w kontrolerze). */
  afterActionsBehavior?: PackingAfterActionsBehavior;
  onBackToOrders: () => void;
  onBackToOrder: () => void;
  onEditSellasist: () => void;
  /** Skan produktu → resolve+pack następnego zamówienia w kolejce. */
  onResumeProductScan: (raw: string) => void | Promise<void>;
  resumeScanBusy: boolean;
};

/**
 * Ekran „Akcje automatyczne” po POST …/finish (tryb STAY / skan).
 * Kroki = włączone auto_actions; stany = rzeczywisty post_pack_pipeline.
 */
export function AutoActionsView({
  detail,
  postPackPipeline,
  warehouseId,
  afterActionsBehavior = "stay_here",
  onBackToOrders,
  onBackToOrder,
  onEditSellasist,
  onResumeProductScan,
  resumeScanBusy,
}: AutoActionsViewProps) {
  const [autoActions, setAutoActions] = useState<WmsPackingAutoActions | null>(null);

  useEffect(() => {
    if (warehouseId == null || warehouseId < 1) return;
    let cancelled = false;
    void getWmsPackingSettings(DAMAGE_TENANT_ID, warehouseId)
      .then((s) => {
        if (!cancelled) setAutoActions(s.auto_actions);
      })
      .catch(() => {
        if (!cancelled) setAutoActions(null);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const steps = buildAutoActionDisplaySteps({
    detail,
    autoActions,
    pipeline: postPackPipeline,
  });
  const hasError = steps.some((s) => s.state === "ERROR");
  const waitForScan = afterActionsBehavior === "stay_here";

  let footerMessage: string | null = null;
  let footerTone: "default" | "error" = "default";
  if (hasError) {
    footerMessage = "Część automatyzacji zakończyła się błędem — sprawdź status zamówienia.";
    footerTone = "error";
  } else if (waitForScan) {
    footerMessage = AUTO_ACTIONS_FINAL_SCAN;
  }

  return (
    <>
      <ScannerHandler onScan={onResumeProductScan} enabled={waitForScan && !resumeScanBusy && !hasError} />
      <AutoActionsShell
        detail={detail}
        steps={steps}
        onBackToOrders={onBackToOrders}
        onBackToOrder={onBackToOrder}
        onEditSellasist={onEditSellasist}
        footerMessage={footerMessage}
        footerTone={footerTone}
      />
    </>
  );
}
