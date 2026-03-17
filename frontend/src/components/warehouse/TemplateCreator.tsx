import { useState, useEffect, useMemo, useRef } from "react";
import type { CustomRackTemplate, LevelConfigItem, LayoutState } from "../../types/warehouse";
import { RESERVE_BG, RESERVE_BORDER } from "./reserveLocationStyle";
import { snapCm, expandAddressPattern, getRackTemplateLabel, levelHeightsForRack, type RackTemplateLabelOptions } from "./warehouseUtils";

const DEFAULT_ADDRESS_PATTERN = "{Row}{Section}-{Bin}-{Level}";

const DEFAULT_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const UPRIGHT_BLUE = "#2563eb";
const SHELF_ORANGE = "#ea580c";
const SHELF_GREY = "#64748b";
const RESERVE_FILL = RESERVE_BG;
const RESERVE_STROKE = RESERVE_BORDER;
const CELL_STROKE = "#cbd5e1";

function cellKey(levelIndex: number, binIndex: number): string {
  return `${levelIndex}-${binIndex}`;
}

/** Volume per bin dm³: (RackWidth/LocationsPerLevel) × RackDepth × (RackHeight/TotalLevels) / 1000, 2 decimals. */
function volumePerBinForLevelDm3(
  width_cm: number,
  depth_cm: number,
  height_cm: number,
  totalLevels: number,
  locationsOnLevel: number
): number {
  if (totalLevels <= 0 || locationsOnLevel <= 0) return 0;
  const binWidthCm = width_cm / locationsOnLevel;
  const heightPerLevelCm = height_cm / totalLevels;
  const volCm3 = binWidthCm * depth_cm * heightPerLevelCm;
  return Number((volCm3 / 1000).toFixed(2));
}

/** Volume per bin for one level when level heights sum exactly to rack height (from levelHeightsForRack). */
function volumePerBinForLevelHeightDm3(
  width_cm: number,
  depth_cm: number,
  levelHeightCm: number,
  locationsOnLevel: number
): number {
  if (locationsOnLevel <= 0) return 0;
  const binWidthCm = width_cm / locationsOnLevel;
  const volCm3 = binWidthCm * depth_cm * levelHeightCm;
  return Number((volCm3 / 1000).toFixed(2));
}

export type RackPreviewMode = "structure" | "names";

/**
 * Industrial rack preview: blue vertical uprights (no top cap), orange/grey shelf beams
 * between levels only (no floor beam, no top beam). Last level open at top.
 * Per-bin: dynamic address (large bold), then W/H dimensions and Volume in smaller font; all centered.
 * When onBinClick is omitted, the preview is read-only (no pointer cursor, no click).
 * previewMode "structure" shows coordinates only (L1-C1); "names" shows generated or manual labels.
 */
