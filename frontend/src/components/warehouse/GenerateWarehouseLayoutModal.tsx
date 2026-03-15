import { useState, useMemo } from "react";
import type { LayoutState, CustomRackTemplate, CatalogItem, CatalogPresetId } from "../../types/warehouse";
import { CATALOG_PRESETS } from "../../types/warehouse";
import { getCatalogItemSpec, metersToCells, cmToCells } from "./warehouseUtils";
import {
  generateWarehouseLayout,
  getPreviewLabels,
  hasOverlapWithRacks,
  planRackRowsForBuilding,
  plannedStructureToRowCount,
  type LayoutGeneratorTemplate,
  type LayoutGeneratorResult,
} from "./layoutGenerator";

export type GenerateLayoutMode = "append" | "replace";

export type GenerateWarehouseLayoutModalProps = {
  onClose: () => void;
  onConfirm: (result: LayoutGeneratorResult, mode: GenerateLayoutMode) => void;
  layout: LayoutState;
  customTemplates: CustomRackTemplate[];
  /** Pre-selected catalog item (e.g. from sidebar). */
  initialTemplate?: CatalogItem | null;
};

const DEFAULT_ROWS = 4;
const DEFAULT_COLUMNS = 3;
const DEFAULT_RACK_SPACING_CM = 280;
const DEFAULT_AISLE_WIDTH_CM = 320;

