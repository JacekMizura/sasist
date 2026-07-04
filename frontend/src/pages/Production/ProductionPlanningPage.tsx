import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import {
  createBatchesFromSimulation,
  simulateProductionPlan,
  type DemandBatchLineDraft,
  type ProductionPlanSimulation,
} from "@/api/productionPlanningApi";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { filterToolbarBtnApply } from "../../components/filters/filterUiTokens";
import BatchesListPage from "./BatchesListPage";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { ProductionDemandPlanningPanel } from "./components/ProductionDemandPlanningPanel";
import { ProductionSimulationModal } from "./components/ProductionSimulationModal";
import { useProductionDemandPlanning } from "./hooks/useProductionDemandPlanning";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

export default function ProductionPlanningPage() {
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [modalOpen, setModalOpen] = useState(false);
  const [initialLines, setInitialLines] = useState<DemandBatchLineDraft[] | undefined>(undefined);
  const [simOpen, setSimOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simCreating, setSimCreating] = useState(false);
  const [simulation, setSimulation] = useState<ProductionPlanSimulation | null>(null);

  const planning = useProductionDemandPlanning(tenantId, warehouseId);

  const openBatchModal = useCallback((lines: DemandBatchLineDraft[], label: string) => {
    if (lines.length === 0) {
      toast.error("Brak pozycji do utworzenia partii.");
      return;
    }
    setInitialLines(lines);
    setModalOpen(true);
    toast.success(`Przygotowano partię (${label}): ${lines.length} produkt(ów).`);
  }, []);

  const runSimulation = useCallback(async () => {
    if (warehouseId == null) return;
    setSimOpen(true);
    setSimLoading(true);
    setSimulation(null);
    try {
      const result = await simulateProductionPlan({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        coverage_days: planning.coverageDays,
      });
      setSimulation(result);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Symulacja nie powiodła się.");
      setSimOpen(false);
    } finally {
      setSimLoading(false);
    }
  }, [warehouseId, tenantId, planning.coverageDays]);

  const confirmCreateFromSimulation = useCallback(async () => {
    if (warehouseId == null) return;
    setSimCreating(true);
    try {
      const { batch_ids } = await createBatchesFromSimulation({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        coverage_days: planning.coverageDays,
      });
      toast.success(`Utworzono ${batch_ids.length} partię/partie.`);
      setSimOpen(false);
      if (batch_ids[0]) navigate(erpProductionPaths.batch(batch_ids[0]));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć partii.");
    } finally {
      setSimCreating(false);
    }
  }, [warehouseId, tenantId, planning.coverageDays, navigate]);

  if (!hasActiveWarehouse) {
    return <ActiveWarehouseRequiredBanner />;
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Planowanie produkcji</h2>
          <p className="mt-1 text-sm text-slate-500">MRP — prognoza, rekomendacje, symulacja i partie masowe.</p>
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
          data={planning.data}
          loading={planning.loading}
          error={planning.error}
          coverageDays={planning.coverageDays}
          customCoverageInput={planning.customCoverageInput}
          onCoverageDaysChange={planning.setCoverageDays}
          onCustomCoverageInputChange={planning.setCustomCoverageInput}
          onApplyCustomCoverage={planning.applyCustomCoverage}
          onReload={() => void planning.reload()}
          onSimulate={() => void runSimulation()}
          simulateBusy={simLoading}
          onCreateBatch={openBatchModal}
        />
      ) : null}

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Aktywne partie</h3>
        <BatchesListPage embedded />
      </div>

      <ProductionSimulationModal
        open={simOpen}
        loading={simLoading}
        simulation={simulation}
        onClose={() => setSimOpen(false)}
        onConfirmCreate={() => void confirmCreateFromSimulation()}
        creating={simCreating}
      />

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
