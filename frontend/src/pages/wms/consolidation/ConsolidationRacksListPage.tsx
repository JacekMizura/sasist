import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Layers, Pencil, Plus, Trash2 } from "lucide-react";

import api from "../../../api/axios";
import { AppEmptyState } from "../../../components/app-shell/AppEmptyState";
import { useWarehouse } from "../../../context/WarehouseContext";
import { CartsListPageHeader } from "../../../modules/carts/CartsListPageHeader";
import {
  cartsBtnPrimary,
  cartsDangerBtnClass,
  cartsPageShellClass,
  cartsTableClass,
  cartsTableHeadClass,
  cartsTableWrapClass,
} from "../../../modules/carts/cartsModuleTokens";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import type { ConsolidationRack } from "./consolidationRackPanelUtils";
import { rackOccupancyStats } from "./rackLayoutUtils";

type RackRow = ConsolidationRack & {
  stats: ReturnType<typeof rackOccupancyStats>;
  warehouseName: string;
};

export default function ConsolidationRacksListPage() {
  const navigate = useNavigate();
  const { warehouse, warehouses } = useWarehouse();
  const warehouseId = warehouse?.id ?? 1;
  const [racks, setRacks] = useState<ConsolidationRack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const warehouseNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const w of warehouses) map.set(w.id, w.name);
    return map;
  }, [warehouses]);

  const fetchRacks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/racks/", {
        params: { tenant_id: DAMAGE_TENANT_ID, warehouse_id: warehouseId },
      });
      setRacks(Array.isArray(res.data) ? res.data : []);
    } catch (err: unknown) {
      console.error("[ConsolidationRacksList] fetch error:", err);
      setError("Nie udało się załadować regałów.");
      setRacks([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void fetchRacks();
  }, [fetchRacks]);

  const rows: RackRow[] = useMemo(
    () =>
      racks.map((rack) => ({
        ...rack,
        stats: rackOccupancyStats(rack.levels ?? []),
        warehouseName: warehouseNameById.get(rack.warehouse_id ?? warehouseId) ?? warehouse?.name ?? "—",
      })),
    [racks, warehouseNameById, warehouseId, warehouse?.name],
  );

  const handleDelete = async (rack: RackRow) => {
    if (
      !window.confirm(
        `Usunąć regał ${rack.name}? Segmenty z przypisanymi zamówieniami zostaną zwolnione.`,
      )
    ) {
      return;
    }
    setDeletingId(rack.id);
    try {
      await api.delete(`/racks/${rack.id}/`);
      await fetchRacks();
    } catch (err: unknown) {
      console.error("[ConsolidationRacksList] delete error:", err);
      window.alert("Nie udało się usunąć regału.");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-[13px] text-slate-500">Ładowanie regałów…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-4 text-[13px] font-medium text-red-700">{error}</div>
    );
  }

  return (
    <div className={cartsPageShellClass}>
      <CartsListPageHeader
        title="Regały kompletacyjne"
        description={
          warehouse?.name
            ? `Konfiguracja regałów w magazynie ${warehouse.name}. Status operacyjny: Control Tower / mapa regałów.`
            : "Konfiguracja regałów kompletacyjnych."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={WMS_ROUTES.consolidationRacks}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Podgląd operacyjny
            </Link>
            <button type="button" className={cartsBtnPrimary} onClick={() => navigate("/carts/racks/new")}>
              <Plus className="mr-1.5 inline h-4 w-4" />
              Nowy regał kompletacyjny
            </button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <AppEmptyState
          icon={Layers}
          title="Brak regałów"
          description="Utwórz pierwszy regał kompletacyjny."
          action={
            <button type="button" className={cartsBtnPrimary} onClick={() => navigate("/carts/racks/new")}>
              Nowy regał kompletacyjny
            </button>
          }
        />
      ) : (
        <div className={cartsTableWrapClass}>
          <table className={cartsTableClass}>
            <thead>
              <tr className={cartsTableHeadClass}>
                <th className="px-3 py-2">Nazwa regału</th>
                <th className="px-3 py-2 text-right">Segmentów</th>
                <th className="px-3 py-2 text-right">Wolne</th>
                <th className="px-3 py-2 text-right">Zajęte</th>
                <th className="px-3 py-2 text-right">Wykorzystanie</th>
                <th className="px-3 py-2">Magazyn</th>
                <th className="px-3 py-2 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rack) => (
                <tr key={rack.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">{rack.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{rack.stats.total}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-800">{rack.stats.free}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-orange-800">{rack.stats.occupied}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{rack.stats.utilizationPercent}%</td>
                  <td className="px-3 py-2.5 text-slate-700">{rack.warehouseName}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Link
                        to={WMS_ROUTES.consolidationRacks}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-[12px] font-medium text-slate-700 hover:bg-white"
                        title="Podgląd operacyjny (WMS)"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Podgląd
                      </Link>
                      <button
                        type="button"
                        onClick={() => navigate(`/carts/racks/${rack.id}`)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 text-[12px] font-medium text-violet-900 hover:bg-violet-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edytuj
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === rack.id}
                        onClick={() => void handleDelete(rack)}
                        className={`${cartsDangerBtnClass} h-8 px-2 text-[12px]`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Usuń
                      </button>
                    </div>
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
