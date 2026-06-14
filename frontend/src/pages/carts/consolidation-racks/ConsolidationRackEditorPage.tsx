import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsBtnPrimary, cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackSegmentEditPanel from "../../../modules/consolidation-racks/ConsolidationRackSegmentEditPanel";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import ConsolidationRackStructurePreview from "../../../modules/consolidation-racks/ConsolidationRackStructurePreview";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import { rackOccupancyStats } from "../../../modules/consolidation-racks/rackLayoutUtils";
import {
  apiRackToDraft,
  applyRackPreset,
  buildSegmentOccupancyMap,
  createDefaultRackDraft,
  draftToApiPayload,
  draftToGridLevels,
  findSegmentInDraft,
  segmentDisplayLabel,
  segmentDraftPayload,
  validateRackDraft,
  type RackPresetId,
  type RackStructureDraft,
  type SegmentDraft,
  type SegmentSelection,
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
  const [focusedLevelId, setFocusedLevelId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SegmentSelection>(null);
  const [appliedPreset, setAppliedPreset] = useState<RackPresetId | null>(null);
  const [presetPickerOpen, setPresetPickerOpen] = useState(true);

  const initNavigation = useCallback((nextDraft: RackStructureDraft) => {
    const firstLevel = nextDraft.levels[0];
    if (!firstLevel) {
      setFocusedLevelId(null);
      setSelection(null);
      return;
    }
    setFocusedLevelId(firstLevel.clientId);
    setSelection(null);
  }, []);

  useEffect(() => {
    if (focusedLevelId == null && draft.levels[0]) {
      setFocusedLevelId(draft.levels[0].clientId);
    }
  }, [draft.levels, focusedLevelId]);

  const handleDraftChange = useCallback((next: RackStructureDraft) => {
    setDraft(next);
    setSelection((sel) => {
      if (!sel) return sel;
      const hit = findSegmentInDraft(next, sel.levelClientId, sel.segmentClientId);
      return hit ? sel : null;
    });
    setFocusedLevelId((focused) => {
      if (focused && next.levels.some((l) => l.clientId === focused)) return focused;
      return next.levels[0]?.clientId ?? null;
    });
  }, []);

  const selectLevel = useCallback((levelClientId: string) => {
    setFocusedLevelId(levelClientId);
    setSelection(null);
  }, []);

  const selectSegment = useCallback((levelClientId: string, segmentClientId: string) => {
    setFocusedLevelId(levelClientId);
    setSelection({ levelClientId, segmentClientId });
  }, []);

  const handleApplyPreset = useCallback(
    (preset: RackPresetId) => {
      const next = applyRackPreset(preset, draft.warehouseId);
      handleDraftChange(next);
      setAppliedPreset(preset);
      setPresetPickerOpen(false);
      initNavigation(next);
    },
    [draft.warehouseId, handleDraftChange, initNavigation],
  );

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
      const nextDraft = apiRackToDraft(data);
      setDraft(nextDraft);
      initNavigation(nextDraft);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] load error:", err);
      setError("Nie udało się wczytać regału.");
    } finally {
      setLoading(false);
    }
  }, [initNavigation]);

  useEffect(() => {
    if (!isCreate && rackId) void loadRack(Number(rackId));
  }, [isCreate, rackId, loadRack]);

  useEffect(() => {
    if (isCreate && warehouse?.id) {
      setDraft((prev) => ({ ...prev, warehouseId: warehouse.id }));
    }
  }, [isCreate, warehouse?.id]);

  const previewLevels = useMemo(() => draftToGridLevels(draft, rack), [draft, rack]);
  const stats = useMemo(() => rackOccupancyStats(previewLevels), [previewLevels]);
  const validation = useMemo(() => validateRackDraft(draft), [draft]);
  const occupancyBySegmentId = useMemo(() => buildSegmentOccupancyMap(previewLevels), [previewLevels]);

  const selectedHit = useMemo(() => {
    if (!selection) return null;
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

  const updateSelectedSegment = useCallback((patch: Partial<SegmentDraft>) => {
    if (!selection) return;
    setDraft((prev) => ({
      ...prev,
      levels: prev.levels.map((lv) => {
        if (lv.clientId !== selection.levelClientId) return lv;
        return {
          ...lv,
          segments: lv.segments.map((s) =>
            s.clientId === selection.segmentClientId ? { ...s, ...patch } : s,
          ),
        };
      }),
    }));
  }, [selection]);

  const handleCreate = async () => {
    if (!draft.rackName.trim()) {
      setError("Podaj nazwę regału.");
      return;
    }
    if (!validation.valid) {
      setError(
        validation.globalError
          ?? validation.levelErrors.map((e) => `Poziom ${e.levelName}: ${e.usedMm}/${e.targetMm} mm`).join(" · "),
      );
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
    if (!validation.valid) {
      setError(
        validation.globalError
          ?? validation.levelErrors.map((e) => `Poziom ${e.levelName}: ${e.usedMm}/${e.targetMm} mm`).join(" · "),
      );
      return;
    }
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
      {!validation.valid && !error ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {validation.globalError ?? (
            <>
              Suma szerokości segmentów musi być równa szerokości regału ({draft.totalWidthMm ?? "—"} mm):{" "}
              {validation.levelErrors.map((e) => `Poziom ${e.levelName} ${e.usedMm}/${e.targetMm} mm`).join("; ")}
            </>
          )}
        </div>
      ) : null}

      <ConsolidationRackFormShell
        title={isCreate ? "Nowy regał kompletacyjny" : "Edycja regału"}
        subtitle="Buduj regał poziom po poziomie — drzewo struktury, podgląd na żywo, edycja jednego segmentu"
        backTo="/carts/racks"
        headerActions={
          !isCreate ? (
            <Link
              to={`/carts/racks/${rackId}/preview`}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 hover:bg-violet-50/40"
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
            appliedPreset={appliedPreset}
            presetPickerOpen={presetPickerOpen}
            onApplyPreset={isCreate ? handleApplyPreset : undefined}
            onChangePreset={() => setPresetPickerOpen(true)}
            focusedLevelId={focusedLevelId}
            onSelectLevel={selectLevel}
            selection={selection}
            onSelectSegment={selectSegment}
          />
        }
        workspace={
          <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-slate-200/55 bg-white p-2 shadow-sm">
              <ConsolidationRackStructurePreview
                draft={draft}
                showOccupancy={!isCreate}
                occupancyBySegmentId={occupancyBySegmentId}
                selection={selection}
                focusedLevelId={focusedLevelId}
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
                  readOnly={false}
                  onUpdate={updateSelectedSegment}
                  onClose={() => setSelection(null)}
                  occupancy={!isCreate ? selectedOccupancy : undefined}
                />
              </div>
            ) : (
              <div className="hidden w-[260px] shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500 lg:flex">
                Kliknij segment w drzewie lub podglądzie, aby edytować wymiary.
              </div>
            )}
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Edytujesz jeden segment naraz — podgląd pokazuje cały regał.
            </p>
            <button
              type="button"
              disabled={saving || !validation.valid}
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