export function RackPreview({
  width_cm,
  depth_cm,
  height_cm,
  levels,
  bins_per_level,
  levelConfig,
  addressPattern,
  rowId,
  sectionStartIndex,
  binNamingType,
  reserveBinKeys,
  color: _color,
  className = "",
  onBinClick,
  title: titleProp,
  previewMode = "names",
  labelOptions,
  onLabelEdit,
}: {
  width_cm: number;
  depth_cm: number;
  height_cm: number;
  levels: number;
  bins_per_level: number;
  /** When set, per-level locations (overrides uniform bins_per_level). */
  levelConfig?: LevelConfigItem[];
  addressPattern: string;
  rowId: string;
  sectionStartIndex: number;
  binNamingType: "numeric" | "alpha";
  reserveBinKeys: Set<string>;
  color: string;
  className?: string;
  onBinClick?: (levelIndex: number, binIndex: number) => void;
  /** Optional title above the preview (default: "Podgląd regału — na żywo"). */
  title?: string;
  /** "structure" = coordinates only (L1-C1); "names" = generated/manual labels. */
  previewMode?: RackPreviewMode;
  /** When set, labels come from getRackTemplateLabel (same as createBinsForRack). */
  labelOptions?: RackTemplateLabelOptions | null;
  /** When set, cells in names view are clickable to edit label (manual or override). */
  onLabelEdit?: (levelIndex: number, binIndex: number, currentValue: string) => void;
}) {
  const levelRows = (Array.isArray(levelConfig) && levelConfig.length > 0)
    ? levelConfig
    : Array.from({ length: Math.max(1, levels) }, (_, i) => ({ level: i + 1, locations: Math.max(1, bins_per_level) }));
  const L = levelRows.length;
  const pattern = (addressPattern || DEFAULT_ADDRESS_PATTERN).trim() || DEFAULT_ADDRESS_PATTERN;
  const rackIdForPreview = (rowId || "A").replace(/\./g, "") + "1";
  const levelHeights = levelHeightsForRack(height_cm, L);
  const cells: { level: number; bin: number; label: string; isReserve: boolean; locationsOnLevel: number; volPerBin: number; levelHeightCm: number }[] = [];
  for (let lev = 0; lev < L; lev++) {
    const locs = Math.max(1, levelRows[lev].locations);
    const levelHeightCm = levelHeights[lev] ?? height_cm / L;
    const volPerBinLev = volumePerBinForLevelHeightDm3(width_cm, depth_cm, levelHeightCm, locs);
    for (let bin = 0; bin < locs; bin++) {
      const structuralLabel = `L${lev + 1}-C${bin + 1}`;
      const nameLabel = labelOptions
        ? getRackTemplateLabel(lev, bin, levelRows, { ...labelOptions, rackId: rackIdForPreview })
        : expandAddressPattern(pattern, rowId, sectionStartIndex, binNamingType, lev + 1, bin + 1);
      const displayLabel = previewMode === "structure" ? structuralLabel : nameLabel;
      cells.push({ level: lev, bin, label: displayLabel, isReserve: reserveBinKeys.has(cellKey(lev, bin)), locationsOnLevel: locs, volPerBin: volPerBinLev, levelHeightCm });
    }
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(500);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 500;
      setContainerHeight(Math.max(200, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const margin = 8;
  const beamW = 8;
  const viewBoxW = 1000;
  const viewBoxH = containerHeight;
  const contentW = viewBoxW - 2 * margin - 2 * beamW;
  const contentAreaH = viewBoxH - 2 * margin;
  const levelHeight = contentAreaH / Math.max(1, L);
  const cellH = levelHeight;
  const ox = margin + beamW;
  const contentAreaY = margin;
  const pad = 2;
  const textPadding = 5;
  const levelToY = (level: number) => contentAreaY + (L - 1 - level) * cellH + pad;
  const cellInsetH = Math.max(0, cellH - pad * 2);

  const floorY = levelToY(0) + cellInsetH;
  const topLevelRowBottomY = levelToY(L - 1) + cellInsetH;
  const uprightTopY = topLevelRowBottomY;
  const uprightHeight = floorY - topLevelRowBottomY;
  const internalShelfYs = Array.from({ length: L - 1 }, (_, i) => levelToY(L - 2 - i));

  return (
    <div className={`flex flex-col flex-1 min-h-0 rounded-2xl border border-slate-100 bg-white overflow-hidden ${className}`}>
      <h4 className="text-sm font-bold text-slate-600 px-2 pb-2 shrink-0">{titleProp ?? "Podgląd regału — na żywo"}</h4>
      <div ref={containerRef} className="flex-1 min-h-0 min-h-[200px] rounded-xl border border-slate-100 overflow-hidden flex items-stretch">
        <svg
            viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full rounded-xl"
            style={{ display: "block" }}
          >
            <defs>
              <filter id="rack-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
              </filter>
              <clipPath id="rack-content-clip">
                <rect x={ox} y={contentAreaY} width={contentW} height={contentAreaH} />
              </clipPath>
            </defs>
            <g filter="url(#rack-shadow)">
              {/* Uprights: from floor up to bottom of top-level row only; top level stays open on the sides */}
              <rect x={margin} y={uprightTopY} width={beamW} height={uprightHeight} fill={UPRIGHT_BLUE} rx={2} />
              <rect x={margin + beamW + contentW} y={uprightTopY} width={beamW} height={uprightHeight} fill={UPRIGHT_BLUE} rx={2} />
              {/* Horizontal shelves between levels only (no top beam, no bottom beam; rack stands on floor) */}
              {internalShelfYs.map((y, i) => (
                <line
                  key={`shelf-${i}`}
                  x1={ox}
                  y1={y}
                  x2={ox + contentW}
                  y2={y}
                  stroke={SHELF_ORANGE}
                  strokeWidth={1}
                  strokeLinecap="butt"
                />
              ))}
              <g clipPath="url(#rack-content-clip)">
                {/* Vertical dividers: per level, within level band only */}
                {levelRows.map((row, lev) => {
                  const locs = Math.max(1, row.locations);
                  if (locs <= 1) return null;
                  const cellWLev = contentW / locs;
                  const yStart = levelToY(lev);
                  const yEnd = yStart + cellInsetH;
                  return Array.from({ length: locs - 1 }, (_, i) => (
                    <line
                      key={`div-${lev}-${i}`}
                      x1={ox + (i + 1) * cellWLev}
                      y1={yStart}
                      x2={ox + (i + 1) * cellWLev}
                      y2={yEnd}
                      stroke={SHELF_GREY}
                      strokeWidth={1}
                      opacity={0.9}
                    />
                  ));
                })}
                {/* Bins: Line1 ID 16px bold, Line2/3 12px; 5px padding; flex-like vertical center; scale down to min 10px when narrow. */}
                {cells.map(({ level, bin, label, isReserve, locationsOnLevel, volPerBin: cellVol, levelHeightCm }) => {
                  const cellWLev = contentW / Math.max(1, locationsOnLevel);
                  const x = ox + bin * cellWLev + pad;
                  const y = levelToY(level);
                  const w = cellWLev - pad * 2;
                  const h = cellInsetH;
                  const fill = isReserve ? RESERVE_FILL : "white";
                  const stroke = isReserve ? RESERVE_STROKE : CELL_STROKE;
                  const cx = x + w / 2;
                  const volStr = `${Number(cellVol).toFixed(2)} dm³`;
                  const title = `${label}\nW:${width_cm} × H:${Math.round(levelHeightCm)}\n${volStr}`;
                  const textColor = "#0f172a";
                  const subColor = "#334155";
                  const line1H = 16;
                  const line2H = 12;
                  const line3H = 12;
                  const gap = 4;
                  const blockH = line1H + gap + line2H + gap + line3H;
                  const contentH = Math.max(0, h - 2 * textPadding);
                  const scaleByHeight = contentH >= blockH ? 1 : Math.max(0, contentH / blockH);
                  const minWidthForFullFont = 56;
                  const scaleByWidth = w >= minWidthForFullFont ? 1 : Math.max(0, w / minWidthForFullFont);
                  const scale = Math.min(scaleByHeight, scaleByWidth);
                  const line1Px = line1H * scale;
                  const line2Px = line2H * scale;
                  const line3Px = line3H * scale;
                  const gapPx = gap * scale;
                  const totalBlock = line1Px + gapPx + line2Px + gapPx + line3Px;
                  const startOff = (contentH - totalBlock) / 2;
                  const line1Y = y + textPadding + startOff + line1Px;
                  const line2Y = line1Y + gapPx + line2Px;
                  const line3Y = line2Y + gapPx + line3Px;
                  const minFontPx = 10;
                  const fontSize1 = Math.max(minFontPx, 16 * scale);
                  const fontSize2 = Math.max(minFontPx, 12 * scale);
                  return (
                    <g
                      key={`${level}-${bin}`}
                      onClick={() => {
                        if (previewMode === "names" && onLabelEdit) onLabelEdit(level, bin, label);
                        else onBinClick?.(level, bin);
                      }}
                      style={{ cursor: (onLabelEdit && previewMode === "names") || onBinClick ? "pointer" : undefined }}
                    >
                      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1} rx={2} />
                      <title>{title}</title>
                      <text x={cx} y={line1Y} textAnchor="middle" fontSize={fontSize1} fill={textColor} fontFamily="system-ui, sans-serif" fontWeight="700">
                        {label.length > 14 ? label.slice(0, 12) + "…" : label}
                      </text>
                      <text x={cx} y={line2Y} textAnchor="middle" fontSize={fontSize2} fill={subColor} fontFamily="system-ui, sans-serif">
                        W×H: {width_cm}×{Math.round(levelHeightCm)}
                      </text>
                      <text x={cx} y={line3Y} textAnchor="middle" fontSize={fontSize2} fill={subColor} fontFamily="system-ui, sans-serif">
                        {volStr}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
        </svg>
      </div>
    </div>
  );
}

export type TemplateCreatorProps = {
  /** Return false (or reject) to signal save failed and keep form state. */
  onSave: (template: CustomRackTemplate) => void | Promise<void | boolean>;
  initialTemplate?: CustomRackTemplate | null;
  onCancelEdit?: () => void;
  /** When editing: persist template and update layout. Return Promise to support loading state. */
  onSaveEdit?: (templateId: string, template: CustomRackTemplate, updateExistingRacks: boolean) => void | Promise<void>;
  /** Optional layout (e.g. from RackSidebar). Not used for validation; only for temporary debug logs to confirm rack height is independent from warehouse height. */
  layout?: LayoutState | null;
};

export type NamingStrategyId = "pattern" | "rack-index" | "custom" | "manual";

export function TemplateCreator({ onSave, initialTemplate, onCancelEdit, onSaveEdit, layout }: TemplateCreatorProps) {
  const [name, setName] = useState("");
  const [width_cm, setWidthCm] = useState(120);
  const [depth_cm, setDepthCm] = useState(80);
  const [height_cm, setHeightCm] = useState(200);
  const [levels, setLevels] = useState(4);
  const [locationsPerLevel, setLocationsPerLevel] = useState<number[]>([4]);
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [reserveBinKeys, setReserveBinKeys] = useState<Set<string>>(new Set());
  const [updateExistingRacks, setUpdateExistingRacks] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const isEdit = Boolean(initialTemplate?.id);

  const [namingStrategy, setNamingStrategy] = useState<NamingStrategyId>("pattern");
  const [namingOrientation, setNamingOrientation] = useState<"column-first" | "row-first">("column-first");
  const [namingPattern, setNamingPattern] = useState(DEFAULT_ADDRESS_PATTERN);
  const [rowId, setRowId] = useState("A");
  const [sectionStartIndex, setSectionStartIndex] = useState(1);
  const [autoSectionNumbering, setAutoSectionNumbering] = useState(false);
  const [binNamingType, setBinNamingType] = useState<"numeric" | "alpha">("numeric");
  const [indexPadding, setIndexPadding] = useState(2);
  const [startIndex, setStartIndex] = useState(1);
  const [manualLabels, setManualLabels] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [allowOverrides, setAllowOverrides] = useState(false);
  const [previewMode, setPreviewMode] = useState<RackPreviewMode>("names");
  const [levelMaxLoadKg, setLevelMaxLoadKg] = useState(500);

  useEffect(() => {
    if (initialTemplate) {
      setName(initialTemplate.name);
      setWidthCm(initialTemplate.width_cm);
      setDepthCm(initialTemplate.depth_cm);
      setHeightCm(initialTemplate.height_cm);
      setLevels(initialTemplate.levels);
      if (Array.isArray(initialTemplate.levelConfig) && initialTemplate.levelConfig.length > 0) {
        setLocationsPerLevel(initialTemplate.levelConfig.map((row) => Math.max(1, row.locations)));
      } else {
        const B = Math.max(1, initialTemplate.bins_per_level ?? 4);
        setLocationsPerLevel(Array.from({ length: Math.max(1, initialTemplate.levels) }, () => B));
      }
      setColor(initialTemplate.color);
      setLevelMaxLoadKg(initialTemplate.level_max_load_kg ?? 500);
      setReserveBinKeys(new Set(initialTemplate.reserve_bin_keys ?? []));
      const strat = initialTemplate.namingStrategy ?? "pattern";
      setNamingStrategy(strat as NamingStrategyId);
      setNamingOrientation(initialTemplate.namingOrientation ?? "column-first");
      setNamingPattern((initialTemplate.namingPattern ?? initialTemplate.addressPattern ?? DEFAULT_ADDRESS_PATTERN).trim() || DEFAULT_ADDRESS_PATTERN);
      setRowId(initialTemplate.rowId ?? "A");
      setSectionStartIndex(initialTemplate.sectionStartIndex ?? 1);
      setAutoSectionNumbering(initialTemplate.autoSectionNumbering ?? false);
      setBinNamingType(initialTemplate.binNamingType ?? "numeric");
      setIndexPadding(initialTemplate.indexPadding ?? 2);
      setStartIndex(initialTemplate.startIndex ?? 1);
      setManualLabels(initialTemplate.manualLabels ?? {});
      setOverrides(initialTemplate.overrides ?? {});
      setAllowOverrides(Object.keys(initialTemplate.overrides ?? {}).length > 0);
    } else {
      setName("");
      setWidthCm(120);
      setDepthCm(80);
      setHeightCm(200);
      setLevels(4);
      setLocationsPerLevel([4]);
      setColor(DEFAULT_COLORS[0]);
      setReserveBinKeys(new Set());
      setNamingStrategy("pattern");
      setNamingOrientation("column-first");
      setNamingPattern(DEFAULT_ADDRESS_PATTERN);
      setRowId("A");
      setSectionStartIndex(1);
      setAutoSectionNumbering(false);
      setBinNamingType("numeric");
      setIndexPadding(2);
      setStartIndex(1);
      setManualLabels({});
      setOverrides({});
      setAllowOverrides(false);
    }
  }, [initialTemplate]);

  const levelConfigForSave = useMemo((): LevelConfigItem[] => {
    const L = Math.max(1, Math.min(20, levels));
    const arr = locationsPerLevel.length >= L ? locationsPerLevel.slice(0, L) : [...locationsPerLevel, ...Array.from({ length: L - locationsPerLevel.length }, () => 1)];
    return arr.map((loc, i) => ({ level: i + 1, locations: Math.max(1, Math.min(50, loc)) }));
  }, [levels, locationsPerLevel]);

  const isDirty = useMemo(() => {
    if (!initialTemplate) return name.trim() !== "" || reserveBinKeys.size > 0;
    const t = initialTemplate;
    const same = t.name === name.trim()
      && t.width_cm === width_cm && t.depth_cm === depth_cm && t.height_cm === height_cm
      && t.levels === levels && t.color === color
      && (t.reserve_bin_keys?.length ?? 0) === reserveBinKeys.size
      && (t.reserve_bin_keys ?? []).every((k) => reserveBinKeys.has(k))
      && (t.namingStrategy ?? "pattern") === namingStrategy
      && (t.namingOrientation ?? "column-first") === namingOrientation
      && (t.namingPattern ?? t.addressPattern ?? DEFAULT_ADDRESS_PATTERN) === namingPattern
      && (t.rowId ?? "A") === rowId
      && (t.sectionStartIndex ?? 1) === sectionStartIndex
      && (t.binNamingType ?? "numeric") === binNamingType
      && (t.indexPadding ?? 2) === indexPadding
      && (t.startIndex ?? 1) === startIndex;
    if (!same) return true;
    if (locationsPerLevel.length !== (t.levelConfig?.length ?? 0)) return true;
    if (t.levelConfig) {
      for (let i = 0; i < t.levelConfig.length; i++) {
        if ((locationsPerLevel[i] ?? 0) !== (t.levelConfig[i]?.locations ?? 0)) return true;
      }
    }
    const ovKeys = Object.keys(t.overrides ?? {});
    const manualKeys = Object.keys(t.manualLabels ?? {});
    if (Object.keys(overrides).length !== ovKeys.length || ovKeys.some((k) => (t.overrides ?? {})[k] !== overrides[k])) return true;
    if (Object.keys(manualLabels).length !== manualKeys.length || manualKeys.some((k) => (t.manualLabels ?? {})[k] !== manualLabels[k])) return true;
    return false;
  }, [initialTemplate, name, width_cm, depth_cm, height_cm, levels, color, reserveBinKeys, locationsPerLevel, namingStrategy, namingOrientation, namingPattern, rowId, sectionStartIndex, binNamingType, indexPadding, startIndex, overrides, manualLabels]);

  useEffect(() => {
    if (!isDirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, saving]);

  const summaryStats = useMemo(() => {
    const totalBins = levelConfigForSave.reduce((s, r) => s + r.locations, 0);
    const totalVolumeDm3 = (width_cm * depth_cm * height_cm) / 1000;
    return { totalBins, totalVolumeDm3: Number(totalVolumeDm3.toFixed(2)) };
  }, [levels, levelConfigForSave, width_cm, depth_cm, height_cm]);

  const handleSave = async () => {
    const trimmed = name.trim() || "Własny regał";
    const rowIdVal = rowId.trim() || "A";
    const L = Math.max(1, Math.min(20, levels));
    const cfg = levelConfigForSave;
    const bins_per_level_legacy = cfg.length > 0 ? cfg[0].locations : 4;
    const patternVal = namingPattern.trim() || DEFAULT_ADDRESS_PATTERN;
    const rackHeightCm = snapCm(height_cm);
    // Temporary: confirm rack template height is independent from warehouse building height (do not use building_height_m for template validation).
    console.log("warehouseHeight", layout?.building_height_m);
    console.log("rackHeight", rackHeightCm);
    const payload: CustomRackTemplate = {
      id: initialTemplate?.id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      name: trimmed,
      width_cm: snapCm(width_cm),
      depth_cm: snapCm(depth_cm),
      height_cm: rackHeightCm,
      levels: L,
      bins_per_level: bins_per_level_legacy,
      levelConfig: cfg,
      aisle_letter: rowIdVal,
      color,
      naming_pattern: `${rowIdVal}-{R}-{L}-{B}`,
      addressPattern: patternVal,
      rowId: rowIdVal,
      sectionStartIndex: Math.max(0, sectionStartIndex),
      autoSectionNumbering: autoSectionNumbering,
      binNamingType,
      reserve_bin_keys: Array.from(reserveBinKeys),
      namingStrategy,
      namingOrientation,
      namingPattern: patternVal,
      manualLabels: namingStrategy === "manual" ? manualLabels : undefined,
      overrides: allowOverrides && Object.keys(overrides).length > 0 ? overrides : undefined,
      indexPadding,
      startIndex,
      level_max_load_kg: Math.max(1, levelMaxLoadKg),
    };
    setSaving(true);
    setSaveSuccess(false);
    try {
      if (isEdit && initialTemplate && onSaveEdit) {
        await Promise.resolve(onSaveEdit(initialTemplate.id, payload, updateExistingRacks));
        setSaveSuccess(true);
        setTimeout(() => {
          onCancelEdit?.();
        }, 600);
        return;
      }
      const result = await Promise.resolve(onSave(payload));
      if (result === false) return;
      setSaveSuccess(true);
      // Parent closes modal on success; no need to reset or call onCancelEdit
    } catch (e) {
      console.error("Save template failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const labelOptionsForPreview: RackTemplateLabelOptions = useMemo(() => ({
    namingStrategy: namingStrategy === "manual" ? "manual" : namingStrategy === "rack-index" ? "rack-index" : namingStrategy === "custom" ? "custom" : "pattern",
    namingOrientation: namingOrientation,
    namingPattern: namingPattern.trim() || DEFAULT_ADDRESS_PATTERN,
    rowId: rowId.trim() || "A",
    sectionStartIndex: sectionStartIndex,
    binNamingType,
    manualLabels: namingStrategy === "manual" ? manualLabels : undefined,
    overrides: allowOverrides ? overrides : undefined,
    rackId: (rowId.trim() || "A") + "1",
    indexPadding: indexPadding,
    startIndex: startIndex,
  }), [namingStrategy, namingOrientation, namingPattern, rowId, sectionStartIndex, binNamingType, manualLabels, overrides, allowOverrides, indexPadding, startIndex]);

  const handleLabelEdit = (levelIndex: number, binIndex: number, currentValue: string) => {
    const key = cellKey(levelIndex, binIndex);
    const newVal = window.prompt("Etykieta lokalizacji", currentValue || "");
    if (newVal === null) return;
    if (namingStrategy === "manual") {
      setManualLabels((prev) => ({ ...prev, [key]: newVal }));
    } else if (allowOverrides) {
      setOverrides((prev) => (newVal === "" ? (() => { const n = { ...prev }; delete n[key]; return n; })() : { ...prev, [key]: newVal }));
    }
  };

  const handlePasteList = () => {
    const raw = window.prompt("Wklej listę etykiet (jedna na linię). Kolejność: poziom po poziomie, od lewej.", "");
    if (raw == null || raw.trim() === "") return;
    const labels = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const next: Record<string, string> = { ...manualLabels };
    let idx = 0;
    for (let lev = 0; lev < Math.max(1, levels); lev++) {
      const locs = locationsPerLevel[lev] ?? 1;
      for (let seg = 0; seg < locs && idx < labels.length; seg++) {
        next[cellKey(lev, seg)] = labels[idx++];
      }
    }
    setManualLabels(next);
  };

  const formSection = (
    <div className="space-y-6 text-[16px]">
      {/* ——— SECTION 1: STRUCTURE ——— */}
      <section>
        <h4 className="text-slate-700 font-bold uppercase mb-3 text-[14px] border-b border-slate-200 pb-1">Struktura</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-slate-500 uppercase mb-1.5 font-semibold text-[16px]">Nazwa</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Regał wysokie palety"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] text-[16px] px-3 py-2.5 input-focus transition-shadow"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 uppercase mb-1.5 font-semibold text-[16px]">Szer. (cm)</label>
              <input type="number" min={10} step={10} value={width_cm} onChange={(e) => setWidthCm(Number(e.target.value) || 10)} className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] text-[16px] px-3 py-2.5 input-focus" />
            </div>
            <div>
              <label className="block text-slate-500 uppercase mb-1.5 font-semibold text-[16px]">Gł. (cm)</label>
              <input type="number" min={10} step={10} value={depth_cm} onChange={(e) => setDepthCm(Number(e.target.value) || 10)} className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] text-[16px] px-3 py-2.5 input-focus" />
            </div>
          </div>
          <div>
            <label className="block text-slate-500 uppercase mb-1.5 font-semibold text-[16px]">Wys. (cm)</label>
            <input type="number" min={10} step={10} value={height_cm} onChange={(e) => setHeightCm(Number(e.target.value) || 10)} className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] text-[16px] px-3 py-2.5 input-focus" />
          </div>
          <div>
            <label className="block text-slate-500 uppercase mb-1.5 font-semibold text-[16px]">Liczba poziomów</label>
            <input
              type="number"
              min={1}
              max={20}
              value={levels}
              onChange={(e) => {
                const next = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                setLevels(next);
                setLocationsPerLevel((prev) => {
                  if (next > prev.length) return [...prev, ...Array.from({ length: next - prev.length }, () => prev[prev.length - 1] ?? 1)];
                  return prev.slice(0, next);
                });
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] text-[16px] px-3 py-2.5 input-focus"
            />
          </div>
          <div>
            <label className="block text-slate-600 uppercase mb-1.5 font-bold text-[16px]">Lokalizacje na poziom</label>
            <div className="space-y-2">
              {Array.from({ length: Math.max(1, levels) }, (_, i) => {
                const val = locationsPerLevel[i] ?? 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-slate-600 font-semibold w-20 shrink-0 text-[16px]">Poziom {i + 1}:</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={val}
                      onChange={(e) => setLocationsPerLevel((prev) => {
                        const next = [...prev];
                        while (next.length <= i) next.push(1);
                        next[i] = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                        return next;
                      })}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 text-[#1E293B] px-2.5 py-1.5 text-[16px] input-focus"
                    />
                    <span className="text-slate-400 text-[16px]">lok.</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-slate-600 uppercase mb-1.5 font-bold text-[16px]">Obciążenie na poziom (kg)</label>
            <input
              type="number"
              min={1}
              step={10}
              value={levelMaxLoadKg}
              onChange={(e) => setLevelMaxLoadKg(Math.max(1, Number(e.target.value) || 500))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] text-[16px] px-3 py-2.5 input-focus"
              placeholder="500"
            />
            <p className="text-slate-500 text-[12px] mt-0.5">Maksymalna dopuszczalna waga dla jednego poziomu regału.</p>
          </div>
          <div>
            <label className="block text-slate-500 uppercase mb-1.5 font-semibold text-[16px]">Kolor</label>
            <div className="flex flex-wrap gap-2 items-center">
              {DEFAULT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-8 h-8 rounded-xl border-2 transition-colors ${color === c ? "border-cyan-500 ring-2 ring-cyan-500/30" : "border-slate-200"}`} style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 cursor-pointer rounded-xl border border-slate-200 bg-transparent" />
            </div>
          </div>
          <p className="text-slate-500 text-[14px]">Kliknij komórki w podglądzie, aby oznaczyć lokalizacje rezerwowe.</p>
        </div>
      </section>

      {/* ——— SECTION 2: NAMING STRATEGY ——— */}
      <section>
        <h4 className="text-slate-700 font-bold uppercase mb-3 text-[14px] border-b border-slate-200 pb-1">Strategia nazewnictwa</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-slate-600 font-semibold text-[16px] mb-1.5">Sposób nazewnictwa</label>
            <select
              value={namingStrategy}
              onChange={(e) => setNamingStrategy(e.target.value as NamingStrategyId)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 text-[#1E293B] px-3 py-2.5 text-[16px] input-focus"
            >
              <option value="pattern">Z wzorca (Rząd/Sekcja/Pozycja/Poziom)</option>
              <option value="rack-index">Rack + indeks</option>
              <option value="custom">Własny wzorzec</option>
              <option value="manual">Ręczne etykiety</option>
            </select>
          </div>

          {namingStrategy === "pattern" && (
            <>
              <div>
                <label className="block text-slate-600 font-semibold text-[14px] mb-1">Orientacja</label>
                <select
                  value={namingOrientation}
                  onChange={(e) => setNamingOrientation(e.target.value as "column-first" | "row-first")}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus"
                >
                  <option value="column-first">Pierwsza kolumna (A-1 B-1 C-1)</option>
                  <option value="row-first">Pierwszy rząd (A-1 A-2 A-3)</option>
                </select>
              </div>
              <div>
                <label className="text-[14px] text-slate-600">Rząd ({'{Row}'})</label>
                <input type="text" value={rowId} onChange={(e) => setRowId(e.target.value)} placeholder="np. A" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus mt-0.5" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer text-[14px]">
                  <input type="checkbox" checked={autoSectionNumbering} onChange={(e) => setAutoSectionNumbering(e.target.checked)} className="rounded" />
                  Automatyczna numeracja sekcji
                </label>
              </div>
              <div>
                <label className="text-[14px] text-slate-600">Startowa sekcja ({'{Section}'})</label>
                <input type="number" min={0} value={sectionStartIndex} onChange={(e) => setSectionStartIndex(Number(e.target.value) || 0)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus mt-0.5" />
              </div>
              <div>
                <label className="text-[14px] text-slate-600">Pozycja ({'{Bin}'})</label>
                <select value={binNamingType} onChange={(e) => setBinNamingType(e.target.value as "numeric" | "alpha")} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus mt-0.5">
                  <option value="numeric">Liczbowe (1, 2, 3…)</option>
                  <option value="alpha">Alfabetyczne (A, B, C…)</option>
                </select>
              </div>
              <div>
                <label className="text-[14px] text-slate-600">Wzorzec</label>
                <input type="text" value={namingPattern} onChange={(e) => setNamingPattern(e.target.value)} placeholder="{Row}{Section}-{Bin}-{Level}" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[14px] input-focus mt-0.5" />
                <p className="text-slate-500 text-[12px] mt-0.5">{'{Row}'} {'{Section}'} {'{Bin}'} {'{Level}'}</p>
              </div>
            </>
          )}

          {(namingStrategy === "rack-index" || namingStrategy === "custom") && (
            <>
              <div>
                <label className="text-[14px] text-slate-600">Wzorzec</label>
                <input type="text" value={namingPattern} onChange={(e) => setNamingPattern(e.target.value)} placeholder={namingStrategy === "rack-index" ? "{Rack}-{Index:2}" : "PICK-{Rack}-{Index}"} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[14px] input-focus mt-0.5" />
                <p className="text-slate-500 text-[12px] mt-0.5">{'{Rack}'} {'{Index}'} {'{Index:N}'}</p>
              </div>
              <div>
                <label className="text-[14px] text-slate-600">Rack (np. A1)</label>
                <input type="text" value={rowId} onChange={(e) => setRowId(e.target.value)} placeholder="A1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus mt-0.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[14px] text-slate-600">Dopełnienie indeksu</label>
                  <input type="number" min={1} max={5} value={indexPadding} onChange={(e) => setIndexPadding(Math.max(1, Math.min(5, Number(e.target.value) || 2)))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus mt-0.5" />
                </div>
                <div>
                  <label className="text-[14px] text-slate-600">Start indeksu</label>
                  <input type="number" min={0} value={startIndex} onChange={(e) => setStartIndex(Number(e.target.value) ?? 1)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] input-focus mt-0.5" />
                </div>
              </div>
            </>
          )}

          {namingStrategy === "manual" && (
            <>
              <p className="text-slate-600 text-[14px]">Kliknij komórki w widoku „Nazwy”, aby wpisać etykiety. Możesz też wkleić listę (jedna etykieta na linię).</p>
              <button type="button" onClick={handlePasteList} className="rounded-lg border border-slate-300 bg-slate-100 text-slate-700 px-3 py-2 text-[14px] font-medium hover:bg-slate-200">
                Wklej listę
              </button>
            </>
          )}

          {namingStrategy !== "manual" && (
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer text-[14px]">
              <input type="checkbox" checked={allowOverrides} onChange={(e) => setAllowOverrides(e.target.checked)} className="rounded" />
              Nadpisz pojedyncze etykiety (kliknij komórkę w widoku Nazwy)
            </label>
          )}
        </div>
      </section>

      {isEdit && (
        <label className="flex items-center gap-2 text-slate-600 text-[16px]">
          <input type="checkbox" checked={updateExistingRacks} onChange={(e) => setUpdateExistingRacks(e.target.checked)} className="rounded" />
          Zaktualizuj istniejące regały na planie
        </label>
      )}
      <div className="border-t border-slate-200 pt-4 space-y-2">
        <p className="text-slate-600 text-[16px] font-mono">Wymiary: {width_cm}×{depth_cm}×{height_cm} cm</p>
        <p className="text-slate-800 font-bold text-[16px] font-mono">Pojemność: {summaryStats.totalBins} lok. = {summaryStats.totalVolumeDm3} dm³</p>
      </div>
      <div className="flex gap-3 pt-2">
        {isEdit && onCancelEdit && (
          <button type="button" onClick={onCancelEdit} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 border border-slate-200">
            Anuluj
          </button>
        )}
        <span className="flex-1" />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white rounded-2xl overflow-hidden w-full">
      <h3 className="text-base font-black uppercase text-slate-700 px-6 py-4 border-b border-slate-100 shrink-0">
        {isEdit ? "Edytuj szablon" : "Twórca szablonu"}
      </h3>
      <div className="flex flex-1 min-h-0 gap-0 overflow-hidden">
        <div className="template-modal-sidebar w-[40%] min-w-[300px] shrink-0 overflow-y-auto border-r border-slate-100 p-6 bg-slate-50/30">
          {formSection}
        </div>
        <div className="flex-1 min-w-0 flex flex-col p-6 bg-white overflow-hidden min-h-0">
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <span className="text-slate-600 text-sm font-semibold">Podgląd:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button type="button" onClick={() => setPreviewMode("structure")} className={`px-3 py-1.5 text-sm font-medium ${previewMode === "structure" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Struktura</button>
              <button type="button" onClick={() => setPreviewMode("names")} className={`px-3 py-1.5 text-sm font-medium ${previewMode === "names" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Nazwy</button>
            </div>
          </div>
          <RackPreview
            width_cm={width_cm}
            depth_cm={depth_cm}
            height_cm={height_cm}
            levels={levels}
            bins_per_level={locationsPerLevel[0] ?? 4}
            levelConfig={levelConfigForSave}
            addressPattern={namingPattern.trim() || DEFAULT_ADDRESS_PATTERN}
            rowId={rowId.trim() || "A"}
            sectionStartIndex={sectionStartIndex}
            binNamingType={binNamingType}
            reserveBinKeys={reserveBinKeys}
            color={color}
            previewMode={previewMode}
            labelOptions={labelOptionsForPreview}
            onLabelEdit={(namingStrategy === "manual" || allowOverrides) ? handleLabelEdit : undefined}
            onBinClick={(levelIndex, binIndex) => setReserveBinKeys((prev) => {
              const key = cellKey(levelIndex, binIndex);
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })}
            className="flex-1 min-h-0"
          />
        </div>
      </div>
      {/* Sticky footer: always visible Save button */}
      <footer className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-6 py-4 flex items-center justify-between gap-4">
        {saveSuccess ? (
          <span className="text-emerald-600 font-semibold text-sm flex items-center gap-2">
            <span className="inline-block w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </span>
            Szablon zapisany
          </span>
        ) : (
          <span className="text-slate-500 text-sm">
            {name.trim() ? "" : "Uzupełnij nazwę szablonu, aby zapisać."}
          </span>
        )}
        <div className="flex gap-3">
          {isEdit && onCancelEdit && (
            <button type="button" onClick={onCancelEdit} disabled={saving} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 border border-slate-200 disabled:opacity-50">
              Anuluj
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-6 py-2.5 rounded-xl bg-cyan-600 text-white font-semibold hover:bg-cyan-500 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[160px] justify-center"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Zapisywanie…
              </>
            ) : saveSuccess ? (
              "Zapisano"
            ) : (
              isEdit ? "Zapisz zmiany" : "Zapisz szablon"
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
