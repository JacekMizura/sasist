import type React from "react";
import { useRef } from "react";
import type { RackState, VisualElementType, VisualElementState, ColumnShape, DoorStyle, ZoneType } from "../../types/warehouse";
import { GRID_UNIT_CM } from "../../types/warehouse";
import { useWheelScrollBoundaryContain } from "../../hooks/useWheelScrollBoundaryContain";
import { WarehouseCanvas, type WarehouseCanvasProps } from "./WarehouseCanvas";
import { RackPropertiesSidebar } from "./RackPropertiesSidebar";
import { ElevationSidePanel, VisualElementPanelShell } from "./ElevationSidePanel";
import { AppRightPanel, AppSplitView } from "../layout/app";
import { UI_STRINGS } from "../../constants/uiStrings";
import type { WarehouseProduct } from "../../types/warehouse";

/** Return keyboard focus to the layout canvas after closing a side panel. */
export function focusWarehouseCanvasScroll() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>("[data-warehouse-canvas-scroll]");
    el?.focus({ preventScroll: true });
  });
}

export type WarehouseMainViewProps = WarehouseCanvasProps & {
  setSelectedVisualId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedVisualIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedAisleIndex: (v: number | null) => void;
  selectedRacks: RackState[];
  rackPanelOpen: boolean;
  /** Rack shown in properties drawer (may differ from canvas selection). */
  propertiesRack?: RackState | null;
  editingRackId?: number | string | null;
  setEditingRackId?: (id: number | string | null) => void;
  onCloseRackPanel: () => void;
  onSaveLayout?: () => void;
  saving?: boolean;
  lastSavedAt?: number | null;
  warehouseLabel?: string;
  /** Elevation (side view) panel — layout designer only. */
  showElevationForRackId?: number | string | null;
  products?: WarehouseProduct[];
  selectedBinForFilter?: { level_index: number; segment_index: number } | null;
  setSelectedBinForFilter?: (v: { level_index: number; segment_index: number } | null) => void;
  onCloseElevation?: () => void;
  onAddProduct?: () => void;
  onEditProduct?: (id: string) => void;
};

