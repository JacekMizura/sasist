import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import {
  cartsAppInputClass,
  cartsBtnApply,
  cartsBtnPrimary,
  cartsFieldLabelClass,
  cartsPageShellClass,
  cartsSectionClass,
  cartsSectionTitleClass,
} from "../../../modules/carts/cartsModuleTokens";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import ConsolidationRackGrid from "./ConsolidationRackGrid";
import ConsolidationRackSegmentPanel, {
  type SegmentPanelData,
  type SegmentSavePayload,
  type SegmentSaveResult,
} from "./ConsolidationRackSegmentPanel";
import {
  findSegmentInRack,
  segmentToPanel,
  type ConsolidationRack,
} from "./consolidationRackPanelUtils";
import {
  buildLevelsFromGrid,
  buildPreviewLevelsFromGrid,
  draftSegmentKey,
  levelsToGrid,
  rackOccupancyStats,
  type DraftSegmentOverrides,
  type RackGridLevel,
  type SegmentDimensionDefaults,
} from "./rackLayoutUtils";

const MAX_DIM = 10_000;

function parseOptionalDim(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_DIM) return null;
  return n;
}

function computeCapacityFromDefaults(d: SegmentDimensionDefaults): number | null {
  const { length_mm: l, width_mm: w, height_mm: h } = d;
  if (!l || !w || !h) return null;
  return Math.round((l * w * h) / 1_000_000 * 100) / 100;
}

