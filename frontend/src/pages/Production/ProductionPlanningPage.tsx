import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useWarehouse } from "../../context/WarehouseContext";
import BatchesListPage from "./BatchesListPage";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { erpProductionPaths } from "./productionPaths";

export default function ProductionPlanningPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id;
  const warehouseId = warehouse?.id;
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-2 lg:px-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Planowanie produkcji</h2>
          <p className="text-sm text-slate-500">Partie masowe wieloproduktowe — agregacja materiałów i braków.</p>
        </div>
        <button
          type="button"
          disabled={warehouseId == null}
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden />
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
