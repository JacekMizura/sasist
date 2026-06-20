import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useActiveWarehouseContext } from "../../hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "../../components/layout/ActiveWarehouseRequiredBanner";
import { filterToolbarBtnApply } from "../../components/filters/filterUiTokens";
import BatchesListPage from "./BatchesListPage";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

export default function ProductionPlanningPage() {
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;
  const [modalOpen, setModalOpen] = useState(false);

  if (!hasActiveWarehouse) {
    return <ActiveWarehouseRequiredBanner />;
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Planowanie produkcji</h2>
          <p className="mt-1 text-sm text-slate-500">Partie masowe wieloproduktowe — agregacja materiałów i braków.</p>
        </div>
        <button
          type="button"
          disabled={warehouseId == null}
          onClick={() => setModalOpen(true)}
          className={filterToolbarBtnApply}
        >
          <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
          Nowa partia masowa
        </button>
      </div>

      <BatchesListPage embedded />

      {warehouseId != null ? (
        <CreateBatchModal
          open={modalOpen}
          tenantId={tenantId}
          warehouseId={warehouseId}
          onClose={() => setModalOpen(false)}
          onCreated={(id) => {
            setModalOpen(false);
            navigate(erpProductionPaths.batch(id));
          }}
        />
      ) : null}
    </div>
  );
}