export default function ConsolidationRackEditorPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const isCreate = rackId === "new" || !rackId;
  const navigate = useNavigate();
  const { warehouse, warehouses, showWarehouseSelector } = useWarehouse();

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rack, setRack] = useState<ConsolidationRack | null>(null);

  const [rackName, setRackName] = useState("RK-01");
  const [warehouseId, setWarehouseId] = useState<number>(warehouse?.id ?? 1);
  const [rowCount, setRowCount] = useState(4);
  const [colCount, setColCount] = useState(4);
  const [defaultLength, setDefaultLength] = useState("");
  const [defaultWidth, setDefaultWidth] = useState("");
  const [defaultHeight, setDefaultHeight] = useState("");
  const [draftOverrides, setDraftOverrides] = useState<DraftSegmentOverrides>({});
  const [panel, setPanel] = useState<SegmentPanelData | null>(null);
  const [draftPanelKey, setDraftPanelKey] = useState<string | null>(null);

  useEffect(() => {
    if (warehouse?.id) setWarehouseId(warehouse.id);
  }, [warehouse?.id]);

  const defaultDims: SegmentDimensionDefaults = useMemo(
    () => ({
      length_mm: parseOptionalDim(defaultLength),
      width_mm: parseOptionalDim(defaultWidth),
      height_mm: parseOptionalDim(defaultHeight),
    }),
    [defaultLength, defaultWidth, defaultHeight],
  );

  const defaultCapacity = useMemo(() => computeCapacityFromDefaults(defaultDims), [defaultDims]);

  const previewLevels: RackGridLevel[] = useMemo(() => {
    if (!isCreate && rack) return rack.levels ?? [];
    return buildPreviewLevelsFromGrid(rowCount, colCount, defaultDims, draftOverrides);
  }, [isCreate, rack, rowCount, colCount, defaultDims, draftOverrides]);

  const stats = useMemo(() => rackOccupancyStats(previewLevels), [previewLevels]);
  const gridMeta = useMemo(() => levelsToGrid(previewLevels), [previewLevels]);

  const loadRack = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ConsolidationRack>(`/racks/${id}/`);
      setRack(data);
      setRackName(data.name);
      setWarehouseId(data.warehouse_id ?? warehouse?.id ?? 1);
      const meta = levelsToGrid(data.levels ?? []);
      setRowCount(meta.rowCount);
      setColCount(meta.colCount);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] load error:", err);
      setError("Nie udało się wczytać regału.");
    } finally {
      setLoading(false);
    }
  }, [warehouse?.id]);

  useEffect(() => {
    if (!isCreate && rackId) {
      void loadRack(Number(rackId));
    }
  }, [isCreate, rackId, loadRack]);

  const handleSegmentSave = useCallback(
    async (segmentId: number, payload: SegmentSavePayload): Promise<SegmentSaveResult> => {
      const { data } = await api.patch<SegmentSaveResult>(`/racks/segments/${segmentId}/`, payload);
      if (rackId && !isCreate) {
        await loadRack(Number(rackId));
      }
      return data;
    },
    [isCreate, loadRack, rackId],
  );

  const handleDraftSave = useCallback(
    async (payload: SegmentSavePayload) => {
      if (!draftPanelKey) return;
      setDraftOverrides((prev) => ({
        ...prev,
        [draftPanelKey]: {
          slot_label: payload.slot_label,
          length_mm: payload.length_mm,
          width_mm: payload.width_mm,
          height_mm: payload.height_mm,
        },
      }));
    },
    [draftPanelKey],
  );

  const handleCreate = async () => {
    if (!rackName.trim()) {
      setError("Podaj nazwę regału.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<ConsolidationRack>("/racks/", {
        tenant_id: DAMAGE_TENANT_ID,
        warehouse_id: warehouseId,
        name: rackName.trim(),
        levels: buildLevelsFromGrid(rowCount, colCount, defaultDims, draftOverrides),
      });
      navigate(`/carts/racks/${data.id}`);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] create error:", err);
      setError("Nie udało się utworzyć regału.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateName = async () => {
    if (!rack || !rackName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/racks/${rack.id}/`, { name: rackName.trim() });
      await loadRack(rack.id);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] update error:", err);
      setError("Nie udało się zapisać nazwy regału.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Wczytywanie…
      </div>
    );
  }

  return (
    <div className={cartsPageShellClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <Link
            to="/carts/racks"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Lista regałów
          </Link>
          <h1 className="mt-1 text-lg font-bold text-slate-900">
            {isCreate ? "Nowy regał kompletacyjny" : `Edycja: ${rack?.name ?? rackName}`}
          </h1>
        </div>
        {isCreate ? (
          <button type="button" disabled={saving} className={cartsBtnPrimary} onClick={() => void handleCreate()}>
            {saving ? <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> : <Save className="mr-1 inline h-4 w-4" />}
            Utwórz regał
          </button>
        ) : (
          <button type="button" disabled={saving} className={cartsBtnApply} onClick={() => void handleUpdateName()}>
            {saving ? "Zapisywanie…" : "Zapisz nazwę regału"}
          </button>
        )}
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="space-y-4">
          <section className={cartsSectionClass}>
            <h2 className={cartsSectionTitleClass}>Dane regału</h2>
            <label className="mt-3 block">
              <span className={cartsFieldLabelClass}>Nazwa regału</span>
              <input
                type="text"
                value={rackName}
                onChange={(e) => setRackName(e.target.value)}
                className={`${cartsAppInputClass} mt-1`}
                placeholder="RK-01"
              />
            </label>
            <label className="mt-3 block">
              <span className={cartsFieldLabelClass}>Magazyn</span>
              {isCreate && showWarehouseSelector ? (
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(Number(e.target.value))}
                  className={`${cartsAppInputClass} mt-1`}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 text-sm font-medium text-slate-800">
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? warehouse?.name ?? `#${warehouseId}`}
                </div>
              )}
            </label>
          </section>

          <section className={cartsSectionClass}>
            <h2 className={cartsSectionTitleClass}>Układ fizyczny</h2>
            {isCreate ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={cartsFieldLabelClass}>Liczba rzędów</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={rowCount}
                    onChange={(e) => setRowCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className={`${cartsAppInputClass} mt-1 no-number-spinner`}
                  />
                </label>
                <label className="block">
                  <span className={cartsFieldLabelClass}>Liczba kolumn</span>
                  <input
                    type="number"
                    min={1}
                    max={26}
                    value={colCount}
                    onChange={(e) => setColCount(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
                    className={`${cartsAppInputClass} mt-1 no-number-spinner`}
                  />
                </label>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                {gridMeta.rowCount} rzędów × {gridMeta.colCount} kolumn = {stats.total} półek
                <span className="mt-1 block text-xs text-slate-500">Układ siatki nie podlega zmianie po utworzeniu regału.</span>
              </p>
            )}
          </section>

          <section className={cartsSectionClass}>
            <h2 className={cartsSectionTitleClass}>Domyślne parametry segmentów</h2>
            <p className="mt-1 text-xs text-slate-500">
              {isCreate
                ? "Stosowane do wszystkich półek przy tworzeniu. Możesz nadpisać pojedynczy segment w siatce."
                : "Zmiany per segment wykonuj klikając półkę w siatce."}
            </p>
            {isCreate ? (
              <>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Długość (mm)", defaultLength, setDefaultLength],
                      ["Szerokość (mm)", defaultWidth, setDefaultWidth],
                      ["Wysokość (mm)", defaultHeight, setDefaultHeight],
                    ] as const
                  ).map(([label, val, setter]) => (
                    <label key={label} className="block text-sm">
                      <span className={cartsFieldLabelClass}>{label}</span>
                      <input
                        type="number"
                        min={0}
                        max={MAX_DIM}
                        value={val}
                        onChange={(e) => setter(e.target.value)}
                        className={`${cartsAppInputClass} mt-1 tabular-nums`}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2">
                  <span className="text-xs font-medium text-slate-600">Pojemność (domyślna)</span>
                  <div className="font-mono text-lg font-bold text-violet-900">
                    {defaultCapacity != null ? `${defaultCapacity.toFixed(0)} dm³` : "—"}
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Wolne: {stats.free} · Zajęte: {stats.occupied}</p>
            )}
          </section>
        </div>

        <section className={`${cartsSectionClass} xl:sticky xl:top-4 xl:self-start`}>
          <h2 className={cartsSectionTitleClass}>Podgląd siatki</h2>
          <p className="mt-1 text-xs text-slate-500">
            Kliknij segment (A1, B2…) aby ustawić nazwę i wymiary. Skan:{" "}
            <span className="font-mono font-semibold">{rackName.trim() || "RK-XX"}/A1</span>
          </p>
          <div className="mt-4">
            <ConsolidationRackGrid
              rackName={rackName.trim() || "RK-01"}
              levels={previewLevels}
              onSegmentClick={(cell) => {
                if (isCreate) {
                  const col = gridMeta.columnLetters.indexOf(cell.columnName ?? "");
                  const row = cell.rowNumber - 1;
                  const key = draftSegmentKey(col >= 0 ? col : 0, row);
                  setDraftPanelKey(key);
                  const o = draftOverrides[key];
                  setPanel(
                    segmentToPanel(
                      rackName.trim() || "RK-01",
                      {
                        ...cell,
                        slotLabelCustom: o?.slot_label ?? null,
                        lengthMm: o?.length_mm ?? defaultDims.length_mm,
                        widthMm: o?.width_mm ?? defaultDims.width_mm,
                        heightMm: o?.height_mm ?? defaultDims.height_mm,
                      },
                      undefined,
                      false,
                    ),
                  );
                  return;
                }
                if (!rack || cell.segmentId == null) return;
                const hit = findSegmentInRack(rack, cell.segmentId);
                setPanel(segmentToPanel(rack.name, cell, hit?.seg, false));
              }}
            />
          </div>
        </section>
      </div>

      <ConsolidationRackSegmentPanel
        segment={panel}
        onClose={() => {
          setPanel(null);
          setDraftPanelKey(null);
        }}
        onSave={isCreate ? undefined : handleSegmentSave}
        onDraftSave={isCreate ? handleDraftSave : undefined}
      />
    </div>
  );
}
