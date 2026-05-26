import type { LabelTemplate, TemplateElement } from "../../../types/labelSystem";
import { getOverlayHitSizePx, type LabelCanvasSelection, type OverlayEntry } from "../hooks/useLabelSelection";

const DEBUG_SHOW_BOUNDING_BOXES = false;

export type LabelCanvasProps = {
  template: LabelTemplate;
  overlayElementsOrdered: OverlayEntry[];
  selected: TemplateElement | null;
  /** Full selection including repeater slot (matches one overlay entry). */
  selection: LabelCanvasSelection | null;
  selectedId: string | null;
  /** Top-level ids toggled with Ctrl/Cmd+click (convert-to-repeater). */
  multiSelectedIds?: string[];
  /** When false, hide resize handles (e.g. multiple canvas multi-selection). */
  allowResizeHandles?: boolean;
  /** Display position for selected element (for nested elements: parent offset already applied). */
  selectedDisplayX?: number;
  selectedDisplayY?: number;
  /** Shown when a repeater template child is selected. */
  repeaterItemLabel?: string | null;
  setResizeState: (state: {
    id: string;
    corner: "nw" | "ne" | "sw" | "se";
    startClientX: number;
    startClientY: number;
    startElPx: { x_px: number; y_px: number; w_px: number; h_px: number };
  } | null) => void;
  handleCanvasMouseDown: (e: React.MouseEvent) => void;
  handleCanvasDragOver: (e: React.DragEvent) => void;
  handleCanvasDrop: (e: React.DragEvent) => void;
  labelSvg: string;
  hasRepeaterPreview?: boolean;
  /** Element IDs with validation errors (highlight border). */
  validationErrorElementIds?: string[];
  /** Element IDs with validation warnings (highlight border). */
  validationWarningElementIds?: string[];
  PX_PER_MM: number;
  GRID_LINE_STEP_MM: number;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  draftingTableRef: React.RefObject<HTMLDivElement | null>;
  isMiddlePanning: boolean;
  onMiddlePanStart: (e: React.MouseEvent) => void;
  /** When false, grid overlay is hidden (editor preference only). */
  showGrid?: boolean;
};

