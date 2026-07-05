import { useCallback, useEffect, useState } from "react";
import { Package } from "lucide-react";

import { fetchMaterialReservations, type MaterialReservationRead } from "@/api/productionApi";
import { AppEmptyState } from "@/components/app-shell";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { useWarehouse } from "@/context/WarehouseContext";
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageDescClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";

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
    <div className={productionPageStackClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className={productionPageTitleClass}>Rezerwacje materiałów</h1>
          <p className={productionPageDescClass}>Aktywne rezerwacje produkcji — lokalizacja, partia, ilość.</p>
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
        <AppEmptyState
          icon={Package}
          title="Brak aktywnych rezerwacji"
          description="Rezerwacje materiałów pojawią się po zarezerwowaniu surowców dla partii lub zlecenia."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className={productionModuleListThClass}>Produkt</th>
                <th className={productionModuleListThClass}>Lokalizacja</th>
                <th className={productionModuleListThClass}>Ilość</th>
                <th className={productionModuleListThClass}>Partia / LOT</th>
                <th className={productionModuleListThClass}>SN</th>
                <th className={productionModuleListThClass}>Dokument</th>
                <th className={productionModuleListThClass}>Operator</th>
                <th className={productionModuleListThClass}>Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className={productionModuleListTdClass}>
                    <p className="font-medium text-slate-900">{r.product_name}</p>
                    {r.product_sku ? <p className="font-mono text-xs text-slate-500">{r.product_sku}</p> : null}
                  </td>
                  <td className={productionModuleListTdClass}>
                    <LocationBadge code={r.location_code} type="PICK" />
                  </td>
                  <td className={`${productionModuleListTdClass} tabular-nums font-semibold`}>{r.quantity}</td>
                  <td className={`${productionModuleListTdClass} text-xs text-slate-600`}>
                    {r.batch_number || "—"}
                    {r.expiry_date ? ` · ${r.expiry_date}` : ""}
                  </td>
                  <td className={`${productionModuleListTdClass} text-xs`}>{r.serial_number || "—"}</td>
                  <td className={productionModuleListTdClass}>{r.document_label || "—"}</td>
                  <td className={`${productionModuleListTdClass} text-xs`}>{r.operator_name || "—"}</td>
                  <td className={`${productionModuleListTdClass} text-xs text-slate-500`}>
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
