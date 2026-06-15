import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsBtnPrimary, cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackOmsPreview from "../../../modules/consolidation-racks/ConsolidationRackOmsPreview";
import ConsolidationRackSegmentEditPanel from "../../../modules/consolidation-racks/ConsolidationRackSegmentEditPanel";
import ConsolidationRackStructureEditor from "../../../modules/consolidation-racks/ConsolidationRackStructureEditor";
import type { ConsolidationRack } from "../../../modules/consolidation-racks/consolidationRackTypes";
import {
  addLevel,
  allLevels,
  apiRackToDraft,
  applyRackPreset,
  countSegments,
  createDefaultRackDraft,
  draftToApiPayload,
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
  const activeWarehouseId = warehouse?.id ?? null;
  const [draft, setDraft] = useState<RackStructureDraft | null>(null);
  const [selection, setSelection] = useState<SegmentSelection>(null);
  const [appliedPreset, setAppliedPreset] = useState<RackPresetId | null>(null);
  const [presetPickerOpen, setPresetPickerOpen] = useState(true);

  const handleDraftChange = useCallback((next: RackStructureDraft) => {
    setDraft(next);
    setSelection((sel) => {
      if (!sel) return sel;
      return findSegmentInDraft(next, sel.levelClientId, sel.segmentClientId) ? sel : null;
    });
  }, []);

  const selectSegment = useCallback((levelClientId: string, segmentClientId: string) => {
    setSelection({ levelClientId, segmentClientId });
  }, []);

  const handleApplyPreset = useCallback(
    (preset: RackPresetId) => {
      if (!draft) return;
      const next = applyRackPreset(preset, draft.warehouseId);
      handleDraftChange(next);
      setAppliedPreset(preset);
      setPresetPickerOpen(false);
      setSelection(null);
    },
    [draft, handleDraftChange],
  );

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
      const nextDraft = apiRackToDraft(data);
      setDraft(nextDraft);
      setSelection(null);
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
    if (isCreate && activeWarehouseId) {
      setDraft((prev) => prev ?? createDefaultRackDraft(activeWarehouseId));
    }
  }, [isCreate, activeWarehouseId]);

  const validation = useMemo(() => (draft ? validateRackDraft(draft) : { valid: false, levelErrors: [] as const, globalError: null }), [draft]);
  const totalSegments = useMemo(() => (draft ? countSegments(draft) : 0), [draft]);

  const selectedHit = useMemo(() => {
    if (!selection || !draft) return null;
    return findSegmentInDraft(draft, selection.levelClientId, selection.segmentClientId);
  }, [draft, selection]);

  const selectedLabel = selectedHit
    ? segmentDisplayLabel(selectedHit.level, selectedHit.segment)
    : "";

  const updateSelectedSegment = useCallback((patch: Partial<SegmentDraft>) => {
    if (!selection || !draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return {
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
      };
    });
  }, [selection, draft]);

  const handleCreate = async () => {
    if (!draft) {
      setError("Wybierz magazyn.");
      return;
    }
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
      for (const lv of allLevels(draft)) {
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
    draft != null
      ? (warehouses.find((w) => w.id === draft.warehouseId)?.name ?? warehouse?.name ?? `#${draft.warehouseId}`)
      : "—";

  const firstSlotLabel =
    draft?.levels[0]?.segments[0]
      ? segmentDisplayLabel(draft.levels[0], draft.levels[0].segments[0])
      : "A1";

  if (isCreate && !activeWarehouseId) {
    return (
      <div className={`${cartsPageShellClass} py-12 text-center text-sm font-medium text-amber-800`}>
        Wybierz magazyn.
      </div>
    );
  }

  if (!draft && !loading) {
    return (
      <div className={`${cartsPageShellClass} py-12 text-center text-sm text-slate-500`}>
        Brak danych regału.
      </div>
    );
  }

  if (loading || !draft) {
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
        subtitle="Kliknij segment na wizualizacji — panel edycji po prawej, jak w kreatorze szablonów"
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
            <span className="font-semibold tabular-nums text-slate-800">{totalSegments} segmentów</span>
            <span className="text-slate-500">·</span>
            <span className="tabular-nums">{draft.levels.length} poziomów</span>
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
          />
        }
        workspace={
          <div className="flex h-full min-h-0 w-full gap-2">
            <div className="min-h-0 min-w-0 flex-1">
              <ConsolidationRackOmsPreview
                draft={draft}
                selection={selection}
                structureLocked={!isCreate}
                onSegmentClick={selectSegment}
                onAddLevel={isCreate ? () => handleDraftChange(addLevel(draft)) : undefined}
              />
            </div>
            <div className="hidden w-[260px] shrink-0 lg:block">
              <ConsolidationRackSegmentEditPanel
                empty={!selectedHit}
                segmentLabel={selectedLabel}
                level={selectedHit?.level}
                segment={selectedHit?.segment}
                readOnly={false}
                onUpdate={updateSelectedSegment}
                onClose={() => setSelection(null)}
              />
            </div>
          </div>
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Regał → poziomy → segmenty. Kliknij komórkę, aby edytować wymiary i nazwę.
            </p>
            <button
              type="button"
              disabled={saving || !validation.valid || !draft.rackName.trim()}
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
