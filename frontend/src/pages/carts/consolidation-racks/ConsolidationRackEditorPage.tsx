import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsBtnPrimary, cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import ConsolidationRackStructurePreview from "../../../modules/consolidation-racks/ConsolidationRackStructurePreview";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import { rackOccupancyStats } from "../../../modules/consolidation-racks/rackLayoutUtils";
import {
  apiRackToDraft,
  createDefaultRackDraft,
  draftToApiPayload,
  draftToGridLevels,
  segmentDraftPayload,
  type RackStructureDraft,
} from "../../../modules/consolidation-racks/rackStructureModel";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

export default function ConsolidationRackEditorPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const isCreate = !rackId || rackId === "new";
  const navigate = useNavigate();
  const { warehouse, warehouses, showWarehouseSelector } = useWarehouse();

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rack, setRack] = useState<ConsolidationRack | null>(null);
  const [draft, setDraft] = useState<RackStructureDraft>(() => createDefaultRackDraft(warehouse?.id ?? 1));
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedLevels((prev) => {
      if (prev.size > 0) return prev;
      return new Set(draft.levels.map((l) => l.clientId));
    });
  }, [draft.levels]);

  const handleDraftChange = useCallback((next: RackStructureDraft) => {
    setDraft((prev) => {
      const addedLevels = next.levels.filter(
        (l) => !prev.levels.some((p) => p.clientId === l.clientId),
      );
      if (addedLevels.length) {
        setExpandedLevels((exp) => {
          const n = new Set(exp);
          for (const l of addedLevels) n.add(l.clientId);
          return n;
        });
      }
      return next;
    });
  }, []);

  const toggleLevel = useCallback((clientId: string) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

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
      console.error("[ConsolidationRackEditor] load error:", err);
      setError("Nie udało się wczytać regału.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCreate && rackId) void loadRack(Number(rackId));
  }, [isCreate, rackId, loadRack]);

  useEffect(() => {
    if (isCreate && warehouse?.id) {
      setDraft((prev) => ({ ...prev, warehouseId: warehouse.id }));
    }
  }, [isCreate, warehouse?.id]);

  const previewLevels = useMemo(
    () => draftToGridLevels(draft, rack),
    [draft, rack],
  );
  const stats = useMemo(() => rackOccupancyStats(previewLevels), [previewLevels]);

  const occupancyBySegmentId = useMemo(() => {
    const map = new Map<number, { orderNumber?: string | null; tone?: string }>();
    for (const lv of previewLevels) {
      for (const seg of lv.segments ?? []) {
        if (seg.id == null) continue;
        map.set(seg.id, {
          orderNumber: seg.order_number,
          tone: seg.order_id != null ? "#fff7ed" : undefined,
        });
      }
    }
    return map;
  }, [previewLevels]);

  const handleCreate = async () => {
    if (!draft.rackName.trim()) {
      setError("Podaj nazwę regału.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<ConsolidationRack>("/racks/", {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: draft.warehouseId,
        name: draft.rackName.trim(),
        levels: draftToApiPayload(draft),
      });
      navigate(`/carts/racks/${data.id}/edit`);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] create error:", err);
      setError("Nie udało się utworzyć regału.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!rack || !draft.rackName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/racks/${rack.id}/`, { name: draft.rackName.trim() });
      for (const lv of draft.levels) {
        for (const seg of lv.segments) {
          if (seg.segmentId == null) continue;
          await api.patch(`/racks/segments/${seg.segmentId}/`, segmentDraftPayload(seg, lv));
        }
      }
      await loadRack(rack.id);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] save error:", err);
      setError("Nie udało się zapisać regału.");
    } finally {
      setSaving(false);
    }
  };

  const warehouseLabel =
    warehouses.find((w) => w.id === draft.warehouseId)?.name ?? warehouse?.name ?? `#${draft.warehouseId}`;

  const firstSlotLabel = previewLevels[0]?.segments?.[0]?.effective_slot_label ?? "A";

  if (loading) {
    return (
      <div className={`${cartsPageShellClass} flex items-center justify-center gap-2 py-16 text-slate-500`}>
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie…
      </div>
    );
  }

  return (
    <div className={cartsPageShellClass}>
      {error ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      ) : null}

      <ConsolidationRackFormShell
        title={isCreate ? "Nowy regał kompletacyjny" : "Edycja regału"}
        subtitle="Konfiguracja OMS — poziomy z własną wysokością i segmentami o zmiennej szerokości"
        backTo="/carts/racks"
        headerActions={
          !isCreate ? (
            <Link
              to={`/carts/racks/${rackId}/preview`}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              Podgląd
            </Link>
          ) : null
        }
        summaryBar={
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-semibold tabular-nums text-slate-800">{stats.total} segmentów</span>
            <span className="text-slate-500">·</span>
            <span className="tabular-nums">Wolne: {stats.free}</span>
            <span className="text-slate-500">·</span>
            <span className="tabular-nums">Zajęte: {stats.occupied}</span>
            <span className="text-slate-500">·</span>
            <span>
              Skan: <span className="font-mono font-semibold">{draft.rackName.trim() || "RK-XX"}/{firstSlotLabel}</span>
            </span>
          </div>
        }
        sidebar={
          <ConsolidationRackStructureEditor
            draft={draft}
            onChange={handleDraftChange}
            warehouseLabel={warehouseLabel}
            warehouses={warehouses}
            showWarehouseSelect={isCreate && showWarehouseSelector}
            structureLocked={!isCreate}
            expandedLevels={expandedLevels}
            onToggleLevel={toggleLevel}
          />
        }
        preview={
          <ConsolidationRackStructurePreview
            draft={draft}
            showOccupancy={!isCreate}
            occupancyBySegmentId={occupancyBySegmentId}
          />
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {isCreate
                ? "Dodaj poziomy i segmenty po lewej — podgląd odzwierciedla rzeczywisty układ."
                : "Edytuj segmenty bezpośrednio w strukturze poziomu. Układ poziomów jest stały."}
            </p>
            <button
              type="button"
              disabled={saving}
              className={cartsBtnPrimary}
              onClick={() => void (isCreate ? handleCreate() : handleSaveEdit())}
            >
              {saving ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Save className="mr-1 inline h-4 w-4" />}
              {isCreate ? "Utwórz regał" : "Zapisz regał"}
            </button>
          </div>
        }
      />
    </div>
  );
}
