import { Link, useNavigate } from "react-router-dom";
import { FlaskConical, Plus, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import toast from "react-hot-toast";

import {
  createBatchesFromSimulation,
  runStockReplenishment,
  simulateProductionPlan,
  type DemandBatchLineDraft,
  type ProductionPlanSimulation,
} from "@/api/productionPlanningApi";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { ProductionDemandPlanningPanel, ProductionDemandProductsTable } from "./components/ProductionDemandPlanningPanel";
import { ProductionSimulationModal } from "./components/ProductionSimulationModal";
import { useProductionDemandPlanning } from "./hooks/useProductionDemandPlanning";
import { erpProductionPaths } from "./productionPaths";
import {
  productionPageStackClass,
  productionPageTitleClass,
  productionSectionLabelClass,
} from "./productionLayoutTokens";
import {
  PageHeader,
  SecondaryButton,
  Toolbar,
  primaryButtonClassName,
} from "@/design-system";

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
  const [replenishmentRunning, setReplenishmentRunning] = useState(false);

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

  const runReplenishment = useCallback(async () => {
    if (warehouseId == null) return;
    setReplenishmentRunning(true);
    try {
      const result = await runStockReplenishment({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
      });
      if (!result.enabled) {
        toast.error("Włącz „Automatyczne uzupełnianie zapasu” w ustawieniach produkcji.");
        return;
      }
      const made = result.created_count + result.aggregated_count;
      if (made === 0) {
        toast.success("Brak nowych zleceń uzupełnienia zapasu.");
      } else {
        toast.success(
          `Utworzono ${made} zlecenia produkcyjne na łącznie ${result.total_quantity} szt.`,
        );
      }
      await planning.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć zleceń uzupełnienia.");
    } finally {
      setReplenishmentRunning(false);
    }
  }, [warehouseId, tenantId, planning]);

  const runSimulation = useCallback(async () => {
    if (warehouseId == null) return;
    setSimOpen(true);
    setSimLoading(true);
    setSimulation(null);
    try {
      const recommendationLines = (planning.data?.products ?? [])
        .filter((p) => p.recommended_quantity > 0 && p.composition_id != null)
        .map((p) => ({ product_id: p.product_id, quantity: p.recommended_quantity }));
      const result = await simulateProductionPlan({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        coverage_days: planning.coverageDays,
        ...(recommendationLines.length > 0 ? { lines: recommendationLines } : {}),
      });
      setSimulation(result);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Symulacja nie powiodła się.");
      setSimOpen(false);
    } finally {
      setSimLoading(false);
    }
  }, [warehouseId, tenantId, planning.coverageDays, planning.data?.products]);

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

  const refreshPlanFromSimulation = useCallback(async () => {
    await planning.reload();
    if (warehouseId == null) return;
    setSimLoading(true);
    setSimulation(null);
    try {
      // No request lines — backend rebuilds recommendations from a fresh snapshot.
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
  }, [planning, warehouseId, tenantId]);

  if (!hasActiveWarehouse) {
    return <ActiveWarehouseRequiredBanner />;
  }

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Planowanie</h1>}
        actions={
          <>
            <Link to={erpProductionPaths.createOrder} className={primaryButtonClassName()}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Utwórz zlecenie
              </span>
            </Link>
            <SecondaryButton
              type="button"
              disabled={warehouseId == null}
              onClick={() => {
                setInitialLines(undefined);
                setModalOpen(true);
              }}
            >
              Partia masowa
            </SecondaryButton>
          </>
        }
        toolbar={
          <Toolbar
            end={
              <>
                <SecondaryButton
                  type="button"
                  disabled={warehouseId == null || planning.loading || simLoading}
                  onClick={() => void runSimulation()}
                  className="inline-flex items-center gap-1.5"
                >
                  <FlaskConical className="h-4 w-4" aria-hidden />
                  Symuluj plan produkcji
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  disabled={warehouseId == null || planning.loading}
                  onClick={() => void planning.reload()}
                  className="inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-4 w-4 ${planning.loading ? "animate-spin" : ""}`} aria-hidden />
                  Odśwież
                </SecondaryButton>
              </>
            }
          />
        }
      >
        <div className="space-y-4">
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
              onCreateBatch={openBatchModal}
              onRecalculateDemand={() => void planning.reload()}
              onCreateReplenishmentOrders={() => void runReplenishment()}
              replenishmentRunning={replenishmentRunning}
            />
          ) : null}

          <div>
            <h3 className={productionSectionLabelClass}>Co wyprodukować</h3>
            <p className="mt-1 text-sm text-slate-600">
              Rekomendacje na podstawie stanu, sprzedaży i zamówień. Aktywne zlecenia znajdziesz w zakładce
              Zlecenia.
            </p>
          </div>

          {warehouseId != null ? (
            <ProductionDemandProductsTable
              products={planning.data?.products ?? []}
              loading={planning.loading}
              onCreateBatch={openBatchModal}
            />
          ) : null}
        </div>
      </PageHeader>

      <ProductionSimulationModal
        open={simOpen}
        loading={simLoading}
        simulation={simulation}
        onClose={() => setSimOpen(false)}
        onConfirmCreate={() => void confirmCreateFromSimulation()}
        creating={simCreating}
        onRefreshPlan={() => void refreshPlanFromSimulation()}
        onChangeHorizon={() => setSimOpen(false)}
        onChangeStrategy={() => setSimOpen(false)}
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
            navigate(`${erpProductionPaths.orders}?highlight=batch-${id}`);
          }}
        />
      ) : null}
    </div>
  );
}
