import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, CheckCircle2, Gauge, Layers, LayoutGrid, Plus } from "lucide-react";

import api from "../../../api/axios";
import { AppEmptyState } from "../../../components/app-shell/AppEmptyState";
import {
  ConsolidationRacksListTable,
  type ConsolidationRackListRow,
} from "../../../components/consolidationRacks/rackList/ConsolidationRacksListTable";
import { filterToolbarBtnApply } from "../../../components/filters/filterUiTokens";
import { moduleTableCardClass } from "../../../components/listPage/moduleList";
import { useActiveWarehouseContext, ACTIVE_WAREHOUSE_REQUIRED_MESSAGE } from "../../../hooks/useActiveWarehouseContext";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import { rackOccupancyStats } from "../../../modules/consolidation-racks/rackLayoutUtils";
import { CartsListPageHeader } from "../../../modules/carts/CartsListPageHeader";
import { PurchasingKpiCard, PurchasingKpiGrid } from "../../../modules/purchasing/ui";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

export default function ConsolidationRacksListPage() {
  const navigate = useNavigate();
  const { warehouse, warehouseId, hasActiveWarehouse, warehouses } = useActiveWarehouseContext();
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
    if (!hasActiveWarehouse || warehouseId == null) {
      setRacks([]);
      setLoading(false);
      return;
    }
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
  }, [warehouseId, hasActiveWarehouse]);

  useEffect(() => {
    void fetchRacks();
  }, [fetchRacks]);

  const rows: ConsolidationRackListRow[] = useMemo(
    () =>
      racks.map((rack) => ({
        id: rack.id,
        name: rack.name,
        warehouseName: warehouseNameById.get(rack.warehouse_id ?? warehouseId ?? 0) ?? warehouse?.name ?? "—",
        stats: rackOccupancyStats(rack.levels ?? []),
      })),
    [racks, warehouseNameById, warehouseId, warehouse?.name],
  );

  const aggregateStats = useMemo(() => {
    let segments = 0;
    let free = 0;
    let occupied = 0;
    for (const row of rows) {
      segments += row.stats.total;
      free += row.stats.free;
      occupied += row.stats.occupied;
    }
    const avgUtilization = segments > 0 ? Math.round((occupied / segments) * 1000) / 10 : 0;
    return {
      rackCount: rows.length,
      segments,
      free,
      occupied,
      avgUtilization,
    };
  }, [rows]);

  const handleDelete = async (rack: ConsolidationRackListRow) => {
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

  return (
    <div className="space-y-6">
      <CartsListPageHeader
        description="Konfiguracja regałów magazynowych wykorzystywanych przez procesy WMS."
        actions={
          <button
            type="button"
            disabled={!hasActiveWarehouse}
            className={filterToolbarBtnApply}
            onClick={() => navigate("/carts/racks/new")}
          >
            <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
            Nowy regał kompletacyjny
          </button>
        }
      />

      {!loading && !error && hasActiveWarehouse ? (
        <PurchasingKpiGrid columns={5}>
          <PurchasingKpiCard title="Regały" value={aggregateStats.rackCount} tone="indigo" icon={<Layers aria-hidden />} />
          <PurchasingKpiCard
            title="Segmenty"
            value={aggregateStats.segments}
            tone="blue"
            icon={<LayoutGrid aria-hidden />}
          />
          <PurchasingKpiCard
            title="Wolne"
            value={aggregateStats.free}
            tone="emerald"
            icon={<CheckCircle2 aria-hidden />}
          />
          <PurchasingKpiCard title="Zajęte" value={aggregateStats.occupied} tone="amber" icon={<Box aria-hidden />} />
          <PurchasingKpiCard
            title="Średnie wykorzystanie"
            value={`${aggregateStats.avgUtilization}%`}
            tone="purple"
            icon={<Gauge aria-hidden />}
          />
        </PurchasingKpiGrid>
      ) : null}

      {!hasActiveWarehouse ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-amber-900">{ACTIVE_WAREHOUSE_REQUIRED_MESSAGE}</p>
        </div>
      ) : loading ? (
        <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie listy regałów">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-amber-900">{error}</p>
          <button
            type="button"
            onClick={() => void fetchRacks()}
            className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <AppEmptyState
            icon={Layers}
            title="Brak regałów"
            description="Utwórz pierwszy regał kompletacyjny dla aktywnego magazynu."
            action={
              <button type="button" className={filterToolbarBtnApply} onClick={() => navigate("/carts/racks/new")}>
                Nowy regał kompletacyjny
              </button>
            }
          />
        </div>
      ) : (
        <div className={`${moduleTableCardClass} min-w-0`}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <ConsolidationRacksListTable
              rows={rows}
              deleteBusyId={deletingId}
              onPreview={(id) => navigate(`/carts/racks/${id}/preview`)}
              onEdit={(id) => navigate(`/carts/racks/${id}/edit`)}
              onDelete={(row) => void handleDelete(row)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
