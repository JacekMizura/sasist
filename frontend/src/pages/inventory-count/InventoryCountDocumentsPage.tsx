import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listInventoryDocuments, type InventoryDocumentRead } from "../../api/inventoryCountApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";

const STATUS_PL: Record<string, string> = {
  draft: "Szkic",
  planned: "Zaplanowana",
  in_progress: "W trakcie",
  awaiting_approval: "Do zatwierdzenia",
  approved: "Zatwierdzona",
  posted: "Zaksięgowana",
};

export default function InventoryCountDocumentsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const [rows, setRows] = useState<InventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInventoryDocuments(tenantId, { warehouseId: warehouse?.id });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouse?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Dokumenty inwentaryzacji</h2>
        <Link
          to={erpInventoryCountPaths.wizard}
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
        >
          Nowy
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Numer</th>
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pokrycie</th>
                <th className="px-4 py-3">Różnice</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link to={erpInventoryCountPaths.document(r.id)} className="font-medium text-teal-700 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.inventory_type}</td>
                  <td className="px-4 py-3">{STATUS_PL[r.status] ?? r.status}</td>
                  <td className="px-4 py-3 tabular-nums">{r.coverage_percent}%</td>
                  <td className="px-4 py-3 tabular-nums">{r.difference_lines}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Brak dokumentów. Utwórz pierwszą inwentaryzację w kreatorze.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
