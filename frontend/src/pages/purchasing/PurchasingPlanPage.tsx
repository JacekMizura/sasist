import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchPurchasingAlertsSummary } from "../../api/purchasingAlertsApi";
import { usePurchasingTenant } from "../../modules/purchasing/hooks/usePurchasingTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import PurchasingReplenishmentPage from "./PurchasingReplenishmentPage";
import PurchasingAlertsPage from "./PurchasingAlertsPage";
import PurchasingSegmentsPage from "./PurchasingSegmentsPage";
import PurchasingForecastPage from "./PurchasingForecastPage";
import { PlanSidePanel } from "./components/PlanSidePanel";
import type { PlanPanelId } from "./planPanelTypes";

export default function PurchasingPlanPage() {
  const { tenantId, refreshSignal } = usePurchasingTenant();
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const panel = (searchParams.get("panel") as PlanPanelId | null) ?? null;

  const [alertOpenCount, setAlertOpenCount] = useState<number | null>(null);

  const loadAlertBadge = useCallback(async () => {
    try {
      const s = await fetchPurchasingAlertsSummary(tenantId);
      setAlertOpenCount(s.open_alerts);
    } catch {
      setAlertOpenCount(null);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadAlertBadge();
  }, [loadAlertBadge, refreshSignal, selectedWarehouseId]);

  const openPanel = (id: PlanPanelId) => {
    const next = new URLSearchParams(searchParams);
    next.set("panel", id);
    if (!next.get("tenant_id")) next.set("tenant_id", String(tenantId));
    setSearchParams(next, { replace: false });
  };

  const closePanel = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next, { replace: true });
    void loadAlertBadge();
  };

  return (
    <>
      <PurchasingReplenishmentPage
        alertOpenCount={alertOpenCount}
        onOpenPanel={openPanel}
      />
      {panel === "alerts" ? (
        <PlanSidePanel
          title="Alerty zakupowe"
          subtitle="Problemy wymagające reakcji — skan, reguły i szkice zamówień."
          onClose={closePanel}
        >
          <PurchasingAlertsPage variant="panel" />
        </PlanSidePanel>
      ) : null}
      {panel === "segments" ? (
        <PlanSidePanel
          title="Priorytety asortymentu"
          subtitle="Segmentacja ABC/XYZ — mapa priorytetów i filtry uzupełniania."
          onClose={closePanel}
        >
          <PurchasingSegmentsPage variant="panel" />
        </PlanSidePanel>
      ) : null}
      {panel === "forecast" ? (
        <PlanSidePanel
          title="Prognoza zakupowa"
          subtitle="Trend sprzedaży, ryzyka zapasowe i inspektor produktu."
          onClose={closePanel}
        >
          <PurchasingForecastPage variant="panel" />
        </PlanSidePanel>
      ) : null}
    </>
  );
}
