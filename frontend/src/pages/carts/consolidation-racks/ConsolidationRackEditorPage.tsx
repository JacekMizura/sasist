import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../../../api/axios";
import { useWarehouse } from "../../../context/WarehouseContext";
import { cartsBtnPrimary, cartsPageShellClass } from "../../../modules/carts/cartsModuleTokens";
import ConsolidationRackGrid from "../../../modules/consolidation-racks/ConsolidationRackGrid";
import { ConsolidationRackFormShell } from "../../../modules/consolidation-racks/ConsolidationRackFormShell";
import ConsolidationRackSegmentModal from "../../../modules/consolidation-racks/ConsolidationRackSegmentModal";
import {
  findSegmentInRack,
  segmentToModal,
  type ConsolidationRack,
  type SegmentModalData,
  type SegmentSavePayload,
  type SegmentSaveResult,
} from "../../../modules/consolidation-racks/consolidationRackTypes";
import {
  buildLevelsFromGrid,
  buildPreviewLevelsFromGrid,
  draftSegmentKey,
  inferRackDefaultDims,
  levelsToGrid,
  rackOccupancyStats,
  segmentIsOverridden,
  type DraftSegmentOverrides,
  type RackGridLevel,
  type SegmentDimensionDefaults,
} from "../../../modules/consolidation-racks/rackLayoutUtils";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { ConsolidationRackDataFields, dimsFromStrings } from "./consolidationRackFormFields";

