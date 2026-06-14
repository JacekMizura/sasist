import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import ConsolidationRackVisualEditor from "../../../modules/consolidation-racks/ConsolidationRackVisualEditor";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import {
  apiRackToDraft,
  countSegments,
  findBay,
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

  const selectSegment = useCallback((bayClientId: string, levelClientId: string, segmentClientId: string) => {
    setFocusedBayId(bayClientId);
    setSelection({ bayClientId, levelClientId, segmentClientId });
  }, []);

  const focusedBay = useMemo(() => {
    if (!draft) return null;
    return focusedBayId ? findBay(draft, focusedBayId) ?? draft.bays[0] ?? null : draft.bays[0] ?? null;
  }, [draft, focusedBayId]);

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
        subtitle="Ten sam widok co edycja — bez statusów magazynowych"
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
            <span className="tabular-nums">{draft.totalWidthMm ?? "—"} mm</span>
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
          />
        }
        workspace={
          <ConsolidationRackVisualEditor
            draft={draft}
            bay={focusedBay}
            focusedBayId={focusedBayId}
            selection={selection}
            readOnly
            structureLocked
            onChange={() => {}}
            onSelectBay={selectBay}
            onSelectSegment={selectSegment}
            onClearSelection={() => setSelection(null)}
          />
        }
      />
    </div>
  );
}
