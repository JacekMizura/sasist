import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Package } from "lucide-react";

import {
  fetchMaterialReservations,
  reserveBatchMaterials,
  reserveOrderMaterials,
  type MaterialReservationRead,
} from "@/api/productionApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { erpProductionPaths } from "../productionPaths";
import { productionModuleListTdClass, productionModuleListThClass } from "../productionLayoutTokens";
import { ProductionEmptyState } from "./ProductionEmptyState";

type Props = {
  tenantId: number;
  warehouseId: number;
  batchId?: number;
  orderId?: number;
  materialsReserved?: boolean;
  reservationsLocked?: boolean;
  status?: string;
  onChanged?: () => void;
};

export function DocumentMaterialReservationsPanel({
  tenantId,
  warehouseId,
  batchId,
  orderId,
  materialsReserved,
  reservationsLocked,
  status,
  onChanged,
}: Props) {
  const [rows, setRows] = useState<MaterialReservationRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!materialsReserved) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      setRows(
        await fetchMaterialReservations(tenantId, warehouseId, {
          batchId,
          orderId,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, batchId, orderId, materialsReserved]);

  useEffect(() => {
    void load();
  }, [load]);

  const canReserve =
    !materialsReserved &&
    !reservationsLocked &&
    (status === "planned" || status === "draft");

  const reserve = async () => {
    setBusy(true);
    try {
      if (batchId != null) {
        setRows(await reserveBatchMaterials(tenantId, batchId, warehouseId));
      } else if (orderId != null) {
        setRows(await reserveOrderMaterials(tenantId, orderId, warehouseId));
      }
      toast.success("Materiały zarezerwowane.");
      onChanged?.();
    } catch {
      toast.error("Rezerwacja materiałów nie powiodła się.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Rezerwacje materiałów</h2>
          <p className="text-sm text-slate-500">
            {materialsReserved
              ? reservationsLocked
                ? "Rezerwacje zablokowane — zbieranie w toku."
                : "Materiały zarezerwowane na lokalizacjach magazynowych."
              : "Materiały nie są jeszcze zarezerwowane."}
          </p>
        </div>
        <div className="flex gap-2">
          {canReserve ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void reserve()}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "Rezerwowanie…" : "Zarezerwuj materiały"}
            </button>
          ) : null}
          <Link
            to={erpProductionPaths.materialReservations}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Wszystkie rezerwacje
          </Link>
        </div>
      </div>

      {materialsReserved ? (
        loading ? (
          <p className="text-sm text-slate-500">Wczytywanie rezerwacji…</p>
        ) : rows.length === 0 ? (
          <ProductionEmptyState
            icon={Package}
            title="Brak aktywnych rezerwacji"
            description="Po zarezerwowaniu materiałów wiersze pojawią się tutaj z lokalizacjami poboru."
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
                      {r.lot ? ` · ${r.lot}` : ""}
                    </td>
                    <td className={`${productionModuleListTdClass} text-xs`}>{r.serial_number || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