export function LabelCanvas({
  template,
  overlayElementsOrdered,
  selected,
  selection,
  selectedId,
  multiSelectedIds = [],
  allowResizeHandles = true,
  selectedDisplayX,
  selectedDisplayY,
  repeaterItemLabel,
  setResizeState,
  handleCanvasMouseDown,
  handleCanvasDragOver,
  handleCanvasDrop,
  labelSvg,
  hasRepeaterPreview = false,
  validationErrorElementIds,
  validationWarningElementIds,
  PX_PER_MM,
  GRID_LINE_STEP_MM,
  canvasRef,
  draftingTableRef,
  isMiddlePanning,
  onMiddlePanStart,
  showGrid = true,
}: LabelCanvasProps) {
  const selDispX = selectedDisplayX ?? (selected && "x" in selected ? selected.x : 0);
  const selDispY = selectedDisplayY ?? (selected && "y" in selected ? selected.y : 0);
  return (
    <div
      ref={draftingTableRef}
      id="label-designer-canvas-scroll"
      className="flex-1 min-h-0 min-w-0 flex flex-col items-center justify-start gap-3 overflow-auto bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 py-6 px-6"
      onMouseDown={onMiddlePanStart}
      style={{ cursor: isMiddlePanning ? "grabbing" : "default" }}
    >
      {hasRepeaterPreview && (
        <span className="text-[10px] font-medium text-slate-300/90">Podgląd: 3 przykładowe pozycje</span>
      )}
      <div
        className="flex-shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5"
        style={{
          width: `${template.widthMm * PX_PER_MM}px`,
          height: `${template.heightMm * PX_PER_MM}px`,
        }}
      >
        <div
          ref={canvasRef}
          className="relative bg-white overflow-hidden"
          style={{
            width: `${template.widthMm * PX_PER_MM}px`,
            height: `${template.heightMm * PX_PER_MM}px`,
          }}
          onMouseDown={handleCanvasMouseDown}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {/* Grid overlay — subtelna siatka */}
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ zIndex: 0, pointerEvents: "none" }}
              aria-hidden
            >
              {Array.from({ length: Math.ceil(template.widthMm / GRID_LINE_STEP_MM) + 1 }, (_, i) => (
                <div
                  key={`v-${i}`}
                  className="absolute top-0 bottom-0 pointer-events-none bg-slate-400/12"
                  style={{ left: i * GRID_LINE_STEP_MM * PX_PER_MM, width: 1, pointerEvents: "none" }}
                />
              ))}
              {Array.from({ length: Math.ceil(template.heightMm / GRID_LINE_STEP_MM) + 1 }, (_, i) => (
                <div
                  key={`h-${i}`}
                  className="absolute left-0 right-0 pointer-events-none bg-slate-400/12"
                  style={{ top: i * GRID_LINE_STEP_MM * PX_PER_MM, height: 1, pointerEvents: "none" }}
                />
              ))}
            </div>
          )}

          {labelSvg && (
            <div
              className="absolute inset-0 z-[1] pointer-events-none"
              style={{ width: "100%", height: "100%" }}
              aria-hidden
              dangerouslySetInnerHTML={{
                __html: labelSvg
                  .replace(/width="[^"]*"/, 'width="100%"')
                  .replace(/height="[^"]*"/, 'height="100%"'),
              }}
            />
          )}

          {overlayElementsOrdered.map((entry) => {
            const el = entry.element;
            const left = entry.displayX * PX_PER_MM;
            const top = entry.displayY * PX_PER_MM;
            const { w, h } = getOverlayHitSizePx(el, PX_PER_MM);
            const hasError = validationErrorElementIds?.includes(el.id);
            const hasWarning = validationWarningElementIds?.includes(el.id);
            const validationBorder =
              hasError ? "#dc2626" : hasWarning ? "#d97706" : undefined;
            const isPrimary =
              !!selection && el.id === selection.id && entry.slotIndex === selection.slotIndex;
            const isMulti =
              multiSelectedIds.length > 0 &&
              multiSelectedIds.includes(el.id) &&
              entry.slotIndex === 0 &&
              !isPrimary;
            return (
              <div
                key={`${el.id}-s${entry.slotIndex}-${entry.displayX}-${entry.displayY}`}
                data-draggable-wrapper
                data-element-id={el.id}
                className="absolute border-2 border-transparent transition-[box-shadow,border-color] duration-150"
                style={{
                  zIndex: isPrimary ? 15 : 2,
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${w}px`,
                  height: `${h}px`,
                  pointerEvents: "none",
                  ...(isPrimary
                    ? {
                        borderColor: "#0891b2",
                        boxShadow: "0 0 0 1px rgba(8,145,178,0.35), 0 6px 20px rgba(8,145,178,0.12)",
                      }
                    : {}),
                  ...(isMulti ? { borderColor: "#0d9488", borderStyle: "dashed" as const } : {}),
                  ...(validationBorder && !isPrimary && !isMulti ? { borderColor: validationBorder } : {}),
                  ...(DEBUG_SHOW_BOUNDING_BOXES
                    ? { outline: "1px dashed rgba(255,0,0,0.6)", outlineOffset: -1 }
                    : {}),
                }}
              />
            );
          })}

          {allowResizeHandles && selected && "width" in selected && (() => {
            const { w: selW, h: selH } = getOverlayHitSizePx(selected, PX_PER_MM);
            const leftPx = selDispX * PX_PER_MM;
            const topPx = selDispY * PX_PER_MM;
            return (
            <div
              className="absolute pointer-events-none"
              style={{
                left: leftPx,
                top: topPx,
                width: selW,
                height: selH,
                zIndex: 20,
                pointerEvents: "none",
              }}
              aria-hidden
            >
              {repeaterItemLabel ? (
                <div
                  className="absolute -top-5 left-0 whitespace-nowrap rounded bg-cyan-700 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow"
                  style={{ pointerEvents: "none" }}
                >
                  {repeaterItemLabel}
                </div>
              ) : null}
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <div
                  key={corner}
                  data-resize-handle
                  className="absolute h-2.5 w-2.5 rounded-sm border-2 border-white bg-cyan-500 shadow-md pointer-events-auto ring-1 ring-cyan-600/30"
                  style={{
                    left: corner === "nw" || corner === "sw" ? -4 : undefined,
                    right: corner === "ne" || corner === "se" ? -4 : undefined,
                    top: corner === "nw" || corner === "ne" ? -4 : undefined,
                    bottom: corner === "sw" || corner === "se" ? -4 : undefined,
                    cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setResizeState({
                      id: selected.id,
                      corner,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startElPx: {
                        x_px: selected.x * PX_PER_MM,
                        y_px: selected.y * PX_PER_MM,
                        w_px: selected.width * PX_PER_MM,
                        h_px: selected.height * PX_PER_MM,
                      },
                    });
                  }}
                  title="Resize"
                />
              ))}
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