export function GenerateWarehouseLayoutModal({
  onClose,
  onConfirm,
  layout,
  customTemplates,
  initialTemplate = null,
}: GenerateWarehouseLayoutModalProps) {
  const catalogItems: CatalogItem[] = useMemo(() => {
    const presets: CatalogItem[] = CATALOG_PRESETS.map((p) => ({ type: "preset", id: p.id }));
    const custom: CatalogItem[] = customTemplates.map((t) => ({ type: "custom", template: t }));
    return [...presets, ...custom];
  }, [customTemplates]);

  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(() => initialTemplate ?? catalogItems[0] ?? null);
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [rackSpacingCm, setRackSpacingCm] = useState(DEFAULT_RACK_SPACING_CM);
  const [aisleWidthCm, setAisleWidthCm] = useState(DEFAULT_AISLE_WIDTH_CM);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [startRowPrefix, setStartRowPrefix] = useState("A");
  const [mode, setMode] = useState<GenerateLayoutMode>("append");
  const [overlapWarning, setOverlapWarning] = useState(false);
  const [autoFillWarehouse, setAutoFillWarehouse] = useState(false);

  const spec = useMemo(() => (selectedItem ? getCatalogItemSpec(selectedItem) : null), [selectedItem]);

  const templateForGenerator: LayoutGeneratorTemplate | null = useMemo(() => {
    if (!spec) return null;
    const base = {
      ...spec,
      templateId: selectedItem?.type === "custom" ? selectedItem.template.id : undefined,
    };
    return base as LayoutGeneratorTemplate;
  }, [spec, selectedItem]);

  const buildingDepthM = layout.building_depth_m ?? layout.building_height_m;
  const maxCols = layout.building_width_m != null ? metersToCells(layout.building_width_m) : layout.grid_cols;
  const maxRows = buildingDepthM != null ? metersToCells(buildingDepthM) : layout.grid_rows;
  const rackW = spec ? cmToCells(spec.width_cm) : 0;
  const rackH = spec ? cmToCells(spec.depth_cm) : 0;
  const spacingCells = Math.max(0, cmToCells(rackSpacingCm));
  const aisleCells = Math.max(0, cmToCells(aisleWidthCm));
  const wallGapCells = Math.max(0, cmToCells(30));
  const autoFillComputed = useMemo(() => {
    if (!autoFillWarehouse || !spec || maxCols == null || maxRows == null || maxCols <= 0 || maxRows <= 0)
      return null;
    const rackWidthCells = cmToCells(spec.width_cm);
    const rackDepthCells = cmToCells(spec.depth_cm);
    const columnStep = rackWidthCells + spacingCells;
    const usableWidth = maxCols - wallGapCells * 2;
    const columns = Math.max(0, Math.floor(usableWidth / columnStep));
    const structure = planRackRowsForBuilding(maxRows, rackDepthCells, aisleCells, wallGapCells);
    const rows = plannedStructureToRowCount(structure);
    return { rows, columns };
  }, [autoFillWarehouse, spec, maxCols, maxRows, spacingCells, aisleCells, wallGapCells]);

  const effectiveRows = autoFillWarehouse && autoFillComputed ? autoFillComputed.rows : rows;
  const effectiveColumns = autoFillWarehouse && autoFillComputed ? autoFillComputed.columns : columns;
  const previewGrid = useMemo(
    () => getPreviewLabels(effectiveRows, effectiveColumns, startRowPrefix),
    [effectiveRows, effectiveColumns, startRowPrefix]
  );

  const stepW = rackW + spacingCells;
  const stepH = rackH + aisleCells;
  const stepBetweenRows = rackW + aisleCells;
  const stepInRow = rackH + spacingCells;
  const hasBuildingLimits = layout.building_width_m != null && buildingDepthM != null;
  const firstRackExceeds =
    hasBuildingLimits &&
    (autoFillWarehouse ? false : (startX + rackW > maxCols || startY + rackH > maxRows));
  const lastRackRight =
    orientation === "horizontal"
      ? (autoFillWarehouse ? wallGapCells : startX) + (effectiveColumns - 1) * stepW + rackW
      : (autoFillWarehouse ? wallGapCells : startX) + (effectiveRows - 1) * stepBetweenRows + rackW;
  const lastRackBottom =
    orientation === "horizontal"
      ? (autoFillWarehouse ? wallGapCells : startY) + (effectiveRows - 1) * stepH + rackH
      : (autoFillWarehouse ? wallGapCells : startY) + (effectiveColumns - 1) * stepInRow + rackH;
  const wouldTruncate =
    hasBuildingLimits &&
    (lastRackRight > maxCols || lastRackBottom > maxRows);

  const handleGenerate = () => {
    if (!templateForGenerator) return;
    if (!autoFillWarehouse && (rows < 1 || columns < 1)) return;
    if (autoFillWarehouse && (!autoFillComputed || autoFillComputed.rows < 1 || autoFillComputed.columns < 1)) return;
    const baseRackIndex = mode === "replace" ? 1 : layout.racks.length + 1;
    const result = generateWarehouseLayout({
      template: templateForGenerator,
      rows: effectiveRows,
      columns: effectiveColumns,
      rackSpacingCm,
      aisleWidthCm,
      orientation,
      startX: autoFillWarehouse ? wallGapCells : startX,
      startY: autoFillWarehouse ? wallGapCells : startY,
      startRowPrefix,
      baseRackIndex,
      maxCols: layout.building_width_m != null ? maxCols : undefined,
      maxRows: buildingDepthM != null ? maxRows : undefined,
      autoFillWarehouse,
    });

    const existingRects = layout.racks.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    const newRects = result.racks.map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
    const overlaps = mode === "append" && hasOverlapWithRacks(newRects, existingRects);
    if (overlaps) {
      setOverlapWarning(true);
      return;
    }
    setOverlapWarning(false);
    onConfirm(result, mode);
    onClose();
  };

  const canGenerate =
    templateForGenerator != null &&
    !firstRackExceeds &&
    (autoFillWarehouse
      ? hasBuildingLimits && autoFillComputed != null && autoFillComputed.rows >= 1 && autoFillComputed.columns >= 1
      : rows >= 1 && columns >= 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Generuj układ magazynu</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Szablon</label>
            <select
              value={selectedItem ? (selectedItem.type === "preset" ? `preset-${selectedItem.id}` : `custom-${selectedItem.template.id}`) : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) setSelectedItem(null);
                else if (v.startsWith("preset-")) {
                  const id = v.slice(7);
                  setSelectedItem({ type: "preset", id: id as CatalogPresetId });
                } else {
                  const id = v.slice(7);
                  const t = customTemplates.find((x) => x.id === id);
                  if (t) setSelectedItem({ type: "custom", template: t });
                }
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
            >
              {catalogItems.map((item) => {
                const key = item.type === "preset" ? `preset-${item.id}` : `custom-${item.template.id}`;
                const label = item.type === "preset" ? (CATALOG_PRESETS.find((p) => p.id === item.id)?.label ?? item.id) : item.template.name;
                return (
                  <option key={key} value={key}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={autoFillWarehouse}
                onChange={(e) => setAutoFillWarehouse(e.target.checked)}
              />
              <span className="text-sm font-semibold text-slate-700">Auto fill warehouse</span>
            </label>
            <p className="text-xs text-slate-500 mb-3">
              {autoFillWarehouse
                ? "Rows and columns are computed from building size and rack template."
                : "Set rows and columns manually."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Liczba rzędów</label>
              <input
                type="number"
                min={1}
                max={50}
                value={autoFillWarehouse && autoFillComputed ? autoFillComputed.rows : rows}
                onChange={(e) => setRows(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                disabled={autoFillWarehouse}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Regały na rząd</label>
              <input
                type="number"
                min={1}
                max={50}
                value={autoFillWarehouse && autoFillComputed ? autoFillComputed.columns : columns}
                onChange={(e) => setColumns(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                disabled={autoFillWarehouse}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Odstęp między regałami (cm)</label>
              <input
                type="number"
                min={0}
                step={10}
                value={rackSpacingCm}
                onChange={(e) => setRackSpacingCm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-0.5">{rackSpacingCm / 100} m</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Szerokość przejścia (cm)</label>
              <input
                type="number"
                min={0}
                step={10}
                value={aisleWidthCm}
                onChange={(e) => setAisleWidthCm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-0.5">{aisleWidthCm / 100} m</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Orientacja</label>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as "horizontal" | "vertical")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="horizontal">Pozioma (rzędy wzdłuż Y)</option>
              <option value="vertical">Pionowa (rzędy wzdłuż X)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Początek X (komórki)</label>
              <input
                type="number"
                min={0}
                value={startX}
                onChange={(e) => setStartX(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Początek Y (komórki)</label>
              <input
                type="number"
                min={0}
                value={startY}
                onChange={(e) => setStartY(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1">Prefiks pierwszego rzędu</label>
            <input
              type="text"
              value={startRowPrefix}
              onChange={(e) => setStartRowPrefix(e.target.value.trim() || "A")}
              placeholder="A"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">Tryb</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="mode" checked={mode === "append"} onChange={() => setMode("append")} />
                <span>Dołącz do układu</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                <span>Zastąp układ</span>
              </label>
            </div>
          </div>

          {overlapWarning && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
              Generated racks overlap existing layout. Change start position or use Replace mode.
            </div>
          )}
          {wouldTruncate && !overlapWarning && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
              Generated layout exceeds building size. Layout will be truncated.
            </div>
          )}

          <div>
            <span className="block text-sm font-semibold text-slate-600 mb-2">Podgląd nazw</span>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 overflow-x-auto">
              <div className="inline-block font-mono text-sm">
                {previewGrid.map((row, i) => (
                  <div key={i} className="flex gap-2 flex-wrap">
                    {row.map((label, j) => (
                      <span key={j} className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                        {label}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-medium hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generuj
          </button>
        </div>
      </div>
    </div>
  );
}
