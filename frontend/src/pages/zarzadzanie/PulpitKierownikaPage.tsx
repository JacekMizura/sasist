import { RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  PageHeader,
  SecondaryButton,
  StatusBadge,
  typography,
} from "@/design-system";
import { TabsNav } from "../../components/layout/TabsNav";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList/ModuleListBreadcrumb";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import CentrumOperacyjnePage from "../centrum-operacyjne/CentrumOperacyjnePage";
import { useSupplyFlowPlan } from "../wms/supply-flow/hooks/useSupplyFlowPlan";
import { ShiftConductor } from "./ShiftConductor";
import { getPulpitTabId, PULPIT_TABS } from "./pulpitTabs";
import { resolveShiftHealth, shiftHealthLabel } from "./shiftHealth";
import { usePulpitOpsSummary } from "./usePulpitOpsSummary";

/**
 * Pulpit kierownika — PageHeader + TabsNav (SASIST), bez accordionów.
 */
export default function PulpitKierownikaPage() {
  const { pathname } = useLocation();
  const tab = getPulpitTabId(pathname);
  const { hasActiveWarehouse, warehouseId } = useActiveWarehouseContext();
  const { board, loading, refreshing, error, refresh } = useSupplyFlowPlan(
    hasActiveWarehouse ? warehouseId : null,
  );
  const { summary: ops } = usePulpitOpsSummary(hasActiveWarehouse ? warehouseId : null);

  const health = resolveShiftHealth(board, ops);
  const healthTone =
    health === "critical" ? "danger" : health === "decision" ? "warning" : "success";
  const healthLabel =
    loading && !board.hasPlan && !board.emptyGuide ? "Sprawdzam…" : shiftHealthLabel(health);

  return (
    <div className="min-w-0 space-y-4 pb-6">
      <PageHeader
        breadcrumbs={
          <ModuleListBreadcrumb
            items={[
              { label: "Zarządzanie", to: "/zarzadzanie-magazynem/pulpit" },
              { label: "Pulpit kierownika" },
            ]}
          />
        }
        title={<h1 className={typography.h1}>Pulpit kierownika</h1>}
        status={
          <StatusBadge tone={healthTone} density="compact">
            {healthLabel}
          </StatusBadge>
        }
        actions={
          <SecondaryButton
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing || loading || !hasActiveWarehouse}
            aria-label="Odśwież stan zmiany"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Odśwież
          </SecondaryButton>
        }
      />

      <TabsNav
        items={PULPIT_TABS.map((t) => ({
          path: t.path,
          label: t.label,
          end: t.end,
        }))}
        className="no-scrollbar w-full overflow-x-auto"
        aria-label="Pulpit kierownika"
      />

      {tab === "decyzja" ? (
        <ShiftConductor
          board={board}
          ops={ops}
          loading={loading}
          error={error}
          hasActiveWarehouse={hasActiveWarehouse}
          refresh={refresh}
        />
      ) : (
        <CentrumOperacyjnePage embedInPulpit pulpitSection={tab} />
      )}
    </div>
  );
}
