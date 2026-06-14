import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackSegmentEditPanel from "../../../modules/consolidation-racks/ConsolidationRackSegmentEditPanel";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import ConsolidationRackStructurePreview from "../../../modules/consolidation-racks/ConsolidationRackStructurePreview";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import { rackOccupancyStats } from "../../../modules/consolidation-racks/rackLayoutUtils";
import {
  apiRackToDraft,
  buildSegmentOccupancyMap,
  findSegmentInDraft,
  segmentDisplayLabel,
  type RackStructureDraft,
  type SegmentSelection,
} from "../../../modules/consolidation-racks/rackStructureModel";

export default function ConsolidationRackPreviewPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const { warehouse, warehouses } = useWarehouse();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rack, setRack] = useState<ConsolidationRack | null>(null);
  const [draft, setDraft] = useState<RackStructureDraft | null>(null);
  const [expandedLevelId, setExpandedLevelId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SegmentSelection>(null);

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
      const nextDraft = apiRackToDraft(data);
      setDraft(nextDraft);
      setExpandedLevelId(nextDraft.levels[0]?.clientId ?? null);
      setSelection(null);
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
  const occupancyBySegmentId = useMemo(
    () => buildSegmentOccupancyMap(rack?.levels ?? []),
    [rack],
  );

  const warehouseLabel =
    warehouses.find((w) => w.id === (rack?.warehouse_id ?? warehouse?.id))?.name
    ?? warehouse?.name
    ?? "—";

  const selectSegment = useCallback((levelClientId: string, segmentClientId: string) => {
    setExpandedLevelId(levelClientId);
    setSelection({ levelClientId, segmentClientId });
  }, []);

  const selectedHit = useMemo(() => {
    if (!draft || !selection) return null;
    return findSegmentInDraft(draft, selection.levelClientId, selection.segmentClientId);
  }, [draft, selection]);

  const selectedLabel = selectedHit
    ? segmentDisplayLabel(selectedHit.level, selectedHit.segment)
    : "";

  const selectedOccupancy = useMemo(() => {
    const segId = selectedHit?.segment.segmentId;
    if (segId == null) return undefined;
    return occupancyBySegmentId.get(segId);
  }, [selectedHit, occupancyBySegmentId]);

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
        subtitle="Kliknij segment w podglądzie, aby zobaczyć szczegóły zajętości"
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
            expandedLevelId={expandedLevelId}
            onExpandLevel={setExpandedLevelId}
            selection={selection}
            onSelectSegment={selectSegment}
          />
        }
        workspace={
          <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200/55 bg-white p-2 shadow-sm">
              <ConsolidationRackStructurePreview
                draft={draft}
                showOccupancy
                occupancyBySegmentId={occupancyBySegmentId}
                selection={selection}
                interactive
                onSegmentClick={selectSegment}
              />
            </div>
            {selectedHit ? (
              <div className="w-full shrink-0 lg:w-[min(100%,260px)]">
                <ConsolidationRackSegmentEditPanel
                  segmentLabel={selectedLabel}
                  level={selectedHit.level}
                  segment={selectedHit.segment}
                  readOnly
                  onUpdate={() => {}}
                  onClose={() => setSelection(null)}
                  occupancy={selectedOccupancy}
                />
              </div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
