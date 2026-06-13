import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import ConsolidationRackGrid from "../../../modules/consolidation-racks/ConsolidationRackGrid";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackSegmentModal from "../../../modules/consolidation-racks/ConsolidationRackSegmentModal";
import {
  findSegmentInRack,
  segmentToModal,
  type ConsolidationRack,
  type SegmentModalData,
} from "../../../modules/consolidation-racks/consolidationRackTypes";
import {
  inferRackDefaultDims,
  levelsToGrid,
  rackOccupancyStats,
  segmentIsOverridden,
} from "../../../modules/consolidation-racks/rackLayoutUtils";

export default function ConsolidationRackPreviewPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const { warehouse, warehouses } = useWarehouse();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rack, setRack] = useState<ConsolidationRack | null>(null);
  const [modal, setModal] = useState<SegmentModalData | null>(null);

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
    } catch (err: unknown) {
      console.error("[ConsolidationRackPreview] load error:", err);
      setError("Nie udało się wczytać regału.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (rackId) void loadRack(Number(rackId));
  }, [rackId, loadRack]);

  const stats = useMemo(() => rackOccupancyStats(rack?.levels ?? []), [rack]);
  const gridMeta = useMemo(() => levelsToGrid(rack?.levels ?? []), [rack]);
  const rackDefaults = useMemo(() => inferRackDefaultDims(rack?.levels ?? []), [rack]);

  const overriddenSegmentIds = useMemo(() => {
    const ids = new Set<number>();
    if (!rack) return ids;
    for (const lv of rack.levels ?? []) {
      for (const seg of lv.segments ?? []) {
        if (seg.id != null && segmentIsOverridden(seg, rackDefaults)) ids.add(seg.id);
      }
    }
    return ids;
  }, [rack, rackDefaults]);

  const warehouseLabel =
    warehouses.find((w) => w.id === (rack?.warehouse_id ?? warehouse?.id))?.name
    ?? warehouse?.name
    ?? "—";

  if (loading) {
    return (
      <div className={`${cartsPageShellClass} flex items-center justify-center gap-2 py-16 text-slate-500`}>
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie…
      </div>
    );
  }

  if (error || !rack) {
    return (
      <div className={`${cartsPageShellClass} rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800`}>
        {error ?? "Regał nie istnieje."}
      </div>
    );
  }

  return (
    <div className={cartsPageShellClass}>
      <ConsolidationRackFormShell
        title={`Podgląd: ${rack.name}`}
        subtitle="Tylko odczyt — wizualizacja regału i wykorzystania segmentów"
        backTo="/carts/racks"
        headerActions={
          <Link
            to={`/carts/racks/${rack.id}/edit`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-[13px] font-medium text-violet-900 hover:bg-violet-100"
          >
            <Pencil className="h-4 w-4" />
            Edytuj
          </Link>
        }
        summaryBar={
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-semibold tabular-nums">{stats.total} segmentów</span>
            <span className="text-slate-500">·</span>
            <span className="text-emerald-800">Wolne: {stats.free}</span>
            <span className="text-slate-500">·</span>
            <span className="text-orange-800">Zajęte: {stats.occupied}</span>
            <span className="text-slate-500">·</span>
            <span className="font-semibold">Wykorzystanie: {stats.utilizationPercent}%</span>
          </div>
        }
        sidebar={
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="text-[10px] font-bold uppercase text-slate-500">Nazwa</div>
              <div className="font-mono font-semibold text-slate-900">{rack.name}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="text-[10px] font-bold uppercase text-slate-500">Magazyn</div>
              <div className="text-slate-800">{warehouseLabel}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="text-[10px] font-bold uppercase text-slate-500">Układ</div>
              <div className="tabular-nums text-slate-800">
                {gridMeta.rowCount} rzędów × {gridMeta.colCount} kolumn
              </div>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 text-sm">
              <div className="text-[10px] font-bold uppercase text-slate-500">Domyślny profil segmentu</div>
              <div className="mt-1 font-mono tabular-nums text-slate-800">
                {rackDefaults.length_mm ?? "—"} × {rackDefaults.width_mm ?? "—"} × {rackDefaults.height_mm ?? "—"} mm
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Nadpisanych segmentów: {overriddenSegmentIds.size}
              </div>
            </div>
          </div>
        }
        preview={
          <ConsolidationRackGrid
            rackName={rack.name}
            levels={rack.levels ?? []}
            overriddenSegmentIds={overriddenSegmentIds}
            onSegmentClick={(cell) => {
              if (cell.segmentId == null) return;
              const hit = findSegmentInRack(rack, cell.segmentId);
              setModal(
                segmentToModal(
                  rack.name,
                  {
                    ...cell,
                    isOverridden: hit ? segmentIsOverridden(hit.seg, rackDefaults) : false,
                  },
                  hit?.seg,
                  true,
                ),
              );
            }}
          />
        }
      />

      <ConsolidationRackSegmentModal segment={modal} rackDefaults={rackDefaults} onClose={() => setModal(null)} />
    </div>
  );
}
