import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import ConsolidationRackStructurePreview from "../../../modules/consolidation-racks/ConsolidationRackStructurePreview";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import { rackOccupancyStats } from "../../../modules/consolidation-racks/rackLayoutUtils";
import { apiRackToDraft, type RackStructureDraft } from "../../../modules/consolidation-racks/rackStructureModel";

export default function ConsolidationRackPreviewPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const { warehouse, warehouses } = useWarehouse();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rack, setRack] = useState<ConsolidationRack | null>(null);
  const [draft, setDraft] = useState<RackStructureDraft | null>(null);
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(() => new Set());

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
      const nextDraft = apiRackToDraft(data);
      setDraft(nextDraft);
      setExpandedLevels(new Set(nextDraft.levels.map((l) => l.clientId)));
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

  const occupancyBySegmentId = useMemo(() => {
    const map = new Map<number, { orderNumber?: string | null; tone?: string }>();
    for (const lv of rack?.levels ?? []) {
      for (const seg of lv.segments ?? []) {
        if (seg.id == null) continue;
        map.set(seg.id, {
          orderNumber: seg.order_number,
          tone: seg.order_id != null ? "#fff7ed" : undefined,
        });
      }
    }
    return map;
  }, [rack]);

  const warehouseLabel =
    warehouses.find((w) => w.id === (rack?.warehouse_id ?? warehouse?.id))?.name
    ?? warehouse?.name
    ?? "—";

  const toggleLevel = useCallback((clientId: string) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className={`${cartsPageShellClass} flex items-center justify-center gap-2 py-16 text-slate-500`}>
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie…
      </div>
    );
  }

  if (error || !rack || !draft) {
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
          <ConsolidationRackStructureEditor
            draft={draft}
            onChange={() => {}}
            warehouseLabel={warehouseLabel}
            warehouses={warehouses}
            showWarehouseSelect={false}
            structureLocked
            readOnly
            expandedLevels={expandedLevels}
            onToggleLevel={toggleLevel}
          />
        }
        preview={
          <ConsolidationRackStructurePreview
            draft={draft}
            showOccupancy
            occupancyBySegmentId={occupancyBySegmentId}
          />
        }
      />
    </div>
  );
}
