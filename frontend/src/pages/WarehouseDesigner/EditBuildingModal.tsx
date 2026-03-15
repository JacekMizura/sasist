import { useState, useEffect, useMemo } from "react";
import type { LayoutState } from "../../types/warehouse";
import { metersToCells } from "../../components/warehouse/warehouseUtils";

export type EditBuildingModalProps = {
  onClose: () => void;
  onSave: (building_width_m: number, building_depth_m: number, building_height_m: number) => void;
  layout: LayoutState;
};

export function EditBuildingModal({ onClose, onSave, layout }: EditBuildingModalProps) {
  const depthFromLayout = layout.building_depth_m ?? layout.building_height_m;
  const [widthM, setWidthM] = useState(() => layout.building_width_m ?? layout.grid_cols / 10);
  const [depthM, setDepthM] = useState(() => depthFromLayout ?? layout.grid_rows / 10);
  const [heightM, setHeightM] = useState(() => layout.building_height_m ?? 0);
  const [showShrinkWarning, setShowShrinkWarning] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ w: number; d: number; h: number } | null>(null);

  useEffect(() => {
    const depthVal = layout.building_depth_m ?? layout.building_height_m;
    setWidthM(layout.building_width_m ?? layout.grid_cols / 10);
    setDepthM(depthVal ?? layout.grid_rows / 10);
    setHeightM(layout.building_height_m ?? 0);
  }, [layout.building_width_m, layout.building_depth_m, layout.building_height_m, layout.grid_cols, layout.grid_rows]);

  const areaM2 = useMemo(() => {
    const w = Number(widthM);
    const d = Number(depthM);
    return w > 0 && d > 0 ? Math.round(w * d) : 0;
  }, [widthM, depthM]);

  const volumeM3 = useMemo(() => {
    const w = Number(widthM);
    const d = Number(depthM);
    const h = Number(heightM);
    return w > 0 && d > 0 && h > 0 ? Math.round(w * d * h) : 0;
  }, [widthM, depthM, heightM]);

  const racksOutsideCount = useMemo(() => {
    const w = Number(widthM);
    const d = Number(depthM);
    if (w <= 0 || d <= 0) return 0;
    const maxCols = metersToCells(w);
    const maxRows = metersToCells(d);
    return layout.racks.filter(
      (r) => r.x + r.width > maxCols || r.y + r.height > maxRows
    ).length;
  }, [widthM, depthM, layout.racks]);

  const handleSave = () => {
    const w = Number(widthM);
    const d = Number(depthM);
    const h = Math.max(0, Number(heightM));
    if (w <= 0 || d <= 0) return;
    console.log("Saving building", {
      width: w,
      depth: d,
      height: h,
      building_width_m: w,
      building_depth_m: d,
      building_height_m: h,
    });
    if (racksOutsideCount > 0) {
      setPendingSave({ w, d, h });
      setShowShrinkWarning(true);
      return;
    }
    onSave(w, d, h);
    onClose();
  };

  const handleSaveAnyway = () => {
    if (pendingSave) {
      onSave(pendingSave.w, pendingSave.d, pendingSave.h);
      setPendingSave(null);
      setShowShrinkWarning(false);
      onClose();
    }
  };

  const handleCancelWarning = () => {
    setShowShrinkWarning(false);
    setPendingSave(null);
  };

  if (showShrinkWarning && racksOutsideCount > 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleCancelWarning}>
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-800">Uwaga</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-700">
              {racksOutsideCount} {racksOutsideCount === 1 ? "regał będzie" : "regały będą"} poza granicą budynku.
            </p>
          </div>
          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
            <button type="button" onClick={handleCancelWarning} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSaveAnyway}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-500"
            >
              Zapisz mimo to
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Ustaw wymiary budynku</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Szerokość (m)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={widthM}
              onChange={(e) => setWidthM(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Głębokość (m)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={depthM}
              onChange={(e) => setDepthM(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Wysokość (m)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={heightM}
              onChange={(e) => setHeightM(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Opcjonalnie"
            />
          </div>
          {areaM2 > 0 && (
            <p className="text-sm text-slate-600">Powierzchnia: {areaM2} m²</p>
          )}
          {volumeM3 > 0 && (
            <p className="text-sm text-slate-600">Kubatura: {volumeM3} m³</p>
          )}
          <p className="text-xs text-slate-500">Siatka i regały będą ograniczone do tego obszaru.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100">
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={Number(widthM) <= 0 || Number(depthM) <= 0}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
}