export default function ConsolidationRackEditorPage() {
  const { rackId } = useParams<{ rackId: string }>();
  const isCreate = !rackId || rackId === "new";
  const navigate = useNavigate();
  const { warehouse, warehouses, showWarehouseSelector } = useWarehouse();

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rack, setRack] = useState<ConsolidationRack | null>(null);
  const [loadedDefaults, setLoadedDefaults] = useState<SegmentDimensionDefaults>({});

  const [rackName, setRackName] = useState("RK-01");
  const [warehouseId, setWarehouseId] = useState<number>(warehouse?.id ?? 1);
  const [rowCount, setRowCount] = useState(4);
  const [colCount, setColCount] = useState(4);
  const [defaultLength, setDefaultLength] = useState("");
  const [defaultWidth, setDefaultWidth] = useState("");
  const [defaultHeight, setDefaultHeight] = useState("");
  const [draftOverrides, setDraftOverrides] = useState<DraftSegmentOverrides>({});
  const [modal, setModal] = useState<SegmentModalData | null>(null);
  const [draftModalKey, setDraftModalKey] = useState<string | null>(null);

  useEffect(() => {
    if (warehouse?.id) setWarehouseId(warehouse.id);
  }, [warehouse?.id]);

  const defaultDims = useMemo(
    () => dimsFromStrings(defaultLength, defaultWidth, defaultHeight),
    [defaultLength, defaultWidth, defaultHeight],
  );

  const previewLevels: RackGridLevel[] = useMemo(() => {
    if (!isCreate && rack) return rack.levels ?? [];
    return buildPreviewLevelsFromGrid(rowCount, colCount, defaultDims, draftOverrides);
  }, [isCreate, rack, rowCount, colCount, defaultDims, draftOverrides]);

  const stats = useMemo(() => rackOccupancyStats(previewLevels), [previewLevels]);
  const gridMeta = useMemo(() => levelsToGrid(previewLevels), [previewLevels]);

  const overriddenSegmentIds = useMemo(() => {
    const ids = new Set<number>();
    if (isCreate || !rack) return ids;
    const inferred = inferRackDefaultDims(rack.levels ?? []);
    for (const lv of rack.levels ?? []) {
      for (const seg of lv.segments ?? []) {
        if (seg.id != null && segmentIsOverridden(seg, inferred)) ids.add(seg.id);
      }
    }
    return ids;
  }, [isCreate, rack]);

  const draftOverrideKeys = useMemo(
    () => new Set(Object.keys(draftOverrides)),
    [draftOverrides],
  );

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
      const inferred = inferRackDefaultDims(data.levels ?? []);
      setLoadedDefaults(inferred);
      setDefaultLength(inferred.length_mm != null ? String(inferred.length_mm) : "");
      setDefaultWidth(inferred.width_mm != null ? String(inferred.width_mm) : "");
      setDefaultHeight(inferred.height_mm != null ? String(inferred.height_mm) : "");
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] load error:", err);
      setError("Nie udało się wczytać regału.");
    } finally {
      setLoading(false);
    }
  }, [warehouse?.id]);

  useEffect(() => {
    if (!isCreate && rackId) void loadRack(Number(rackId));
  }, [isCreate, rackId, loadRack]);

  const applyDefaultsToNonOverridden = async (rackData: ConsolidationRack, dims: SegmentDimensionDefaults) => {
    const inferred = inferRackDefaultDims(rackData.levels ?? []);
    for (const lv of rackData.levels ?? []) {
      for (const seg of lv.segments ?? []) {
        if (seg.id == null || segmentIsOverridden(seg, inferred)) continue;
        await api.patch(`/racks/segments/${seg.id}/`, {
          length_mm: dims.length_mm,
          width_mm: dims.width_mm,
          height_mm: dims.height_mm,
        });
      }
    }
  };

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
      navigate(`/carts/racks/${data.id}/edit`);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] create error:", err);
      setError("Nie udało się utworzyć regału.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!rack || !rackName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/racks/${rack.id}/`, { name: rackName.trim() });
      const dimsChanged =
        defaultDims.length_mm !== loadedDefaults.length_mm
        || defaultDims.width_mm !== loadedDefaults.width_mm
        || defaultDims.height_mm !== loadedDefaults.height_mm;
      if (dimsChanged) {
        await applyDefaultsToNonOverridden(rack, defaultDims);
      }
      await loadRack(rack.id);
      setLoadedDefaults(defaultDims);
    } catch (err: unknown) {
      console.error("[ConsolidationRackEditor] save error:", err);
      setError("Nie udało się zapisać regału.");
    } finally {
      setSaving(false);
    }
  };

  const handleSegmentSave = useCallback(
    async (segmentId: number, payload: SegmentSavePayload): Promise<SegmentSaveResult> => {
      const { data } = await api.patch<SegmentSaveResult>(`/racks/segments/${segmentId}/`, payload);
      if (rackId && !isCreate) await loadRack(Number(rackId));
      return data;
    },
    [isCreate, loadRack, rackId],
  );

  const handleRestoreDefaults = async (segmentId: number) => {
    await api.patch(`/racks/segments/${segmentId}/`, {
      slot_label: null,
      length_mm: defaultDims.length_mm,
      width_mm: defaultDims.width_mm,
      height_mm: defaultDims.height_mm,
    });
    if (rackId) await loadRack(Number(rackId));
  };

  const warehouseLabel =
    warehouses.find((w) => w.id === warehouseId)?.name ?? warehouse?.name ?? `#${warehouseId}`;

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
        subtitle="Konfiguracja OMS — wspólny profil wymiarowy + opcjonalne nadpisania segmentów"
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
              Skan: <span className="font-mono font-semibold">{rackName.trim() || "RK-XX"}/A1</span>
            </span>
          </div>
        }
        sidebar={
          <ConsolidationRackDataFields
            rackName={rackName}
            onRackNameChange={setRackName}
            warehouseId={warehouseId}
            warehouseLabel={warehouseLabel}
            onWarehouseChange={setWarehouseId}
            warehouses={warehouses}
            showWarehouseSelect={isCreate && showWarehouseSelector}
            rowCount={rowCount}
            colCount={colCount}
            onRowCountChange={setRowCount}
            onColCountChange={setColCount}
            gridLocked={!isCreate}
            defaultLength={defaultLength}
            defaultWidth={defaultWidth}
            defaultHeight={defaultHeight}
            onDefaultLengthChange={setDefaultLength}
            onDefaultWidthChange={setDefaultWidth}
            onDefaultHeightChange={setDefaultHeight}
          />
        }
        preview={
          <ConsolidationRackGrid
            rackName={rackName.trim() || "RK-01"}
            levels={previewLevels}
            overriddenSegmentIds={isCreate ? undefined : overriddenSegmentIds}
            overriddenCellKeys={isCreate ? draftOverrideKeys : undefined}
            onSegmentClick={(cell) => {
              if (isCreate) {
                const col = gridMeta.columnLetters.indexOf(cell.columnName ?? "");
                const row = cell.rowNumber - 1;
                const key = draftSegmentKey(col >= 0 ? col : 0, row);
                setDraftModalKey(key);
                const o = draftOverrides[key];
                const isOverridden = draftOverrideKeys.has(key);
                setModal(
                  segmentToModal(
                    rackName.trim() || "RK-01",
                    {
                      ...cell,
                      slotLabelCustom: o?.slot_label ?? null,
                      lengthMm: o?.length_mm ?? defaultDims.length_mm,
                      widthMm: o?.width_mm ?? defaultDims.width_mm,
                      heightMm: o?.height_mm ?? defaultDims.height_mm,
                      isOverridden,
                    },
                    undefined,
                    false,
                  ),
                );
                return;
              }
              if (!rack || cell.segmentId == null) return;
              const hit = findSegmentInRack(rack, cell.segmentId);
              const inferred = inferRackDefaultDims(rack.levels ?? []);
              setModal(
                segmentToModal(
                  rack.name,
                  {
                    ...cell,
                    isOverridden: hit ? segmentIsOverridden(hit.seg, inferred) : false,
                  },
                  hit?.seg,
                  false,
                ),
              );
            }}
          />
        }
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Kliknij segment w siatce, aby opcjonalnie nadpisać nazwę lub wymiary (advanced).
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

      <ConsolidationRackSegmentModal
        segment={modal}
        rackDefaults={defaultDims}
        onClose={() => {
          setModal(null);
          setDraftModalKey(null);
        }}
        onSave={isCreate ? undefined : handleSegmentSave}
        onDraftSave={
          isCreate
            ? async (payload) => {
                if (!draftModalKey) return;
                setDraftOverrides((prev) => ({
                  ...prev,
                  [draftModalKey]: {
                    slot_label: payload.slot_label,
                    length_mm: payload.length_mm,
                    width_mm: payload.width_mm,
                    height_mm: payload.height_mm,
                  },
                }));
              }
            : undefined
        }
        onDraftRestore={
          isCreate && draftModalKey
            ? async () => {
                setDraftOverrides((prev) => {
                  const next = { ...prev };
                  delete next[draftModalKey];
                  return next;
                });
              }
            : undefined
        }
        onRestoreDefaults={isCreate ? undefined : handleRestoreDefaults}
      />
    </div>
  );
}
