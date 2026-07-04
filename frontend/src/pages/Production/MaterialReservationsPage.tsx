import { useCallback, useEffect, useState } from "react";

import { fetchMaterialReservations, type MaterialReservationRead } from "@/api/productionApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { useWarehouse } from "@/context/WarehouseContext";

const DEFAULT_TENANT = 1;

export default function MaterialReservationsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [rows, setRows] = useState<MaterialReservationRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (warehouseId == null) return;
    setLoading(true);
    try {
      setRows(await fetchMaterialReservations(tenantId, warehouseId));
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn.</p>;
  }

  return (
    <div className="space-y-4 px-4 py-6 lg:px-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rezerwacje materiałów</h1>
          <p className="text-sm text-slate-500">Aktywne rezerwacje produkcji — lokalizacja, partia, ilość.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Odśwież
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Brak aktywnych rezerwacji materiałów.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Produkt</th>
                <th className="px-4 py-3">Lokalizacja</th>
                <th className="px-4 py-3">Ilość</th>
                <th className="px-4 py-3">Partia / LOT</th>
                <th className="px-4 py-3">SN</th>
                <th className="px-4 py-3">Dokument</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{r.product_name}</p>
                    {r.product_sku ? <p className="font-mono text-xs text-slate-500">{r.product_sku}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <LocationBadge code={r.location_code} type="PICK" />
                  </td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{r.quantity}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.batch_number || "—"}
                    {r.expiry_date ? ` · ${r.expiry_date}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.serial_number || "—"}</td>
                  <td className="px-4 py-3">{r.document_label || "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.operator_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
