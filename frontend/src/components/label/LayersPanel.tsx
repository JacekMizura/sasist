import { useMemo } from "react";
import type { MouseEvent } from "react";
import type { TemplateElement } from "../../types/labelSystem";
import { UI_STRINGS } from "../../constants/uiStrings";
import type { LabelCanvasSelection } from "../../pages/LabelSystem/hooks/useLabelSelection";
import { friendlyLayerLabel } from "../../labelSystem/layerFriendlyLabel";
import {
  GripVertical,
  Eye,
  EyeOff,
  Type,
  ScanBarcode,
  Image as ImageIcon,
  Minus,
  Square,
  Shapes,
  Layers,
  Repeat,
  Box,
  CircleDot,
} from "lucide-react";

export type LayersPanelProps = {
  elements: TemplateElement[];
  selection: LabelCanvasSelection | null;
  /** Layer row click; use Ctrl/Meta for multi-select toggle (top-level rows only). */
  onSelect: (id: string, e?: MouseEvent) => void;
  multiSelectIds?: string[];
  onReorder: (newOrder: TemplateElement[]) => void;
  onSetVisible: (id: string, visible: boolean) => void;
};

function sortForStack(a: TemplateElement, b: TemplateElement): number {
  const da = (a.zIndex ?? 0) - (b.zIndex ?? 0);
  if (da !== 0) return da;
  return a.id.localeCompare(b.id);
}

function LayerTypeIcon({ el }: { el: TemplateElement }) {
  const common = "h-3.5 w-3.5 shrink-0 text-slate-500";
  switch (el.type) {
    case "dynamicText":
    case "staticText":
      return <Type className={common} strokeWidth={2} aria-hidden />;
    case "barcode":
      return <ScanBarcode className={common} strokeWidth={2} aria-hidden />;
    case "image":
      return <ImageIcon className={common} strokeWidth={2} aria-hidden />;
    case "line":
      return <Minus className={common} strokeWidth={2} aria-hidden />;
    case "rect":
    case "section":
      return <Square className={common} strokeWidth={2} aria-hidden />;
    case "statusIcon":
      return <CircleDot className={common} strokeWidth={2} aria-hidden />;
    case "triangle":
    case "arrow":
    case "polygon":
      return <Shapes className={common} strokeWidth={2} aria-hidden />;
    case "group":
      return <Layers className={common} strokeWidth={2} aria-hidden />;
    case "repeater":
      return <Repeat className={common} strokeWidth={2} aria-hidden />;
    default:
      return <Box className={common} strokeWidth={2} aria-hidden />;
  }
}

/**
 * Top-level stack list: selection, visibility, reorder. Storage order is back→front (zIndex = index).
 */
export function LayersPanel({
  elements,
  selection,
  onSelect,
  multiSelectIds = [],
  onReorder,
  onSetVisible,
}: LayersPanelProps) {
  const panel = UI_STRINGS.labels.panel;

  const displayRows = useMemo(() => {
    const ordered = [...elements].sort(sortForStack);
    return [...ordered].reverse();
  }, [elements]);

  const orderedBase = useMemo(() => [...elements].sort(sortForStack), [elements]);

  const moveTowardFront = (id: string) => {
    const ordered = [...orderedBase];
    const i = ordered.findIndex((e) => e.id === id);
    if (i < 0 || i >= ordered.length - 1) return;
    [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]];
    onReorder(ordered.map((el, idx) => ({ ...el, zIndex: idx })));
  };

  const moveTowardBack = (id: string) => {
    const ordered = [...orderedBase];
    const i = ordered.findIndex((e) => e.id === id);
    if (i <= 0) return;
    [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]];
    onReorder(ordered.map((el, idx) => ({ ...el, zIndex: idx })));
  };

  return (
    <div className="flex max-h-64 min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/60 shadow-inner">
      <div className="rounded-t-lg border-b border-slate-200/80 bg-white/95 px-2.5 py-1.5">
        <div className="text-[11px] font-semibold text-slate-700">{panel.layers}</div>
        <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{panel.layersHint}</div>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 py-1">
        {displayRows.length === 0 ? (
          <li className="text-[11px] text-slate-400 px-2 py-2">—</li>
        ) : (
          displayRows.map((el) => {
            const isSelected = selection?.id === el.id && selection.slotIndex === 0;
            const isMulti = multiSelectIds.includes(el.id);
            const isHidden = el.visible === false;
            return (
              <li key={el.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => onSelect(el.id, ev)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(el.id);
                    }
                  }}
                  className={[
                    "flex items-center gap-1 rounded-md px-1 py-0.5 text-left cursor-pointer select-none border transition",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/80",
                    isSelected
                      ? "border-cyan-200 bg-cyan-50/70 shadow-sm ring-1 ring-cyan-200"
                      : "border-transparent hover:border-slate-200/90 hover:bg-slate-100/80",
                    isMulti && !isSelected ? "ring-1 ring-teal-300/70 bg-teal-50/80 border-teal-100" : "",
                    isHidden ? "opacity-55" : "",
                  ].join(" ")}
                >
                  <span
                    className="flex shrink-0 cursor-grab items-center text-slate-300 hover:text-slate-400"
                    title="Kolejność: strzałki w prawo"
                    aria-hidden
                  >
                    <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className="flex shrink-0 items-center justify-center rounded bg-slate-100/90 p-1 ring-1 ring-slate-200/60">
                    <LayerTypeIcon el={el} />
                  </span>
                  <span className="flex-1 min-w-0 text-[11px] font-medium text-slate-800 truncate" title={friendlyLayerLabel(el)}>
                    {friendlyLayerLabel(el)}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-[11px] leading-none text-slate-500 hover:bg-slate-200/90"
                      title={panel.layersUp}
                      aria-label={panel.layersUp}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveTowardFront(el.id);
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded text-[11px] leading-none text-slate-500 hover:bg-slate-200/90"
                      title={panel.layersDown}
                      aria-label={panel.layersDown}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveTowardBack(el.id);
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded border ${
                        isHidden
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      title={isHidden ? panel.layersToggleShow : panel.layersToggleHide}
                      aria-label={isHidden ? panel.layersToggleShow : panel.layersToggleHide}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetVisible(el.id, isHidden);
                      }}
                    >
                      {!isHidden ? <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
                    </button>
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
