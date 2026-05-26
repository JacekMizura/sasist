import { useEffect, useState, useMemo } from "react";
import type { LayoutState, CustomRackTemplate, CatalogItem, RackType } from "../../types/warehouse";
import {
  getCatalogItemSpec,
  assignUniqueRackNamesToNewRacks,
  getLevelConfig,
  getTotalLocations,
  volumePerBinFromTotal,
} from "./warehouseUtils";
import {
  getLayoutMetersPerCell,
  layoutCmToCellsX,
  layoutCmToCellsY,
} from "../../utils/warehouseGridMetrics";
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
  rackType: RackType;
  /** Pre-selected catalog item (e.g. from sidebar). */
  initialTemplate?: CatalogItem | null;
};

const DEFAULT_ROWS = 4;
const DEFAULT_COLUMNS = 3;
const DEFAULT_RACK_SPACING_CM = 280;
const DEFAULT_AISLE_WIDTH_CM = 320;

function formatMeters(m: number): string {
  if (!Number.isFinite(m)) return "—";
  const rounded = Math.round(m * 100) / 100;
  return `${rounded} m`;
}

export function GenerateWarehouseLayoutModal({
  onClose,
  onConfirm,
  layout,
  customTemplates,
  rackType,
  initialTemplate = null,
}: GenerateWarehouseLayoutModalProps) {
  const catalogItems: CatalogItem[] = useMemo(
    () =>
      customTemplates
        .filter((t) => (t.rack_type ?? "warehouse") === rackType)
        .map((t) => ({ type: "custom" as const, template: t })),
    [customTemplates, rackType]
  );

  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(() => {
    if (initialTemplate?.type === "custom") return initialTemplate;
    return catalogItems[0] ?? null;
  });
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [rackSpacingCm, setRackSpacingCm] = useState(DEFAULT_RACK_SPACING_CM);
  const [aisleWidthCm, setAisleWidthCm] = useState(DEFAULT_AISLE_WIDTH_CM);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [rackDirection, setRackDirection] = useState<"LTR" | "RTL">("LTR");
  const [firstRowBinDirection, setFirstRowBinDirection] = useState<"LTR" | "RTL">("LTR");
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [startRowPrefix, setStartRowPrefix] = useState("A");
  const [mode, setMode] = useState<GenerateLayoutMode>("append");
  const [overlapWarning, setOverlapWarning] = useState(false);
  const [autoFillWarehouse, setAutoFillWarehouse] = useState(false);

  useEffect(() => {
    if (catalogItems.length === 0) {
      setSelectedItem(null);
      return;
    }
    if (
      selectedItem != null &&
      selectedItem.type === "custom" &&
      catalogItems.some((item) => item.type === "custom" && item.template.id === selectedItem.template.id)
    ) {
      return;
    }
    setSelectedItem(catalogItems[0] ?? null);
  }, [catalogItems, selectedItem]);

  const spec = useMemo(() => (selectedItem ? getCatalogItemSpec(selectedItem) : null), [selectedItem]);

  const templateForGenerator: LayoutGeneratorTemplate | null = useMemo(() => {
    if (!spec || selectedItem?.type !== "custom") return null;
    const base = {
      ...spec,
      rack_type: selectedItem.template.rack_type ?? "warehouse",
      templateId: selectedItem.template.id,
    };
    return base as LayoutGeneratorTemplate;
  }, [spec, selectedItem]);

  const buildingDepthM = layout.building_depth_m ?? layout.building_height_m;
  const warehouseWidthM = layout.building_width_m ?? null;
  const warehouseDepthM = buildingDepthM ?? null;

  const mpc = useMemo(() => getLayoutMetersPerCell(layout), [layout]);

  /** Canvas grid matches building when dimensions are set; always use layout grid size for bounds. */
  const maxCols = layout.grid_cols;
  const maxRows = layout.grid_rows;
  const rackW = spec ? layoutCmToCellsX(layout, spec.width_cm) : 0;
  const rackH = spec ? layoutCmToCellsY(layout, spec.depth_cm) : 0;
  const spacingCells = Math.max(0, layoutCmToCellsX(layout, rackSpacingCm));
  const aisleCells = Math.max(0, layoutCmToCellsY(layout, aisleWidthCm));
  const wallGapCellsX = Math.max(0, layoutCmToCellsX(layout, 30));
  const wallGapCellsY = Math.max(0, layoutCmToCellsY(layout, 30));
  const autoFillComputed = useMemo(() => {
    if (!autoFillWarehouse || !spec || maxCols == null || maxRows == null || maxCols <= 0 || maxRows <= 0)
      return null;
    const rackWidthCells = layoutCmToCellsX(layout, spec.width_cm);
    const rackDepthCells = layoutCmToCellsY(layout, spec.depth_cm);
    const columnStep = rackWidthCells + spacingCells;
    const usableWidth = maxCols - wallGapCellsX * 2;
    const columnsFit = Math.max(0, Math.floor((usableWidth + spacingCells) / columnStep));
    const structure = planRackRowsForBuilding(maxRows, rackDepthCells, aisleCells, wallGapCellsY);
    const rowsFit = plannedStructureToRowCount(structure);
    return { rows: rowsFit, columns: columnsFit };
  }, [
    autoFillWarehouse,
    spec,
    layout,
    maxCols,
    maxRows,
    spacingCells,
    aisleCells,
    wallGapCellsX,
    wallGapCellsY,
  ]);

  const effectiveRows = autoFillWarehouse && autoFillComputed ? autoFillComputed.rows : rows;
  const effectiveColumns = autoFillWarehouse && autoFillComputed ? autoFillComputed.columns : columns;

  const fitCheck = useMemo(() => {
    if (!spec || warehouseWidthM == null || warehouseDepthM == null) {
      return {
        hasBuilding: false,
        ok: true,
        widthOk: true,
        depthOk: true,
        needWidthM: 0,
        needDepthM: 0,
      };
    }
    const rw = spec.width_cm / 100;
    const rd = spec.depth_cm / 100;
    const aisleM = aisleWidthCm / 100;
    const rackSpaceM = rackSpacingCm / 100;
    const r = effectiveRows;
    const c = effectiveColumns;
    const alongColsM = c * rw + Math.max(0, c - 1) * rackSpaceM;
    const alongRowsM = r * rd + Math.max(0, r - 1) * aisleM;
    let needWidthM: number;
    let needDepthM: number;
    if (orientation === "horizontal") {
      needWidthM = alongColsM;
      needDepthM = alongRowsM;
    } else {
      needWidthM = alongRowsM;
      needDepthM = alongColsM;
    }
    const widthOk = needWidthM <= warehouseWidthM + 1e-9;
    const depthOk = needDepthM <= warehouseDepthM + 1e-9;
    return {
      hasBuilding: true,
      ok: widthOk && depthOk,
      widthOk,
      depthOk,
      needWidthM,
      needDepthM,
      warehouseWidthM,
      warehouseDepthM,
    };
  }, [
    spec,
    warehouseWidthM,
    warehouseDepthM,
    effectiveRows,
    effectiveColumns,
    aisleWidthCm,
    rackSpacingCm,
    orientation,
  ]);

  const previewGrid = useMemo(
    () => getPreviewLabels(effectiveRows, effectiveColumns, startRowPrefix),
    [effectiveRows, effectiveColumns, startRowPrefix]
  );

  const totalRacks = Math.max(0, effectiveRows * effectiveColumns);
  const capacityPreview = useMemo(() => {
    if (!spec || totalRacks <= 0) return null;
    const lc = getLevelConfig(spec);
    const binsPerRack = getTotalLocations(lc);
    if (binsPerRack <= 0) return null;
    const volPerBin = volumePerBinFromTotal(spec.width_cm, spec.depth_cm, spec.height_cm, binsPerRack);
    const totalDm3 = totalRacks * binsPerRack * volPerBin;
    return { binsPerRack, totalDm3 };
  }, [spec, totalRacks]);

  const estimatedAisleBetweenRows = Math.max(0, effectiveRows - 1);

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
      ? (autoFillWarehouse ? wallGapCellsX : startX) + (effectiveColumns - 1) * stepW + rackW
      : (autoFillWarehouse ? wallGapCellsX : startX) + (effectiveRows - 1) * stepBetweenRows + rackW;
  const lastRackBottom =
    orientation === "horizontal"
      ? (autoFillWarehouse ? wallGapCellsY : startY) + (effectiveRows - 1) * stepH + rackH
      : (autoFillWarehouse ? wallGapCellsY : startY) + (effectiveColumns - 1) * stepInRow + rackH;
  const wouldTruncate =
    hasBuildingLimits &&
    (lastRackRight > maxCols || lastRackBottom > maxRows);

  const handleGenerate = () => {
    if (!templateForGenerator) return;
    if (!autoFillWarehouse && (rows < 1 || columns < 1)) return;
    if (autoFillWarehouse && (!autoFillComputed || autoFillComputed.rows < 1 || autoFillComputed.columns < 1)) return;
    if (fitCheck.hasBuilding && !fitCheck.ok) return;
    const baseRackIndex = mode === "replace" ? 1 : layout.racks.length + 1;
    let result = generateWarehouseLayout({
      template: templateForGenerator,
      rows: effectiveRows,
      columns: effectiveColumns,
      rackSpacingCm,
      aisleWidthCm,
      orientation,
      startX: autoFillWarehouse ? wallGapCellsX : startX,
      startY: autoFillWarehouse ? wallGapCellsY : startY,
      startRowPrefix,
      baseRackIndex,
      maxCols: layout.building_width_m != null && buildingDepthM != null ? maxCols : undefined,
      maxRows: layout.building_width_m != null && buildingDepthM != null ? maxRows : undefined,
      autoFillWarehouse,
      rackDirection,
      firstRowBinDirection,
      metersPerCellX: mpc?.metersPerCellX,
      metersPerCellY: mpc?.metersPerCellY,
    });
    if (mode === "append") {
      result = {
        ...result,
        racks: assignUniqueRackNamesToNewRacks(result.racks, layout),
      };
    }

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
    (!fitCheck.hasBuilding || fitCheck.ok) &&
    (autoFillWarehouse
      ? hasBuildingLimits && autoFillComputed != null && autoFillComputed.rows >= 1 && autoFillComputed.columns >= 1
      : rows >= 1 && columns >= 1);

  const noTemplates = catalogItems.length === 0;

  const fieldLabel = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";
  const controlInput =
    "w-full rounded-lg border border-slate-200/70 bg-white text-slate-900 text-sm px-3 py-2 shadow-sm shadow-slate-900/[0.02] disabled:opacity-50 disabled:bg-slate-50 disabled:text-slate-500 transition-[box-shadow,border-color] duration-150";

  const previewMaxDim = Math.max(effectiveRows, effectiveColumns, 1);
  const namingCellClass =
    previewMaxDim > 10 ? "text-[8px] px-0.5 py-0.5" : previewMaxDim > 6 ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1 py-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/60 w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-slate-200/50 shrink-0 bg-slate-50/30">
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Generuj układ magazynu</h2>
          <p className="text-xs text-slate-500 mt-0.5">Ustawienia po lewej — podgląd i podsumowanie po prawej.</p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-5 lg:p-6 space-y-5">
            <div>
              <label className={fieldLabel}>Szablon</label>
              {noTemplates ? (
                <p className="text-sm text-amber-900 bg-amber-50/90 border border-amber-100/80 rounded-lg px-3 py-2">Brak szablonów</p>
              ) : (
                <select
                  value={selectedItem?.type === "custom" ? selectedItem.template.id : ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const t = customTemplates.find((x) => x.id === id);
                    if (t) setSelectedItem({ type: "custom", template: t });
                    else setSelectedItem(null);
                  }}
                  className={controlInput}
                >
                  {catalogItems.map((item) => (
                    <option key={item.template.id} value={item.template.id}>
                      {item.template.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
              {/* LEFT: controls */}
              <div className="space-y-4 min-w-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>Kierunek numeracji regałów</label>
                    <select
                      value={rackDirection}
                      onChange={(e) => setRackDirection(e.target.value as "LTR" | "RTL")}
                      disabled={noTemplates}
                      className={controlInput}
                    >
                      <option value="LTR">LTR (lewo → prawo)</option>
                      <option value="RTL">RTL (prawo → lewo)</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">Stosowany do wszystkich generowanych rzędów.</p>
                  </div>
                  <div>
                    <label className={fieldLabel}>Numeracja lokalizacji (pierwszy rząd)</label>
                    <select
                      value={firstRowBinDirection}
                      onChange={(e) => setFirstRowBinDirection(e.target.value as "LTR" | "RTL")}
                      disabled={noTemplates}
                      className={controlInput}
                    >
                      <option value="LTR">LTR</option>
                      <option value="RTL">RTL</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">Przy podwójnym rzędzie drugi rząd ma przeciwny kierunek.</p>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFillWarehouse}
                      onChange={(e) => setAutoFillWarehouse(e.target.checked)}
                      disabled={noTemplates}
                    />
                    <span className="text-sm font-semibold text-slate-700">Auto fill warehouse</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-1 pl-6">
                    {autoFillWarehouse
                      ? "Liczba rzędów i regałów na rząd jest liczona z wymiarów budynku i szablonu."
                      : "Ustaw liczbę rzędów i regałów ręcznie."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>Liczba rzędów</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={autoFillWarehouse && autoFillComputed ? autoFillComputed.rows : rows}
                      onChange={(e) => setRows(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                      disabled={autoFillWarehouse || noTemplates}
                      className={controlInput}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Regały na rząd</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={autoFillWarehouse && autoFillComputed ? autoFillComputed.columns : columns}
                      onChange={(e) => setColumns(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                      disabled={autoFillWarehouse || noTemplates}
                      className={controlInput}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>Odstęp między regałami (cm)</label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={rackSpacingCm}
                      onChange={(e) => setRackSpacingCm(Math.max(0, Number(e.target.value) || 0))}
                      disabled={noTemplates}
                      className={controlInput}
                    />
                    <p className="text-[11px] text-slate-500 mt-0.5">{rackSpacingCm / 100} m</p>
                  </div>
                  <div>
                    <label className={fieldLabel}>Szerokość przejścia (cm)</label>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={aisleWidthCm}
                      onChange={(e) => setAisleWidthCm(Math.max(0, Number(e.target.value) || 0))}
                      disabled={noTemplates}
                      className={controlInput}
                    />
                    <p className="text-[11px] text-slate-500 mt-0.5">{aisleWidthCm / 100} m</p>
                  </div>
                </div>

                <div>
                  <label className={fieldLabel}>Orientacja</label>
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value as "horizontal" | "vertical")}
                    disabled={noTemplates}
                    className={controlInput}
                  >
                    <option value="horizontal">Pozioma (rzędy wzdłuż Y)</option>
                    <option value="vertical">Pionowa (rzędy wzdłuż X)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>Początek X (komórki)</label>
                    <input
                      type="number"
                      min={0}
                      value={startX}
                      onChange={(e) => setStartX(Math.max(0, Number(e.target.value) || 0))}
                      disabled={autoFillWarehouse || noTemplates}
                      className={controlInput}
                    />
                  </div>
                  <div>
                    <label className={fieldLabel}>Początek Y (komórki)</label>
                    <input
                      type="number"
                      min={0}
                      value={startY}
                      onChange={(e) => setStartY(Math.max(0, Number(e.target.value) || 0))}
                      disabled={autoFillWarehouse || noTemplates}
                      className={controlInput}
                    />
                  </div>
                </div>

                <div>
                  <label className={fieldLabel}>Prefiks pierwszego rzędu</label>
                  <input
                    type="text"
                    value={startRowPrefix}
                    onChange={(e) => setStartRowPrefix(e.target.value.trim() || "A")}
                    placeholder="A"
                    disabled={noTemplates}
                    className={controlInput}
                  />
                </div>

                <div>
                  <span className={fieldLabel}>Tryb</span>
                  <div className="flex flex-wrap gap-4 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                      <input type="radio" name="mode" checked={mode === "append"} onChange={() => setMode("append")} />
                      Dołącz do układu
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                      <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                      Zastąp układ
                    </label>
                  </div>
                </div>

                {overlapWarning && (
                  <div className="rounded-lg bg-amber-50/90 border border-amber-200/70 text-amber-900 px-3 py-2.5 text-sm">
                    Wygenerowane regały nachodzą na istniejący układ. Zmień pozycję startową lub użyj trybu zastąpienia.
                  </div>
                )}
                {wouldTruncate && !overlapWarning && (
                  <div className="rounded-lg bg-amber-50/90 border border-amber-200/70 text-amber-900 px-3 py-2.5 text-sm">
                    Wygenerowany układ przekracza rozmiar budynku (zostanie obcięty).
                  </div>
                )}
              </div>

              {/* RIGHT: preview & summary */}
              <div className="space-y-4 lg:sticky lg:top-0 lg:self-start min-w-0">
                {fitCheck.hasBuilding && spec && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      fitCheck.ok
                        ? "bg-emerald-50/80 border-emerald-200/60 text-emerald-900"
                        : "bg-red-50/80 border-red-200/60 text-red-900"
                    }`}
                  >
                    {fitCheck.ok ? (
                      <>
                        <p className="font-semibold mb-2">Podsumowanie dopasowania</p>
                        <ul className="list-disc list-inside space-y-1 text-[13px]">
                          <li>
                            {effectiveRows} {effectiveRows === 1 ? "rząd" : "rzędów"}
                          </li>
                          <li>{totalRacks} regałów (łącznie)</li>
                          {spec && (
                            <li>
                              Szablon: {spec.width_cm}×{spec.depth_cm}×{spec.height_cm} cm
                            </li>
                          )}
                        </ul>
                        {capacityPreview != null && (
                          <p className="mt-2 text-xs opacity-90 leading-relaxed">
                            Szac. pojemność: ~{Math.round(capacityPreview.totalDm3).toLocaleString()} dm³ · Przejścia między rzędami (szac.):{" "}
                            {estimatedAisleBetweenRows}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-semibold mb-2">Nie zmieści się</p>
                        <ul className="list-disc list-inside space-y-1 text-[13px]">
                          {!fitCheck.widthOk && (
                            <li>
                              szerokość: potrzebne {formatMeters(fitCheck.needWidthM)}, dostępne {formatMeters(fitCheck.warehouseWidthM)}
                            </li>
                          )}
                          {!fitCheck.depthOk && (
                            <li>
                              głębokość: potrzebne {formatMeters(fitCheck.needDepthM)}, dostępne {formatMeters(fitCheck.warehouseDepthM)}
                            </li>
                          )}
                        </ul>
                      </>
                    )}
                  </div>
                )}

                {!fitCheck.hasBuilding && spec && (
                  <p className="text-xs text-slate-600 rounded-xl border border-slate-200/50 bg-slate-50/50 px-3 py-2.5 leading-relaxed">
                    Ustaw szerokość i głębokość budynku w układzie, aby włączyć sprawdzanie dopasowania w czasie rzeczywistym.
                  </p>
                )}

                <div>
                  <span className={fieldLabel}>Podgląd nazw — siatka regałów</span>
                  <div className="mt-2 rounded-xl border border-slate-200/55 bg-slate-50/60 p-3 shadow-inner">
                    <div
                      className="grid gap-1 w-full max-h-[220px] overflow-auto"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(1, effectiveColumns)}, minmax(0, 1fr))`,
                      }}
                    >
                      {previewGrid.flatMap((row, ri) =>
                        row.map((label, ci) => (
                          <div
                            key={`rack-preview-${ri}-${ci}`}
                            className={`flex min-h-[2rem] items-center justify-center rounded-md border border-slate-200/60 bg-white/90 text-center font-mono font-semibold leading-tight text-slate-800 shadow-sm ${namingCellClass}`}
                          >
                            {label}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 border border-slate-200/50">
                        Regały: {rackDirection === "LTR" ? "LTR →" : "← RTL"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 border border-slate-200/50">
                        Lok. rząd 1: {firstRowBinDirection === "LTR" ? "LTR →" : "← RTL"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 border border-slate-200/50">
                        {orientation === "horizontal" ? "Orientacja: pozioma" : "Orientacja: pionowa"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200/50 shrink-0 bg-slate-50/40 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200/80 text-slate-700 hover:bg-white text-sm font-medium transition-colors duration-150"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || noTemplates}
            className="px-7 py-2.5 rounded-xl bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-500 shadow-md shadow-cyan-900/15 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-150 min-w-[140px]"
          >
            Generuj
          </button>
        </div>
      </div>
    </div>
  );
}
