import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import type { TemplateElement } from "../../types/labelSystem";
import { UI_STRINGS } from "../../constants/uiStrings";
import type { LabelCanvasSelection } from "../../pages/LabelSystem/hooks/useLabelSelection";
import { friendlyLayerLabel } from "../../labelSystem/layerFriendlyLabel";
import {
  flattenElementsForLayers,
  reorderLayerSiblings,
  type LayerTreeRow,
} from "../../pages/LabelSystem/labelDesignerLayerTree";
import {
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  Unlock,
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
  onSelect: (id: string, e?: MouseEvent) => void;
  multiSelectIds?: string[];
  onReorder: (newOrder: TemplateElement[]) => void;
  onSetVisible: (id: string, visible: boolean) => void;
  lockedIds?: ReadonlySet<string>;
  onToggleLock?: (id: string, locked: boolean) => void;
  fillHeight?: boolean;
};

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

export function LayersPanel({
  elements,
  selection,
  onSelect,
  multiSelectIds = [],
  onReorder,
  onSetVisible,
  lockedIds,
  onToggleLock,
  fillHeight = false,
}: LayersPanelProps) {
  const panel = UI_STRINGS.labels.panel;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragParentId, setDragParentId] = useState<string | null>(null);

  const displayRows: LayerTreeRow[] = useMemo(() => flattenElementsForLayers(elements), [elements]);

  const handleDropOnRow = (target: LayerTreeRow) => {
    if (!dragId || dragId === target.element.id) return;
    if (dragParentId !== target.parentId) return;
    const next = reorderLayerSiblings(elements, target.parentId, dragId, target.element.id);
    if (next) onReorder(next);
    setDragId(null);
    setDragParentId(null);
  };

  return (
    <div
      className={`flex min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ${
        fillHeight ? "flex-1" : "max-h-96"
      }`}
    >
      <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <div className="text-[11px] font-semibold text-slate-800">{panel.layers}</div>
        <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{panel.layersHint}</div>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {displayRows.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-6 text-center text-[11px] text-slate-400">
            Brak elementów — dodaj narzędzie z lewego panelu.
          </li>
        ) : (
          displayRows.map((row) => {
            const el = row.element;
            const isSelected = selection?.id === el.id && selection.slotIndex === 0;
            const isMulti = multiSelectIds.includes(el.id);
            const isHidden = el.visible === false;
            const isLocked = lockedIds?.has(el.id) ?? false;
            const isDragging = dragId === el.id;

            return (
              <li key={el.id}>
                <div
                  role="button"
                  tabIndex={0}
                  draggable={!isLocked}
                  onDragStart={(e: DragEvent) => {
                    if (isLocked) {
                      e.preventDefault();
                      return;
                    }
                    setDragId(el.id);
                    setDragParentId(row.parentId);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragParentId(null);
                  }}
                  onDragOver={(e) => {
                    if (!dragId || dragParentId !== row.parentId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDropOnRow(row);
                  }}
                  onClick={(ev) => onSelect(el.id, ev)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(el.id);
                    }
                  }}
                  className={[
                    "flex items-center gap-1 rounded-lg px-1 py-1 text-left cursor-pointer select-none border transition-all duration-150",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/80",
                    isSelected
                      ? "border-cyan-200 bg-cyan-50/70 shadow-sm ring-1 ring-cyan-200/80"
                      : "border-transparent hover:border-slate-200/90 hover:bg-slate-50",
                    isMulti && !isSelected ? "ring-1 ring-teal-300/70 bg-teal-50/80 border-teal-100" : "",
                    isHidden ? "opacity-50" : "",
                    isDragging ? "opacity-40" : "",
                    isLocked ? "bg-slate-50/80" : "",
                  ].join(" ")}
                  style={{ paddingLeft: `${6 + row.depth * 12}px` }}
                >
                  <span
                    className={`flex shrink-0 items-center ${isLocked ? "text-slate-200" : "cursor-grab text-slate-300 hover:text-slate-500"}`}
                    aria-hidden
                  >
                    <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                  <span className="flex shrink-0 items-center justify-center rounded-md bg-slate-100/90 p-1 ring-1 ring-slate-200/50">
                    <LayerTypeIcon el={el} />
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-800"
                    title={friendlyLayerLabel(el)}
                  >
                    {friendlyLayerLabel(el)}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {onToggleLock ? (
                      <button
                        type="button"
                        className={`inline-flex h-6 w-6 items-center justify-center rounded border transition-colors duration-150 ${
                          isLocked
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-transparent text-slate-400 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600"
                        }`}
                        title={isLocked ? "Odblokuj" : "Zablokuj"}
                        aria-label={isLocked ? "Odblokuj" : "Zablokuj"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLock(el.id, !isLocked);
                        }}
                      >
                        {isLocked ? (
                          <Lock className="h-3 w-3" strokeWidth={2} aria-hidden />
                        ) : (
                          <Unlock className="h-3 w-3" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded border transition-colors duration-150 ${
                        isHidden
                          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100"
                      }`}
                      title={isHidden ? panel.layersToggleShow : panel.layersToggleHide}
                      aria-label={isHidden ? panel.layersToggleShow : panel.layersToggleHide}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetVisible(el.id, isHidden);
                      }}
                    >
                      {!isHidden ? (
                        <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      )}
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
