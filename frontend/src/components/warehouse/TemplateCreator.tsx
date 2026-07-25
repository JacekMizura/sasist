import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { log } from "../../utils/logger";
import type { CustomRackTemplate, LevelConfigItem, LayoutState, StorageType, RackType, TemplatePassageDefault } from "../../types/warehouse";
import { snapCm, generateLocationLabel, levelHeightsForRack, type RackTemplateLabelOptions } from "./warehouseUtils";
import {
  countPassageVoidLevels,
  getPassageVoidHeightCm,
  storageLevelConfigAfterVoid,
} from "./passageStorage";
import { TemplatePassageOverlay } from "./TemplatePassageOverlay";
import { getStorageTypeStyle, normalizeBinTypeMap, normalizeStorageType, TEMPLATE_STORAGE_TYPE_OPTIONS } from "../../utils/storageTypes";
import { StorageTypeIcon } from "../../utils/storageTypeIcons";

const DEFAULT_ADDRESS_PATTERN = "{Row}{Section}-{Bin}-{Level}";

const DEFAULT_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

const UPRIGHT_BLUE = "#2563eb";
const SHELF_ORANGE = "#ea580c";
const SHELF_GREY = "#64748b";
const CELL_STROKE = "#cbd5e1";

function cellKey(levelIndex: number, binIndex: number): string {
  return `${levelIndex}-${binIndex}`;
}

