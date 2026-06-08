import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, ScanLine } from "lucide-react";

import { listWmsInventoryTasks, openWmsInventorySession, type InventoryTaskRead } from "../../../api/inventoryCountApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";

export default function WmsInventoryCountTasksPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const warehouseId = warehouse?.id;
  const [tasks, setTasks] = useState<InventoryTaskRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const rows = await listWmsInventoryTasks(tenantId, warehouseId);
      setTasks(rows);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTask = async (task: InventoryTaskRead) => {
    if (!warehouseId) return;
    await openWmsInventorySession(tenantId, warehouseId, {
      document_id: task.inventory_document_id,
      task_id: task.id,
    });
    navigate(wmsInventoryCountPaths.count(task.id));
  };

  if (!warehouseId) {
    return <p className="text-lg text-slate-400">Wybierz magazyn w ustawieniach.</p>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <ScanLine className="h-8 w-8 text-teal-400" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inwentaryzacja</h1>
          <p className="text-sm text-slate-400">Zeskanuj lub wybierz zadanie liczenia</p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">Wczytywanie zadań…</p>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
          <p className="text-lg text-slate-300">Brak otwartych zadań liczenia</p>
          <p className="mt-2 text-sm text-slate-500">Wygeneruj zadania w ERP po uruchomieniu inwentaryzacji.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void openTask(t)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-5 text-left transition hover:border-teal-500 hover:bg-slate-800"
              >
                <div>
                  <p className="text-lg font-semibold">{t.task_number}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                    <MapPin className="h-4 w-4" />
                    {t.location_name ?? t.location_code ?? `Lokalizacja #${t.location_id}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tabular-nums text-teal-400">{t.progress_percent}%</p>
                  <p className="text-xs text-slate-500">postęp</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link to="/wms/menu" className="mt-8 inline-block text-sm text-slate-500 hover:text-slate-300">
        ← Menu WMS
      </Link>
    </div>
  );
}