export function WarehouseMainView(props: WarehouseMainViewProps) {
  const { setSelectedVisualId, setSelectedVisualIds, ...canvasProps } = props;
  const {
    layout,
    setLayout,
    selectedVisualIds = [],
    selectedAisleIndex,
    setSelectedAisleIndex,
    selectedRack,
    propertiesRack,
    editingRackId,
    setEditingRackId,
    selectedRacks,
    rackPanelOpen,
    onCloseRackPanel,
    onSaveLayout,
    saving,
    lastSavedAt,
    warehouseLabel,
    showElevationForRackId = null,
    products = [],
    selectedBinForFilter = null,
    setSelectedBinForFilter,
    onCloseElevation,
    onAddProduct,
    onEditProduct,
    isMultiSelect,
    selectedRackIds,
    setShowElevationForRackId,
    setInternalLayoutRackId,
    setSelectedRackId,
    setSelectedRackIds,
    cursorCm,
  } = props;

  const visualAsideRef = useRef<HTMLElement>(null);
  const aisleAsideRef = useRef<HTMLElement>(null);
  const scrollResubKey = `${selectedVisualIds.join(",")}|${selectedAisleIndex ?? ""}`;
  useWheelScrollBoundaryContain(visualAsideRef, selectedVisualIds.length > 0, scrollResubKey);
  useWheelScrollBoundaryContain(
    aisleAsideRef,
    selectedAisleIndex != null && selectedVisualIds.length === 0,
    scrollResubKey
  );

  const showRackPanel =
    rackPanelOpen &&
    (propertiesRack ?? selectedRack) != null &&
    selectedAisleIndex == null &&
    selectedVisualIds.length === 0 &&
    showElevationForRackId == null;

  let rightPanel: React.ReactNode = null;

  if (showElevationForRackId != null && onCloseElevation && setSelectedBinForFilter) {
    rightPanel = (
      <ElevationSidePanel
        layout={layout}
        rackId={showElevationForRackId}
        products={products}
        selectedBinForFilter={selectedBinForFilter}
        setSelectedBinForFilter={setSelectedBinForFilter}
        onClose={onCloseElevation}
        onAddProduct={onAddProduct ?? (() => {})}
        onEditProduct={onEditProduct ?? (() => {})}
      />
    );
  } else if (selectedVisualIds.length > 0) {
    const ve = (layout.visual_elements ?? []).find((v) => v.id === selectedVisualIds[0]);
    if (ve) {
          const typeLabels: Record<VisualElementType, string> = {
            column: "Słupy", mezzanine: "Antresole", packing_station: "Stanowiska pakowania", cart: "Wózki",
            wall: "Ściany", door: "Drzwi", zone: "Strefa",
          };
          const updateVe = (patch: Partial<VisualElementState>) => {
            setLayout((prev) => ({
              ...prev,
              visual_elements: (prev.visual_elements ?? []).map((el) => (selectedVisualIds.includes(el.id) ? { ...el, ...patch } : el)),
            }));
          };
          const updateSingleVe = (patch: Partial<VisualElementState>) => {
            setLayout((prev) => ({
              ...prev,
              visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, ...patch } : el)),
            }));
          };
          const defaultColor = (t: VisualElementType) => t === "zone" ? "#3b82f640" : (t === "wall" ? "#64748b" : (t === "door" ? "#94a3b8" : "#64748b"));
          const fillColor = ve.color ?? defaultColor(ve.type);
          const hex6 = fillColor.length >= 7 ? fillColor.slice(0, 7) : fillColor;
      rightPanel = (
            <VisualElementPanelShell>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b7280] mb-4">Element wizualny – Edycja</h3>
              {selectedVisualIds.length > 1 && <p className="text-[10px] text-slate-600 mb-1">Zaznaczono {selectedVisualIds.length} elementów</p>}
              <p className="text-[#1E293B] text-sm font-semibold">{typeLabels[ve.type]}</p>
              <p className="text-[10px] text-slate-400 mt-1">{ve.width}×{ve.height} kom.</p>
              <div className="mt-4">
                <label className="block text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b7280] mb-1">Etykieta (na mapie)</label>
                <input type="text" value={ve.label ?? ve.name ?? ""} onChange={(e) => updateSingleVe({ label: e.target.value || undefined, name: e.target.value || undefined })} placeholder="np. Brama Północna" className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
              </div>
              <div className="mt-2">
                <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Kolor</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={hex6} onChange={(e) => updateVe({ color: ve.type === "zone" ? e.target.value + "40" : e.target.value })} className="w-10 h-8 rounded border border-[#E2E8F0] bg-slate-50 cursor-pointer" />
                  <input type="text" value={fillColor} readOnly className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-[10px] font-mono" title="Kolor wypełnienia" />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Szer. (kom.)</label>
                  <input type="number" min={1} value={ve.width} onChange={(e) => updateVe({ width: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Wys. (kom.)</label>
                  <input type="number" min={1} value={ve.height} onChange={(e) => updateVe({ height: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                </div>
              </div>
              <div className="mt-2">
                <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Obrót (°)</label>
                <input type="number" min={0} max={360} step={15} value={ve.rotation ?? 0} onChange={(e) => updateVe({ rotation: Math.max(0, Math.min(360, Number(e.target.value) || 0)) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
              </div>
              {ve.type === "column" && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Kształt</label>
                    <select
                      value={ve.columnShape ?? "square"}
                      onChange={(e) => updateVe({ columnShape: e.target.value as ColumnShape, ...(e.target.value === "circle" && ve.diameter == null ? { diameter: 2 } : {}) })}
                      className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
                    >
                      <option value="square">Kwadrat</option>
                      <option value="rectangle">Prostokąt</option>
                      <option value="circle">Koło</option>
                    </select>
                  </div>
                  {(ve.columnShape === "rectangle" || ve.columnShape === "square" || !ve.columnShape) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Szer. (kom.)</label>
                        <input type="number" min={1} value={ve.width} onChange={(e) => updateVe({ width: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Gł. (kom.)</label>
                        <input type="number" min={1} value={ve.height} onChange={(e) => updateVe({ height: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                      </div>
                    </div>
                  )}
                  {ve.columnShape === "circle" && (
                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Średnica (kom.)</label>
                      <input type="number" min={1} value={ve.diameter ?? 2} onChange={(e) => updateVe({ diameter: Math.max(1, Number(e.target.value) || 1), width: Math.max(1, Number(e.target.value) || 1), height: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                    </div>
                  )}
                </div>
              )}
              {ve.type === "wall" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Długość (kom.)</label>
                    <input type="number" min={1} value={ve.length ?? ve.width} onChange={(e) => updateVe({ length: Math.max(1, Number(e.target.value) || 1), width: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Grubość (kom.)</label>
                    <input type="number" min={1} value={ve.thickness ?? ve.height} onChange={(e) => updateVe({ thickness: Math.max(1, Number(e.target.value) || 1), height: Math.max(1, Number(e.target.value) || 1) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                  </div>
                </div>
              )}
              {ve.type === "door" && (
                <div className="mt-2">
                  <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Typ drzwi</label>
                  <select value={ve.doorStyle ?? "hinged"} onChange={(e) => updateVe({ doorStyle: e.target.value as DoorStyle })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs">
                    <option value="hinged">Skrzydłowe</option>
                    <option value="sliding">Przesuwane</option>
                  </select>
                </div>
              )}
              {ve.type === "zone" && (
                <div className="mt-2 space-y-2">
                  <div className="rounded bg-slate-50 p-2 border border-[#E2E8F0]">
                    <p className="text-[10px] text-slate-500 uppercase mb-0.5">Objętość 3D</p>
                    <p className="text-xs font-mono text-[#1E293B]">W × D × H: {(ve.width_cm ?? ve.width * GRID_UNIT_CM)} × {(ve.depth_cm ?? 100)} × {(ve.height_cm ?? 50)} cm</p>
                    <p className="text-xs font-mono text-slate-600 mt-0.5">Całkowita objętość: {(((ve.width_cm ?? ve.width * GRID_UNIT_CM) * (ve.depth_cm ?? 100) * (ve.height_cm ?? 50)) / 1000).toFixed(0)} dm³</p>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">Typ strefy</label>
                    <select value={ve.zoneType ?? "reception"} onChange={(e) => updateVe({ zoneType: e.target.value as ZoneType, color: e.target.value === "shipping" ? "#0ea5e940" : "#3b82f640" })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs">
                      <option value="reception">Przyjęcia</option>
                      <option value="shipping">Wysyłka</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Szer. (cm) <span className="text-red-500">*</span></label>
                      <input type="number" min={10} required value={ve.width_cm ?? ve.width * GRID_UNIT_CM} onChange={(e) => { const v = Number(e.target.value) || 10; const w = v; const d = ve.depth_cm ?? 100; const h = ve.height_cm ?? 50; updateVe({ width_cm: w, total_volume_dm3: (w * d * h) / 1000 }); }} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Gł. (cm) <span className="text-red-500">*</span></label>
                      <input type="number" min={10} required value={ve.depth_cm ?? 100} onChange={(e) => { const v = Number(e.target.value) || 10; const w = ve.width_cm ?? ve.width * GRID_UNIT_CM; const d = v; const h = ve.height_cm ?? 50; updateVe({ depth_cm: d, total_volume_dm3: (w * d * h) / 1000 }); }} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Wys. (cm) <span className="text-red-500">*</span></label>
                      <input type="number" min={10} required value={ve.height_cm ?? ve.height * GRID_UNIT_CM} onChange={(e) => { const v = Number(e.target.value) || 10; const w = ve.width_cm ?? ve.width * GRID_UNIT_CM; const d = ve.depth_cm ?? 100; const h = v; updateVe({ height_cm: h, total_volume_dm3: (w * d * h) / 1000 }); }} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 font-medium">Objętość: {(((ve.width_cm ?? ve.width * GRID_UNIT_CM) * (ve.depth_cm ?? 100) * (ve.height_cm ?? 50)) / 1000).toFixed(0)} dm³</p>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase mb-0.5">{UI_STRINGS.warehouse.columns.occupancyDm3}</label>
                    <input type="number" min={0} value={ve.current_occupancy_dm3 ?? 0} onChange={(e) => updateVe({ current_occupancy_dm3: Math.max(0, Number(e.target.value) || 0) })} className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs" />
                    <p className="text-[9px] text-slate-500 mt-0.5">{(ve.total_volume_dm3 ?? 0) > 0 ? `${Math.min(100, Math.round(((ve.current_occupancy_dm3 ?? 0) / (ve.total_volume_dm3 ?? 1)) * 100))}%` : "0%"} zajęte</p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => { const maxZ = Math.max(0, ...(layout.visual_elements ?? []).map((x) => x.zIndex)); setLayout((prev) => ({ ...prev, visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, zIndex: maxZ + 1 } : el)) })); }} className="px-2 py-1.5 rounded-lg bg-slate-100 text-[#1E293B] text-xs font-semibold hover:bg-slate-200 border border-slate-100">{UI_STRINGS.warehouse.visuals.toFront}</button>
                <button type="button" onClick={() => { const minZ = Math.min(0, ...(layout.visual_elements ?? []).map((x) => x.zIndex)); setLayout((prev) => ({ ...prev, visual_elements: (prev.visual_elements ?? []).map((el) => (el.id === ve.id ? { ...el, zIndex: minZ - 1 } : el)) })); }} className="px-2 py-1.5 rounded-lg bg-slate-100 text-[#1E293B] text-xs font-semibold hover:bg-slate-200 border border-slate-100">{UI_STRINGS.warehouse.visuals.toBack}</button>
                <button type="button" onClick={() => { setLayout((prev) => ({ ...prev, visual_elements: (prev.visual_elements ?? []).filter((el) => !selectedVisualIds.includes(el.id)) })); setSelectedVisualId(null); setSelectedVisualIds([]); }} className="px-2 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 border border-red-200">{UI_STRINGS.warehouse.visuals.delete}</button>
              </div>
            </VisualElementPanelShell>
      );
    }
  } else if (selectedAisleIndex != null && selectedVisualIds.length === 0) {
          const aisle = layout.aisles[selectedAisleIndex];
          if (aisle) {
      rightPanel = (
            <VisualElementPanelShell className="p-3">
              <h3 className="text-xs font-black uppercase text-slate-600 mb-1">Strefa wizualna</h3>
              <p className="text-[10px] text-slate-500 mb-2 leading-snug" title="Strefa to element wizualny – nie wpływa na routing ani logistykę">
                Element pomocniczy na planie — wyłącznie do oznaczeń; nie steruje trasami ani kompletacją.
              </p>
              <div className="space-y-2 text-[11px]">
                <div>
                  <label className="block text-slate-400 uppercase mb-0.5">{UI_STRINGS.warehouse.visuals.name}</label>
                  <input
                    type="text"
                    value={aisle.name ?? ""}
                    onChange={(e) =>
                      setLayout((prev) => ({
                        ...prev,
                        aisles: prev.aisles.map((a, i) => (i === selectedAisleIndex ? { ...a, name: e.target.value } : a)),
                      }))
                    }
                    placeholder="np. Główna 1"
                    className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 uppercase mb-0.5">X (kom.)</label>
                    <input
                      type="number"
                      min={0}
                      value={aisle.x}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          aisles: prev.aisles.map((a, i) => (i === selectedAisleIndex ? { ...a, x: Number(e.target.value) || 0 } : a)),
                        }))
                      }
                      className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 uppercase mb-0.5">Y (kom.)</label>
                    <input
                      type="number"
                      min={0}
                      value={aisle.y}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          aisles: prev.aisles.map((a, i) => (i === selectedAisleIndex ? { ...a, y: Number(e.target.value) || 0 } : a)),
                        }))
                      }
                      className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 uppercase mb-0.5">Szer.</label>
                    <input
                      type="number"
                      min={1}
                      value={aisle.width}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          aisles: prev.aisles.map((a, i) => (i === selectedAisleIndex ? { ...a, width: Math.max(1, Number(e.target.value) || 1) } : a)),
                        }))
                      }
                      className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 uppercase mb-0.5">Wys.</label>
                    <input
                      type="number"
                      min={1}
                      value={aisle.height}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          aisles: prev.aisles.map((a, i) => (i === selectedAisleIndex ? { ...a, height: Math.max(1, Number(e.target.value) || 1) } : a)),
                        }))
                      }
                      className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLayout((prev) => ({ ...prev, aisles: prev.aisles.filter((_, i) => i !== selectedAisleIndex) }));
                    setSelectedAisleIndex(null);
                  }}
                  className="w-full mt-2 px-3 py-2 rounded-lg bg-red-600/80 text-red-100 text-xs font-semibold hover:bg-red-500"
                >
                  {UI_STRINGS.warehouse.visuals.deleteAisle}
                </button>
              </div>
            </VisualElementPanelShell>
      );
    }
  } else if (showRackPanel) {
    rightPanel = (
      <AppRightPanel
        open
        bare
        resizable
        widthStorageKey="wms.rackPropertiesSidebarWidth"
        aria-label="Właściwości regału"
      >
        <RackPropertiesSidebar
          layout={layout}
          selectedRack={propertiesRack ?? selectedRack ?? null}
          editingRackId={editingRackId ?? null}
          onEditingRackIdChange={setEditingRackId}
          selectedRacks={selectedRacks}
          isMultiSelect={isMultiSelect}
          selectedRackIds={selectedRackIds}
          setLayout={setLayout}
          setShowElevationForRackId={setShowElevationForRackId}
          setInternalLayoutRackId={setInternalLayoutRackId}
          setSelectedRackId={setSelectedRackId}
          setSelectedRackIds={setSelectedRackIds}
          onClose={onCloseRackPanel}
          onSaveLayout={onSaveLayout}
          saving={saving}
          lastSavedAt={lastSavedAt}
          warehouseLabel={warehouseLabel}
        />
      </AppRightPanel>
    );
  }

  return (
    <AppSplitView right={rightPanel ?? undefined}>
      <div className="m-0 flex min-h-0 min-w-0 max-w-full flex-1 basis-0 flex-col overflow-hidden p-0">
        <div
          data-warehouse-canvas-scroll
          tabIndex={-1}
          className="flex min-h-0 min-w-0 max-w-full w-full flex-1 flex-col overflow-auto outline-none"
        >
          <WarehouseCanvas {...canvasProps} />
        </div>
      </div>
    </AppSplitView>
  );
}
