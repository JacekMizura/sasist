import type { LabelTemplate, TemplateElement } from "../../../types/labelSystem";

const DEBUG_SHOW_BOUNDING_BOXES = false;

function getOverlaySizePx(el: TemplateElement, PX_PER_MM: number): { w: number; h: number } {
  const wMm = "width" in el ? (el as { width: number }).width : 0;
  const hMm = "height" in el ? (el as { height: number }).height : 0;
  return { w: Math.max(0, wMm * PX_PER_MM), h: Math.max(0, hMm * PX_PER_MM) };
}

export type LabelCanvasProps = {
  template: LabelTemplate;
  overlayElementsOrdered: TemplateElement[];
  selected: TemplateElement | null;
  selectedId: string | null;
  handleElementMouseDown: (e: React.MouseEvent, id: string) => void;
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
};

export function LabelCanvas({
  template,
  overlayElementsOrdered,
  selected,
  selectedId,
  handleElementMouseDown,
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
}: LabelCanvasProps) {
  return (
    <div
      ref={draftingTableRef}
      className="flex-1 min-h-0 min-w-0 flex flex-col items-center justify-start gap-2 overflow-auto pt-2 pb-6 px-6 bg-[#F8FAFC]"
      onMouseDown={onMiddlePanStart}
      style={{ cursor: isMiddlePanning ? "grabbing" : "default" }}
    >
      {hasRepeaterPreview && (
        <span className="text-[10px] text-slate-500">Preview: 3 sample items</span>
      )}
      <div
        className="flex-shrink-0 overflow-hidden rounded-2xl border border-slate-200 shadow-xl"
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
          {/* Grid overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 0, pointerEvents: "none" }}
            aria-hidden
          >
            {Array.from({ length: Math.ceil(template.widthMm / GRID_LINE_STEP_MM) + 1 }, (_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 bg-slate-200/40"
                style={{ left: i * GRID_LINE_STEP_MM * PX_PER_MM, width: 1 }}
              />
            ))}
            {Array.from({ length: Math.ceil(template.heightMm / GRID_LINE_STEP_MM) + 1 }, (_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 bg-slate-200/40"
                style={{ top: i * GRID_LINE_STEP_MM * PX_PER_MM, height: 1 }}
              />
            ))}
          </div>

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

          {overlayElementsOrdered.map((el) => {
            const left = "x" in el ? el.x * PX_PER_MM : 0;
            const top = "y" in el ? el.y * PX_PER_MM : 0;
            const { w, h } = getOverlaySizePx(el, PX_PER_MM);
            const hasError = validationErrorElementIds?.includes(el.id);
            const hasWarning = validationWarningElementIds?.includes(el.id);
            const validationBorder =
              hasError ? "#dc2626" : hasWarning ? "#d97706" : undefined;
            return (
              <div
                key={el.id}
                data-draggable-wrapper
                data-element-id={el.id}
                role="button"
                tabIndex={0}
                className="absolute cursor-move border-2 border-transparent hover:border-cyan-400/50 focus:outline-none focus:border-cyan-500"
                style={{
                  zIndex: selectedId === el.id ? 15 : 2,
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${w}px`,
                  height: `${h}px`,
                  ...(selectedId === el.id ? { borderColor: "#0891b2" } : {}),
                  ...(validationBorder && selectedId !== el.id ? { borderColor: validationBorder } : {}),
                  ...(DEBUG_SHOW_BOUNDING_BOXES
                    ? { outline: "1px dashed rgba(255,0,0,0.6)", outlineOffset: -1 }
                    : {}),
                }}
                onMouseDown={(e) => handleElementMouseDown(e, el.id)}
              />
            );
          })}

          {selected && "width" in selected && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: selected.x * PX_PER_MM,
                top: selected.y * PX_PER_MM,
                width: selected.width * PX_PER_MM,
                height: selected.height * PX_PER_MM,
                zIndex: 20,
                pointerEvents: "none",
              }}
              aria-hidden
            >
              {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <div
                  key={corner}
                  className="absolute w-2 h-2 bg-cyan-500 border border-white rounded-sm pointer-events-auto shadow"
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
          )}
        </div>
      </div>
    </div>
  );
}
