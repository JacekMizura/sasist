import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { filterToolbarBtnApply } from "../../components/filters/filterUiTokens";
import type { DemandBatchLineDraft } from "@/api/productionPlanningApi";
import BatchesListPage from "./BatchesListPage";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { ProductionDemandPlanningPanel } from "./components/ProductionDemandPlanningPanel";
import { useProductionDemandPlanning } from "./hooks/useProductionDemandPlanning";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

export default function ProductionPlanningPage() {
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [modalOpen, setModalOpen] = useState(false);
  const [initialLines, setInitialLines] = useState<DemandBatchLineDraft[] | undefined>(undefined);

  const {
    data,
    loading,
    error,
    coverageDays,
    setCoverageDays,
    customCoverageInput,
    setCustomCoverageInput,
    applyCustomCoverage,
    reload,
  } = useProductionDemandPlanning(tenantId, warehouseId);

  const openBatchModal = useCallback((lines: DemandBatchLineDraft[], label: string) => {
    if (lines.length === 0) {
      toast.error("Brak pozycji do utworzenia partii dla wybranego zapotrzebowania.");
      return;
    }
    setInitialLines(lines);
    setModalOpen(true);
    toast.success(`Przygotowano partię (${label}): ${lines.length} produkt(ów).`);
  }, []);

  if (!hasActiveWarehouse) {
    return <ActiveWarehouseRequiredBanner />;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Planowanie produkcji</h2>
          <p className="mt-1 text-sm text-slate-500">
            Zapotrzebowanie MRP, partie masowe i agregacja materiałów.
          </p>
        </div>
        <button
          type="button"
          disabled={warehouseId == null}
          onClick={() => {
            setInitialLines(undefined);
            setModalOpen(true);
          }}
          className={filterToolbarBtnApply}
        >
          <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
          Nowa partia masowa
        </button>
      </div>

      {warehouseId != null ? (
        <ProductionDemandPlanningPanel
          data={data}
          loading={loading}
          error={error}
          coverageDays={coverageDays}
          customCoverageInput={customCoverageInput}
          onCoverageDaysChange={setCoverageDays}
          onCustomCoverageInputChange={setCustomCoverageInput}
          onApplyCustomCoverage={applyCustomCoverage}
          onReload={() => void reload()}
          onCreateBatch={openBatchModal}
        />
      ) : null}

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Aktywne partie</h3>
        <BatchesListPage embedded />
      </div>

      {warehouseId != null ? (
        <CreateBatchModal
          open={modalOpen}
          tenantId={tenantId}
          warehouseId={warehouseId}
          initialLines={initialLines}
          onClose={() => {
            setModalOpen(false);
            setInitialLines(undefined);
          }}
          onCreated={(id) => {
            setModalOpen(false);
            setInitialLines(undefined);
            navigate(erpProductionPaths.batch(id));
          }}
        />
      ) : null}
    </div>
  );
}