function cycleTemplateStorageType(current: StorageType | undefined): StorageType {
  const currentType = normalizeStorageType(current);
  const idx = TEMPLATE_STORAGE_TYPE_OPTIONS.findIndex((option) => option.value === currentType);
  const nextIdx = idx >= 0 ? (idx + 1) % TEMPLATE_STORAGE_TYPE_OPTIONS.length : 0;
  return TEMPLATE_STORAGE_TYPE_OPTIONS[nextIdx]?.value ?? "primary";
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

/**
 * Industrial rack preview: blue vertical uprights (no top cap), orange/grey shelf beams
 * between levels only (no floor beam, no top beam). Last level open at top.
 * Per-bin: dynamic address (large bold), then W/H dimensions and Volume in smaller font; all centered.
 * When onBinClick is omitted, the preview is read-only (no pointer cursor, no click).
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
  binTypeMap,
  color: _color,
  className = "",
  onBinClick,
  title: titleProp,
  labelOptions,
  onLabelEdit,
  /** Stronger outline on this cell (e.g. last clicked in designer). */
  focusedBin,
  passages,
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
  binTypeMap: Record<string, StorageType>;
  color: string;
  className?: string;
  onBinClick?: (levelIndex: number, binIndex: number) => void;
  /** Optional title above the preview (default: "Podgląd regału — na żywo"). */
  title?: string;
  /** When set, labels come from getRackTemplateLabel (same as createBinsForRack). */
  labelOptions?: RackTemplateLabelOptions | null;
  /** When set, cells in names view are clickable to edit label (manual or override). */
  onLabelEdit?: (levelIndex: number, binIndex: number, currentValue: string) => void;
  focusedBin?: { level: number; bin: number } | null;
  /** Template default passages — void height skips bottom structural levels. */
  passages?: TemplatePassageDefault[];
}) {
  const structuralRows = (Array.isArray(levelConfig) && levelConfig.length > 0)
    ? levelConfig
    : Array.from({ length: Math.max(1, levels) }, (_, i) => ({ level: i + 1, locations: Math.max(1, bins_per_level) }));
  const voidCount = countPassageVoidLevels(
    height_cm,
    structuralRows.length,
    getPassageVoidHeightCm(passages)
  );
  const levelRows = storageLevelConfigAfterVoid(structuralRows, voidCount);
  const L = levelRows.length;
  const pattern = (addressPattern || DEFAULT_ADDRESS_PATTERN).trim() || DEFAULT_ADDRESS_PATTERN;
  const rackIdForPreview = (rowId || "A").replace(/\./g, "") + "1";
  const structuralHeights = levelHeightsForRack(height_cm, structuralRows.length);
  const levelHeights = levelRows.map((_, lev) => structuralHeights[lev + voidCount] ?? height_cm / Math.max(1, structuralRows.length));
  const voidHeightCm = structuralHeights.slice(0, voidCount).reduce((s, h) => s + h, 0);
  const cells: { level: number; bin: number; label: string; storageType: StorageType; locationsOnLevel: number; volPerBin: number; levelHeightCm: number }[] = [];
  for (let lev = 0; lev < L; lev++) {
    const locs = Math.max(1, levelRows[lev].locations);
    const structuralLev = lev + voidCount;
    const levelHeightCm = levelHeights[lev] ?? height_cm / Math.max(1, structuralRows.length);
    const volPerBinLev = volumePerBinForLevelHeightDm3(width_cm, depth_cm, levelHeightCm, locs);
    for (let bin = 0; bin < locs; bin++) {
      const nameLabel = generateLocationLabel({
        levelIndex: lev,
        segmentIndex: bin,
        levelRows,
        labelOptions: labelOptions ? { ...labelOptions, rackId: rackIdForPreview } : null,
        addressPattern: pattern,
        rowId,
        sectionStartIndex,
        binNamingType,
      });
      cells.push({
        level: lev,
        bin,
        label: nameLabel,
        storageType: normalizeStorageType(
          binTypeMap[cellKey(lev, bin)] ?? binTypeMap[cellKey(structuralLev, bin)]
        ),
        locationsOnLevel: locs,
        volPerBin: volPerBinLev,
        levelHeightCm,
      });
    }
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 500, h: 400 });
  const [hoverBin, setHoverBin] = useState<{ level: number; bin: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setContainerSize({
        w: Math.max(1, cr.width),
        h: Math.max(1, cr.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const margin = 8;
  const beamW = 8;
  /** Fixed logical width — scale-to-fit via meet, independent of column count. */
  const viewBoxW = 1000;
  /** Keep a stable aspect so the full rack fits the container (no right-edge clip). */
  const viewBoxH = Math.max(280, Math.round(viewBoxW * (containerSize.h / Math.max(containerSize.w, 1))));
  const contentW = viewBoxW - 2 * margin - 2 * beamW;
  const contentAreaH = viewBoxH - 2 * margin;
  const totalLevelHeightCm = Math.max(1, levelHeights.reduce((sum, v) => sum + Math.max(1, v), 0) + Math.max(0, voidHeightCm));
  const ox = margin + beamW;
  const contentAreaY = margin;
  const pad = 2;
  const textPadding = 5;
  const levelPixelHeight = (level: number) => {
    const levelHeightCm = Math.max(1, levelHeights[level] ?? 1);
    return (levelHeightCm / totalLevelHeightCm) * contentAreaH;
  };
  const voidPixelHeight = voidHeightCm > 0 ? (voidHeightCm / totalLevelHeightCm) * contentAreaH : 0;
  const levelToY = (level: number) => {
    let y = contentAreaY + pad;
    for (let lev = L - 1; lev > level; lev--) y += levelPixelHeight(lev);
    return y;
  };
  const cellInsetH = (level: number) => Math.max(0, levelPixelHeight(level) - pad * 2);

  const floorY = (L > 0 ? levelToY(0) + cellInsetH(0) : contentAreaY) + voidPixelHeight;
  const topLevelRowBottomY = L > 0 ? levelToY(L - 1) + cellInsetH(L - 1) : contentAreaY;
  const uprightTopY = topLevelRowBottomY;
  const uprightHeight = Math.max(0, floorY - topLevelRowBottomY);
  const internalShelfYs = L > 1 ? Array.from({ length: L - 1 }, (_, i) => levelToY(L - 2 - i)) : [];
  const voidBandY = L > 0 ? levelToY(0) + cellInsetH(0) : contentAreaY;

  return (
    <div className={`flex flex-col flex-1 min-h-0 rounded-2xl border border-slate-200/40 bg-white/90 shadow-sm overflow-hidden ${className}`}>
      <h4 className="text-sm font-bold text-slate-600 px-2 pb-2 shrink-0">{titleProp ?? "Podgląd regału"}</h4>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 min-w-0 rounded-xl border border-slate-200/35 bg-slate-50/20 overflow-hidden flex items-stretch justify-center"
      >
        <svg
            viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
            preserveAspectRatio="xMidYMid meet"
            className="max-h-full max-w-full w-full h-full rounded-xl"
            style={{ display: "block" }}
          >
            <defs>
              <filter id="rack-shadow" x="-5%" y="-5%" width="110%" height="110%">
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
                  strokeOpacity={0.45}
                  strokeLinecap="butt"
                />
              ))}
              {voidPixelHeight > 0 && (
                <g aria-label="Przejazd pod regałem">
                  <rect
                    x={ox}
                    y={voidBandY}
                    width={contentW}
                    height={Math.max(1, voidPixelHeight - pad)}
                    fill="#cbd5e1"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={ox + contentW / 2}
                    y={voidBandY + Math.max(1, voidPixelHeight - pad) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(20, Math.max(11, voidPixelHeight * 0.35))}
                    fontWeight={700}
                    fill="#334155"
                  >
                    PRZEJAZD
                  </text>
                </g>
              )}
              <g clipPath="url(#rack-content-clip)">
                {/* Vertical dividers: per level, within level band only */}
                {levelRows.map((row, lev) => {
                  const locs = Math.max(1, row.locations);
                  if (locs <= 1) return null;
                  const yStart = levelToY(lev);
                  const yEnd = yStart + cellInsetH(lev);
                  return Array.from({ length: locs - 1 }, (_, i) => (
                    <line
                      key={`div-${lev}-${i}`}
                      x1={ox + ((i + 1) / locs) * contentW}
                      y1={yStart}
                      x2={ox + ((i + 1) / locs) * contentW}
                      y2={yEnd}
                      stroke={SHELF_GREY}
                      strokeWidth={1}
                      opacity={0.9}
                    />
                  ));
                })}
                {/* Bins: Line1 ID 16px bold, Line2/3 12px; 5px padding; flex-like vertical center; scale down to min 10px when narrow. */}
                {cells.map(({ level, bin, label, storageType, locationsOnLevel, volPerBin: cellVol, levelHeightCm }) => {
                  const levelTotalWidthCm = Math.max(1, width_cm);
                  const locationWidthsCm = Array.from({ length: Math.max(1, locationsOnLevel) }, () => levelTotalWidthCm / Math.max(1, locationsOnLevel));
                  const totalWidthThisLevel = locationWidthsCm.reduce((sum, value) => sum + value, 0) || 1;
                  const widthPct = (locationWidthsCm[bin] ?? 0) / totalWidthThisLevel;
                  const offsetPct = locationWidthsCm.slice(0, bin).reduce((sum, value) => sum + value, 0) / totalWidthThisLevel;
                  const cellWLev = contentW * widthPct;
                  const x = ox + contentW * offsetPct + pad;
                  const y = levelToY(level);
                  const w = cellWLev - pad * 2;
                  const h = cellInsetH(level);
                  const tunedTypeStyle = storageType === "reserve"
                    ? { bg: "#fef9c3", border: "#fde68a" } // light yellow
                    : storageType === "damaged"
                      ? { bg: "#fee2e2", border: "#fecaca" } // light red
                      : { bg: "#eff6ff", border: "#bfdbfe" }; // primary light blue
                  const fill = tunedTypeStyle.bg;
                  const stroke = tunedTypeStyle.border;
                  const volStr = `${Number(cellVol).toFixed(2)} dm³`;
                  const locationWidthCm = locationWidthsCm[bin] ?? 0;
                  const title = `${label}\nSZ:${Math.round(locationWidthCm)} × GŁ:${Math.round(depth_cm)} × WYS:${Math.round(levelHeightCm)}\n${volStr}`;
                  const textColor = "#020617";
                  const subColor = "#475569";
                  const isFocused = focusedBin != null && focusedBin.level === level && focusedBin.bin === bin;
                  const isHovered = hoverBin != null && hoverBin.level === level && hoverBin.bin === bin;
                  const isCompact = w < 90 || h < 52;
                  const dimsLine = `SZ ${Math.round(locationWidthCm)} · GŁ ${Math.round(depth_cm)} · WYS ${Math.round(levelHeightCm)}`;
                  const labelText = label.length > 14 ? `${label.slice(0, 12)}…` : label;
                  const cx = x + w / 2;
                  const cy = y + h / 2;
                  const nameFont = Math.max(10, Math.min(22, w * 0.22));
                  const dimsFont = Math.max(8, Math.min(13, w * 0.12));
                  const capFont = Math.max(7, Math.min(11, w * 0.1));
                  const lineGap = 4;
                  const dimsOpacity = 0.88;
                  const capOpacity = 0.76;
                  const cellStroke = isFocused ? "#0284c7" : stroke;
                  const cellStrokeW = isFocused ? 2.75 : isHovered ? 1.65 : 1;
                  const nameBaselineY = isCompact
                    ? cy + nameFont * 0.35
                    : cy - (dimsFont + capFont + lineGap * 2) / 2 + nameFont * 0.35;
                  const dimsY = nameBaselineY + lineGap + dimsFont;
                  const capY = dimsY + lineGap + capFont;
                  return (
                    <g
                      key={`${level}-${bin}`}
                      onClick={() => {
                        if (onLabelEdit) onLabelEdit(level, bin, label);
                        else onBinClick?.(level, bin);
                      }}
                      onMouseEnter={() => setHoverBin({ level, bin })}
                      onMouseLeave={() => setHoverBin((h) => (h?.level === level && h?.bin === bin ? null : h))}
                      style={{ cursor: onLabelEdit || onBinClick ? "pointer" : undefined }}
                    >
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill={fill}
                        stroke={cellStroke}
                        strokeWidth={cellStrokeW}
                        rx={3}
                        style={{ transition: "stroke 150ms ease, stroke-width 150ms ease" }}
                      />
                      {isHovered && !isFocused ? (
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill="#0f172a"
                          opacity={0.05}
                          rx={3}
                          pointerEvents="none"
                          style={{ transition: "opacity 150ms ease" }}
                        />
                      ) : null}
                      <title>{title}</title>
                      <text x={cx} y={nameBaselineY} textAnchor="middle" fontSize={nameFont} fill={textColor} fontFamily="system-ui, sans-serif" fontWeight="800">
                        {labelText}
                      </text>
                      {!isCompact && (
                        <>
                          <text x={cx} y={dimsY} textAnchor="middle" fontSize={dimsFont} fill={subColor} opacity={dimsOpacity} fontFamily="system-ui, sans-serif">
                            {dimsLine}
                          </text>
                          <text x={cx} y={capY} textAnchor="middle" fontSize={capFont} fill={subColor} opacity={capOpacity} fontFamily="system-ui, sans-serif">
                            {volStr}
                          </text>
                        </>
                      )}
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

function DesignerAccordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/55 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="sticky top-0 z-[1] flex w-full items-center justify-between gap-2 border-b border-slate-200/45 bg-slate-50/95 px-3 py-2.5 text-left backdrop-blur-[6px] transition-colors hover:bg-slate-100/95"
      >
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-600">{title}</span>
        <span className="text-slate-400 text-xs tabular-nums shrink-0" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="space-y-3 px-3 py-3 text-[15px]">{children}</div> : null}
    </section>
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
  const [beamBetweenLevelsCm, setBeamBetweenLevelsCm] = useState<number[]>([8, 8, 8]);
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [rackType, setRackType] = useState<RackType>("warehouse");
  const [binTypeMap, setBinTypeMap] = useState<Record<string, StorageType>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [defaultPassages, setDefaultPassages] = useState<TemplatePassageDefault[]>([]);
  const [instanceUpdateDialog, setInstanceUpdateDialog] = useState<{
    templateId: string;
    template: CustomRackTemplate;
    instanceCount: number;
  } | null>(null);
  const isEdit = Boolean(initialTemplate?.id);

  const [accordionOpen, setAccordionOpen] = useState({
    struktura: true,
    poziomy: true,
    nazewnictwo: true,
    kolory: true,
    przejazdy: true,
    zaawansowane: false,
  });
  const [previewFocusedBin, setPreviewFocusedBin] = useState<{ level: number; bin: number } | null>(null);
  const [selectedPassageIndex, setSelectedPassageIndex] = useState<number | null>(null);

  const toggleAccordion = (key: keyof typeof accordionOpen) => {
    setAccordionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };
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
  const [levelMaxLoadKg, setLevelMaxLoadKg] = useState(500);

  useEffect(() => {
    if (initialTemplate) {
      setName(initialTemplate.name);
      setWidthCm(initialTemplate.width_cm);
      setDepthCm(initialTemplate.depth_cm);
      setHeightCm(initialTemplate.height_cm);
      setLevels(initialTemplate.levels);
      setRackType(initialTemplate.rack_type ?? "warehouse");
      if (Array.isArray(initialTemplate.levelConfig) && initialTemplate.levelConfig.length > 0) {
        setLocationsPerLevel(initialTemplate.levelConfig.map((row) => Math.max(1, row.locations)));
        setBeamBetweenLevelsCm(
          initialTemplate.levelConfig
            .slice(0, Math.max(0, initialTemplate.levelConfig.length - 1))
            .map((row) => Math.max(1, row.beamBelowCm ?? 8))
        );
      } else {
        const B = Math.max(1, initialTemplate.bins_per_level ?? 4);
        setLocationsPerLevel(Array.from({ length: Math.max(1, initialTemplate.levels) }, () => B));
        setBeamBetweenLevelsCm(Array.from({ length: Math.max(0, initialTemplate.levels - 1) }, () => 8));
      }
      setColor(initialTemplate.color);
      setLevelMaxLoadKg(initialTemplate.level_max_load_kg ?? 500);
      setBinTypeMap(normalizeBinTypeMap(initialTemplate.bin_type_map, initialTemplate.reserve_bin_keys));
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
      setDefaultPassages(
        Array.isArray(initialTemplate.default_passages)
          ? initialTemplate.default_passages.map((p) => ({
              offset_along_cm: Number(p.offset_along_cm) || 0,
              width_cm: Math.max(1, Number(p.width_cm) || 100),
              clearance_height_cm: p.clearance_height_cm ?? null,
              enabled: p.enabled !== false,
            }))
          : []
      );
    } else {
      setName("");
      setWidthCm(120);
      setDepthCm(80);
      setHeightCm(200);
      setLevels(4);
      setLocationsPerLevel([4]);
      setBeamBetweenLevelsCm([8, 8, 8]);
      setColor(DEFAULT_COLORS[0]);
      setRackType("warehouse");
      setBinTypeMap({});
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
      setDefaultPassages([]);
    }
  }, [initialTemplate]);

  useEffect(() => {
    const targetLen = Math.max(0, levels - 1);
    setBeamBetweenLevelsCm((prev) => {
      if (prev.length === targetLen) return prev;
      if (targetLen <= 0) return [];
      if (prev.length > targetLen) return prev.slice(0, targetLen);
      return [...prev, ...Array.from({ length: targetLen - prev.length }, () => 8)];
    });
  }, [levels]);

  const levelConfigForSave = useMemo((): LevelConfigItem[] => {
    const L = Math.max(1, Math.min(20, levels));
    const arr = locationsPerLevel.length >= L ? locationsPerLevel.slice(0, L) : [...locationsPerLevel, ...Array.from({ length: L - locationsPerLevel.length }, () => 1)];
    return arr.map((loc, i) => ({
      level: i + 1,
      locations: Math.max(1, Math.min(50, loc)),
      ...(i < L - 1 ? { beamBelowCm: Math.max(1, Math.round(beamBetweenLevelsCm[i] ?? 8)) } : {}),
    }));
  }, [levels, locationsPerLevel, beamBetweenLevelsCm]);

  const isDirty = useMemo(() => {
    if (!initialTemplate) return name.trim() !== "" || Object.keys(binTypeMap).length > 0;
    const t = initialTemplate;
    const same = t.name === name.trim()
      && t.width_cm === width_cm && t.depth_cm === depth_cm && t.height_cm === height_cm
      && t.levels === levels && t.color === color
      && (t.rack_type ?? "warehouse") === rackType
      && JSON.stringify(normalizeBinTypeMap(t.bin_type_map, t.reserve_bin_keys)) === JSON.stringify(binTypeMap)
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
        if (i < t.levelConfig.length - 1) {
          const prevBeam = Math.max(1, Math.round(t.levelConfig[i]?.beamBelowCm ?? 8));
          const nextBeam = Math.max(1, Math.round(beamBetweenLevelsCm[i] ?? 8));
          if (prevBeam !== nextBeam) return true;
        }
      }
    }
    const ovKeys = Object.keys(t.overrides ?? {});
    const manualKeys = Object.keys(t.manualLabels ?? {});
    if (Object.keys(overrides).length !== ovKeys.length || ovKeys.some((k) => (t.overrides ?? {})[k] !== overrides[k])) return true;
    if (Object.keys(manualLabels).length !== manualKeys.length || manualKeys.some((k) => (t.manualLabels ?? {})[k] !== manualLabels[k])) return true;
    return false;
  }, [initialTemplate, name, width_cm, depth_cm, height_cm, levels, color, rackType, binTypeMap, locationsPerLevel, beamBetweenLevelsCm, namingStrategy, namingOrientation, namingPattern, rowId, sectionStartIndex, binNamingType, indexPadding, startIndex, overrides, manualLabels]);

  useEffect(() => {
    if (!isDirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, saving]);

  const summaryStats = useMemo(() => {
    const voidN = countPassageVoidLevels(
      height_cm,
      levelConfigForSave.length,
      getPassageVoidHeightCm(defaultPassages)
    );
    const storageCfg = storageLevelConfigAfterVoid(levelConfigForSave, voidN);
    const totalBins = storageCfg.reduce((s, r) => s + r.locations, 0);
    const structuralHeights = levelHeightsForRack(height_cm, levelConfigForSave.length);
    const storageHeight = structuralHeights.slice(voidN).reduce((s, h) => s + h, 0);
    const totalVolumeDm3 = (width_cm * depth_cm * Math.max(0, storageHeight)) / 1000;
    return { totalBins, totalVolumeDm3: Number(totalVolumeDm3.toFixed(2)), voidLevels: voidN };
  }, [levels, levelConfigForSave, width_cm, depth_cm, height_cm, defaultPassages]);

  const handleSave = async () => {
    const trimmed = name.trim() || "Własny regał";
    const rowIdVal = rowId.trim() || "A";
    const L = Math.max(1, Math.min(20, levels));
    const cfg = levelConfigForSave;
    const bins_per_level_legacy = cfg.length > 0 ? cfg[0].locations : 4;
    const patternVal = namingPattern.trim() || DEFAULT_ADDRESS_PATTERN;
    const rackHeightCm = snapCm(height_cm);
    // Temporary: confirm rack template height is independent from warehouse building height (do not use building_height_m for template validation).
    log("warehouseHeight", layout?.building_height_m);
    log("rackHeight", rackHeightCm);
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
      rack_type: rackType,
      naming_pattern: `${rowIdVal}-{R}-{L}-{B}`,
      addressPattern: patternVal,
      rowId: rowIdVal,
      sectionStartIndex: Math.max(0, sectionStartIndex),
      autoSectionNumbering: autoSectionNumbering,
      binNamingType,
      bin_type_map: binTypeMap,
      namingStrategy,
      namingOrientation,
      namingPattern: patternVal,
      manualLabels: namingStrategy === "manual" ? manualLabels : undefined,
      overrides: allowOverrides && Object.keys(overrides).length > 0 ? overrides : undefined,
      indexPadding,
      startIndex,
      level_max_load_kg: Math.max(1, levelMaxLoadKg),
      default_passages: defaultPassages,
    };
    setSaving(true);
    setSaveSuccess(false);
    try {
      if (isEdit && initialTemplate && onSaveEdit) {
        // Always persist template first without touching instances.
        await Promise.resolve(onSaveEdit(initialTemplate.id, payload, false));
        const instanceCount = (layout?.racks ?? []).filter((r) => r.templateId === initialTemplate.id).length;
        if (instanceCount > 0) {
          setInstanceUpdateDialog({
            templateId: initialTemplate.id,
            template: payload,
            instanceCount,
          });
          setSaveSuccess(true);
          return;
        }
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

  const confirmUpdateInstances = async () => {
    if (!instanceUpdateDialog || !onSaveEdit) return;
    setSaving(true);
    try {
      await Promise.resolve(
        onSaveEdit(instanceUpdateDialog.templateId, instanceUpdateDialog.template, true)
      );
      setInstanceUpdateDialog(null);
      onCancelEdit?.();
    } catch (e) {
      console.error("Update template instances failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const dismissUpdateInstances = () => {
    setInstanceUpdateDialog(null);
    onCancelEdit?.();
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
    setPreviewFocusedBin({ level: levelIndex, bin: binIndex });
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

  const fieldLabel = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";
  const fieldInput =
    "w-full rounded-lg border border-slate-200/70 bg-white text-slate-900 text-[15px] px-2.5 py-2 input-focus shadow-sm shadow-slate-900/[0.02] transition-[box-shadow,border-color] duration-150";

  const formSection = (
    <div className="space-y-3 text-[15px]">
      <DesignerAccordion title="STRUKTURA" open={accordionOpen.struktura} onToggle={() => toggleAccordion("struktura")}>
        <div>
          <label className={fieldLabel}>Nazwa</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Regał wysokie palety"
            className={fieldInput}
          />
        </div>
        <div>
          <label className={fieldLabel}>Typ regału</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRackType("warehouse")}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg border transition-all duration-150 ${
                rackType === "warehouse" ? "bg-cyan-600 border-cyan-600 text-white shadow-md" : "bg-white/80 border-slate-200/70 text-slate-700 hover:bg-slate-50"
              }`}
            >
              Magazyn
            </button>
            <button
              type="button"
              onClick={() => setRackType("store")}
              className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg border transition-all duration-150 ${
                rackType === "store" ? "bg-cyan-600 border-cyan-600 text-white shadow-md" : "bg-white/80 border-slate-200/70 text-slate-700 hover:bg-slate-50"
              }`}
            >
              Sklep
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={fieldLabel}>Szer. (cm)</label>
            <input type="number" min={10} step={10} value={width_cm} onChange={(e) => setWidthCm(Number(e.target.value) || 10)} className={fieldInput} />
          </div>
          <div>
            <label className={fieldLabel}>Gł. (cm)</label>
            <input type="number" min={10} step={10} value={depth_cm} onChange={(e) => setDepthCm(Number(e.target.value) || 10)} className={fieldInput} />
          </div>
        </div>
        <div>
          <label className={fieldLabel}>Wys. (cm)</label>
          <input type="number" min={10} step={10} value={height_cm} onChange={(e) => setHeightCm(Number(e.target.value) || 10)} className={fieldInput} />
        </div>
        <div>
          <label className={fieldLabel}>Liczba poziomów</label>
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
            className={fieldInput}
          />
        </div>
        <div>
          <label className={fieldLabel}>Obciążenie na poziom (kg)</label>
          <input
            type="number"
            min={1}
            step={10}
            value={levelMaxLoadKg}
            onChange={(e) => setLevelMaxLoadKg(Math.max(1, Number(e.target.value) || 500))}
            className={fieldInput}
            placeholder="500"
          />
          <p className="text-slate-500 text-xs mt-1">Maksymalna dopuszczalna waga dla jednego poziomu regału.</p>
        </div>
      </DesignerAccordion>

      <DesignerAccordion title="POZIOMY" open={accordionOpen.poziomy} onToggle={() => toggleAccordion("poziomy")}>
        <div>
          <label className={`${fieldLabel} normal-case tracking-normal text-slate-600`}>Lokalizacje na poziom</label>
          <div className="space-y-2">
            {Array.from({ length: Math.max(1, levels) }, (_, orderIdx) => {
              const levelNumber = Math.max(1, levels) - orderIdx;
              const levelIndex = levelNumber - 1;
              const val = locationsPerLevel[levelIndex] ?? 1;
              return (
                <div key={levelNumber} className="flex items-center gap-2">
                  <span className="text-slate-600 font-medium w-[4.5rem] shrink-0 text-sm">Poziom {levelNumber}</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={val}
                    onChange={(e) =>
                      setLocationsPerLevel((prev) => {
                        const next = [...prev];
                        while (next.length <= levelIndex) next.push(1);
                        next[levelIndex] = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                        return next;
                      })
                    }
                    className={`${fieldInput} flex-1 py-1.5`}
                  />
                  <span className="text-slate-400 text-sm shrink-0">lok.</span>
                </div>
              );
            })}
          </div>
        </div>
        {levels > 1 && (
          <div>
            <label className={`${fieldLabel} normal-case tracking-normal text-slate-600`}>Traversy między poziomami (cm)</label>
            <div className="space-y-2">
              {Array.from({ length: Math.max(0, levels - 1) }, (_, orderIdx) => {
                const lowerLevelNumber = (levels - 1) - orderIdx;
                const beamIndex = lowerLevelNumber - 1;
                const val = beamBetweenLevelsCm[beamIndex] ?? 8;
                return (
                  <div key={`beam-${lowerLevelNumber}`} className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-600 font-medium shrink-0 text-sm min-w-[5.5rem]">Poziom {lowerLevelNumber}</span>
                    <span className="text-slate-500 text-xs shrink-0">Trawers nad</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={val}
                      onChange={(e) =>
                        setBeamBetweenLevelsCm((prev) => {
                          const next = [...prev];
                          while (next.length <= beamIndex) next.push(8);
                          next[beamIndex] = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                          return next;
                        })
                      }
                      className={`${fieldInput} flex-1 min-w-[4rem] py-1.5`}
                    />
                    <span className="text-slate-400 text-sm shrink-0">cm</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DesignerAccordion>

      <DesignerAccordion title="NAZEWNICTWO" open={accordionOpen.nazewnictwo} onToggle={() => toggleAccordion("nazewnictwo")}>
        <div>
          <label className={`${fieldLabel} normal-case tracking-normal text-slate-600`}>Sposób nazewnictwa</label>
          <select
            value={namingStrategy}
            onChange={(e) => setNamingStrategy(e.target.value as NamingStrategyId)}
            className={fieldInput}
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
              <label className={`${fieldLabel} normal-case tracking-normal text-slate-600`}>Orientacja</label>
              <select
                value={namingOrientation}
                onChange={(e) => setNamingOrientation(e.target.value as "column-first" | "row-first")}
                className={fieldInput}
              >
                <option value="column-first">Pierwsza kolumna (A-1 B-1 C-1)</option>
                <option value="row-first">Pierwszy rząd (A-1 A-2 A-3)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600">Rząd ({'{Row}'})</label>
              <input type="text" value={rowId} onChange={(e) => setRowId(e.target.value)} placeholder="np. A" className={`${fieldInput} mt-0.5`} />
            </div>
            <div>
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer text-sm">
                <input type="checkbox" checked={autoSectionNumbering} onChange={(e) => setAutoSectionNumbering(e.target.checked)} className="rounded" />
                Automatyczna numeracja sekcji
              </label>
            </div>
            <div>
              <label className="text-sm text-slate-600">Startowa sekcja ({'{Section}'})</label>
              <input type="number" min={0} value={sectionStartIndex} onChange={(e) => setSectionStartIndex(Number(e.target.value) || 0)} className={`${fieldInput} mt-0.5`} />
            </div>
            <div>
              <label className="text-sm text-slate-600">Pozycja ({'{Bin}'})</label>
              <select value={binNamingType} onChange={(e) => setBinNamingType(e.target.value as "numeric" | "alpha")} className={`${fieldInput} mt-0.5`}>
                <option value="numeric">Liczbowe (1, 2, 3…)</option>
                <option value="alpha">Alfabetyczne (A, B, C…)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600">Wzorzec</label>
              <input type="text" value={namingPattern} onChange={(e) => setNamingPattern(e.target.value)} placeholder="{Row}{Section}-{Bin}-{Level}" className={`${fieldInput} mt-0.5 font-mono text-sm`} />
              <p className="text-slate-500 text-xs mt-0.5">{'{Row}'} {'{Section}'} {'{Bin}'} {'{Level}'}</p>
            </div>
          </>
        )}

        {(namingStrategy === "rack-index" || namingStrategy === "custom") && (
          <>
            <div>
              <label className="text-sm text-slate-600">Wzorzec</label>
              <input
                type="text"
                value={namingPattern}
                onChange={(e) => setNamingPattern(e.target.value)}
                placeholder={namingStrategy === "rack-index" ? "{Rack}-{Index:2}" : "PICK-{Rack}-{Index}"}
                className={`${fieldInput} mt-0.5 font-mono text-sm`}
              />
              <p className="text-slate-500 text-xs mt-0.5">{'{Rack}'} {'{Index}'} {'{Index:N}'}</p>
            </div>
            <div>
              <label className="text-sm text-slate-600">Rack (np. A1)</label>
              <input type="text" value={rowId} onChange={(e) => setRowId(e.target.value)} placeholder="A1" className={`${fieldInput} mt-0.5`} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-slate-600">Dopełnienie indeksu</label>
                <input type="number" min={1} max={5} value={indexPadding} onChange={(e) => setIndexPadding(Math.max(1, Math.min(5, Number(e.target.value) || 2)))} className={`${fieldInput} mt-0.5`} />
              </div>
              <div>
                <label className="text-sm text-slate-600">Start indeksu</label>
                <input type="number" min={0} value={startIndex} onChange={(e) => setStartIndex(Number(e.target.value) ?? 1)} className={`${fieldInput} mt-0.5`} />
              </div>
            </div>
          </>
        )}

        {namingStrategy === "manual" && (
          <>
            <p className="text-slate-600 text-sm">Kliknij komórki w podglądzie, aby wpisać etykiety. Możesz też wkleić listę (jedna etykieta na linię).</p>
            <button type="button" onClick={handlePasteList} className="rounded-lg border border-slate-200/80 bg-slate-50 text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-100 transition-colors duration-150">
              Wklej listę
            </button>
          </>
        )}

        {namingStrategy !== "manual" && (
          <label className="flex items-center gap-2 text-slate-600 cursor-pointer text-sm">
            <input type="checkbox" checked={allowOverrides} onChange={(e) => setAllowOverrides(e.target.checked)} className="rounded" />
            Nadpisz pojedyncze etykiety (kliknij komórkę w podglądzie)
          </label>
        )}
      </DesignerAccordion>

      <DesignerAccordion title="KOLORY" open={accordionOpen.kolory} onToggle={() => toggleAccordion("kolory")}>
        <div>
          <label className={fieldLabel}>Kolor regału (obrys / akcent)</label>
          <div className="flex flex-wrap gap-2 items-center">
            {DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-all duration-150 ${color === c ? "border-cyan-500 ring-2 ring-cyan-500/25 scale-105" : "border-slate-200/80"}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 cursor-pointer rounded-lg border border-slate-200/70 bg-transparent" />
          </div>
        </div>
        <p className="text-slate-500 text-sm leading-snug">Kliknij komórki w podglądzie, aby przełączać typ magazynowy (podstawowa / zapasowa / uszkodzone).</p>
        <div className="flex flex-wrap items-center gap-2">
          {TEMPLATE_STORAGE_TYPE_OPTIONS.map((option) => {
            const style = getStorageTypeStyle(option.value);
            return (
              <span
                key={option.value}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs shadow-sm"
                style={{ backgroundColor: style.bg, borderColor: style.border, color: style.text }}
              >
                <StorageTypeIcon storageType={option.value} size={12} />
                {option.label}
              </span>
            );
          })}
        </div>
      </DesignerAccordion>

      <DesignerAccordion title="PRZEJAZDY" open={accordionOpen.przejazdy} onToggle={() => toggleAccordion("przejazdy")}>
        <div className="space-y-3">
          <p className="text-slate-500 text-xs leading-snug">
            Jeden przejazd strukturalny na regał. Wysokość od posadzki wyznacza strefę bez
            lokalizacji magazynowych. Edytuj tutaj lub na widoku z góry (po prawej).
          </p>
          {defaultPassages.map((p, idx) => (
            <div
              key={idx}
              className={`flex flex-wrap items-end gap-2 rounded-lg border bg-white px-2 py-2 cursor-pointer ${
                selectedPassageIndex === idx ? "border-cyan-500 ring-1 ring-cyan-500/30" : "border-slate-200/70"
              }`}
              onClick={() => setSelectedPassageIndex(idx)}
            >
              <label className="text-xs text-slate-500">
                Położenie (cm)
                <input
                  type="number"
                  min={0}
                  value={p.offset_along_cm}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setDefaultPassages((prev) => prev.map((x, i) => (i === idx ? { ...x, offset_along_cm: v } : x)));
                  }}
                  className="mt-0.5 block w-24 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                Szerokość (cm)
                <input
                  type="number"
                  min={1}
                  value={p.width_cm}
                  onChange={(e) => {
                    const v = Math.max(1, Number(e.target.value) || 100);
                    setDefaultPassages((prev) => prev.map((x, i) => (i === idx ? { ...x, width_cm: v } : x)));
                  }}
                  className="mt-0.5 block w-24 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                Wysokość przejazdu (cm)
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={p.clearance_height_cm ?? ""}
                  placeholder="np. 80"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const v = raw === "" ? null : Math.max(0, Number(raw) || 0);
                    setDefaultPassages((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, clearance_height_cm: v } : x))
                    );
                  }}
                  className="mt-0.5 block w-28 rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500 pb-1">
                <input
                  type="checkbox"
                  checked={p.enabled !== false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDefaultPassages((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: checked } : x)));
                  }}
                />
                Włączony
              </label>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline pb-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setDefaultPassages((prev) => prev.filter((_, i) => i !== idx));
                  setSelectedPassageIndex((cur) => (cur === idx ? null : cur != null && cur > idx ? cur - 1 : cur));
                }}
              >
                Usuń
              </button>
            </div>
          ))}
          {defaultPassages.length === 0 ? (
            <button
              type="button"
              className="text-sm text-cyan-700 hover:underline"
              onClick={() => {
                const along = Math.max(1, snapCm(depth_cm));
                const width = Math.min(100, Math.max(40, along * 0.25));
                const offset = Math.max(0, (along - width) / 2);
                setDefaultPassages([
                  { offset_along_cm: offset, width_cm: width, clearance_height_cm: null, enabled: true },
                ]);
                setSelectedPassageIndex(0);
              }}
            >
              + Dodaj przejazd pod regałem
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              Limit: jeden przejazd strukturalny na regał. Usuń istniejący, aby dodać inny.
            </p>
          )}
        </div>
      </DesignerAccordion>

      <DesignerAccordion title="ZAAWANSOWANE" open={accordionOpen.zaawansowane} onToggle={() => toggleAccordion("zaawansowane")}>
        {isEdit ? (
          <p className="text-slate-500 text-sm leading-snug">
            Po zapisie, jeśli na planie są regały z tym szablonem, pojawi się pytanie o aktualizację instancji
            (tylko przejazdy <span className="font-medium">dziedziczone ze szablonu</span>; lokalne pozostaną bez zmian).
          </p>
        ) : (
          <p className="text-slate-500 text-sm">Brak dodatkowych opcji dla nowego szablonu.</p>
        )}
      </DesignerAccordion>
    </div>
  );

  return (
    <div className="relative flex flex-col h-full min-h-0 max-h-[100dvh] bg-white rounded-2xl overflow-hidden w-full border border-slate-200/40 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 px-5 py-3.5 border-b border-slate-200/50 shrink-0 bg-slate-50/40">
        {isEdit ? "Edytuj szablon" : "Twórca szablonu"}
      </h3>
      <div className="flex flex-1 min-h-0 gap-0 overflow-hidden flex-col lg:flex-row">
        <div className="template-modal-sidebar w-full lg:w-[40%] lg:min-w-[300px] max-h-[42vh] lg:max-h-none shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-slate-200/45 px-4 py-4 bg-slate-50/25">
          {formSection}
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3 px-4 py-4 bg-white overflow-hidden">
          <div className="shrink-0 rounded-xl border border-slate-200/55 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-700 shadow-sm shadow-slate-900/[0.02]">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-semibold text-slate-800 tabular-nums">{summaryStats.totalBins} lokalizacji</span>
              <span className="text-slate-500">·</span>
              <span className="tabular-nums">~{summaryStats.totalVolumeDm3.toLocaleString()} dm³ (szac.)</span>
              <span className="text-slate-500">·</span>
              <span>
                {width_cm}×{depth_cm}×{height_cm} cm
              </span>
              <span className="text-slate-500">·</span>
              <span>{rackType === "warehouse" ? "Regał magazynowy" : "Regał sklepowy"}</span>
              <span className="text-slate-500">·</span>
              <span>
                {levels} {levels === 1 ? "poziom" : levels >= 2 && levels <= 4 ? "poziomy" : "poziomów"}
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 min-w-0 grid grid-rows-[minmax(0,1.35fr)_minmax(120px,0.35fr)] gap-3 overflow-hidden">
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
              binTypeMap={binTypeMap}
              color={color}
              labelOptions={labelOptionsForPreview}
              focusedBin={previewFocusedBin}
              passages={defaultPassages}
              onLabelEdit={(namingStrategy === "manual" || allowOverrides) ? handleLabelEdit : undefined}
              onBinClick={(levelIndex, binIndex) => {
                setPreviewFocusedBin({ level: levelIndex, bin: binIndex });
                setBinTypeMap((prev) => {
                  const key = cellKey(levelIndex, binIndex);
                  const current = normalizeStorageType(prev[key]);
                  return { ...prev, [key]: cycleTemplateStorageType(current) };
                });
              }}
              className="min-h-0 min-w-0 h-full max-w-full"
            />
            <TemplatePassageOverlay
              width_cm={width_cm}
              depth_cm={depth_cm}
              passages={defaultPassages}
              selectedIndex={selectedPassageIndex}
              onSelectIndex={setSelectedPassageIndex}
              onChangePassages={setDefaultPassages}
              className="min-h-0 min-w-0 h-full max-w-full"
            />
          </div>
        </div>
      </div>
      {/* Sticky footer: always visible Save button */}
      <footer className="shrink-0 border-t border-slate-200/60 bg-white/95 backdrop-blur-sm px-5 py-3.5 flex items-center justify-between gap-4 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
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
            className="px-7 py-3 rounded-xl bg-cyan-600 text-white font-semibold text-[15px] hover:bg-cyan-500 shadow-md shadow-cyan-900/20 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2 min-w-[180px] justify-center transition-all duration-150"
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
      {instanceUpdateDialog ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4">
            <h4 className="text-base font-semibold text-slate-800">Szablon został zmieniony</h4>
            <p className="text-sm text-slate-600 leading-relaxed">
              Zaktualizować wszystkie regały korzystające z tego szablonu?
              Na planie: <span className="font-semibold tabular-nums">{instanceUpdateDialog.instanceCount}</span>.
              Zaktualizowane zostaną tylko przejazdy dziedziczone ze szablonu; przejazdy lokalne pozostaną bez zmian.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={dismissUpdateInstances}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 border border-slate-200 disabled:opacity-50"
              >
                Tylko zapisz szablon
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmUpdateInstances()}
                className="px-4 py-2.5 rounded-xl bg-cyan-600 text-white font-semibold hover:bg-cyan-500 disabled:opacity-50"
              >
                Aktualizuj instancje
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
