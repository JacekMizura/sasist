import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackOmsPreview from "../../../modules/consolidation-racks/ConsolidationRackOmsPreview";
import ConsolidationRackSegmentEditPanel from "../../../modules/consolidation-racks/ConsolidationRackSegmentEditPanel";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import {
  apiRackToDraft,
  countSegments,
  findBay,
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
  const [focusedBayId, setFocusedBayId] = useState<string | null>(null);
  const [focusedLevelId, setFocusedLevelId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SegmentSelection>(null);

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
      const nextDraft = apiRackToDraft(data);
      setDraft(nextDraft);
      setFocusedBayId(nextDraft.bays[0]?.clientId ?? null);
      setFocusedLevelId(nextDraft.bays[0]?.levels[0]?.clientId ?? null);
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

  const warehouseLabel =
    warehouses.find((w) => w.id === (rack?.warehouse_id ?? warehouse?.id))?.name
    ?? warehouse?.name
    ?? "—";

  const selectBay = useCallback((bayClientId: string) => {
    setFocusedBayId(bayClientId);
    setSelection(null);
  }, []);

  const selectLevel = useCallback((bayClientId: string, levelClientId: string) => {
    setFocusedBayId(bayClientId);
    setFocusedLevelId(levelClientId);
    setSelection(null);
  }, []);

  const selectSegment = useCallback((bayClientId: string, levelClientId: string, segmentClientId: string) => {
    setFocusedBayId(bayClientId);
    setFocusedLevelId(levelClientId);
    setSelection({ bayClientId, levelClientId, segmentClientId });
  }, []);

  const focusedBay = useMemo(() => {
    if (!draft) return null;
    return focusedBayId ? findBay(draft, focusedBayId) ?? draft.bays[0] ?? null : draft.bays[0] ?? null;
  }, [draft, focusedBayId]);

  const selectedHit = useMemo(() => {
    if (!draft || !selection) return null;
    return findSegmentInDraft(draft, selection.bayClientId, selection.levelClientId, selection.segmentClientId);
  }, [draft, selection]);

  const selectedLabel = selectedHit
    ? segmentDisplayLabel(selectedHit.level, selectedHit.segment)
    : "";

  const totalSegments = draft ? countSegments(draft) : 0;

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
        subtitle="Konfiguracja regału — bez statusów magazynowych (WMS ma osobny widok operacyjny)"
        backTo="/carts/racks"
        headerActions={
          <Link
            to={`/carts/racks/${rack.id}/edit`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-violet-200 bg-white px-3 text-[13px] font-medium text-violet-900 hover:bg-violet-50/60"
          >
            <Pencil className="h-4 w-4" />
            Edytuj
          </Link>
        }
        summaryBar={
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-semibold tabular-nums">{totalSegments} segmentów</span>
            <span className="text-slate-500">·</span>
            <span className="tabular-nums">{draft.bays.length} racków</span>
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
            focusedBayId={focusedBayId}
            focusedLevelId={focusedLevelId}
            onSelectBay={selectBay}
            onSelectLevel={selectLevel}
            selection={selection}
            onSelectSegment={selectSegment}
          />
        }
        workspace={
          <div className="flex h-full min-h-0 w-full gap-2">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <ConsolidationRackOmsPreview
                draft={draft}
                bay={focusedBay}
                selection={selection}
                onSegmentClick={selectSegment}
              />
            </div>
            <div className="hidden w-[260px] shrink-0 lg:block">
              <ConsolidationRackSegmentEditPanel
                empty={!selectedHit}
                segmentLabel={selectedLabel}
                level={selectedHit?.level}
                segment={selectedHit?.segment}
                readOnly
                onUpdate={() => {}}
                onClose={() => setSelection(null)}
              />
            </div>
          </div>
        }
      />
    </div>
  );
}
