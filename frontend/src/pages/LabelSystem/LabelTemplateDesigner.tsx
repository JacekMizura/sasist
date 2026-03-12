import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelElement,
  TemplateElement,
  GroupElement,
  RepeaterElement,
  BarcodeElement,
  DynamicTextElement,
  StaticTextElement,
  DynamicBinding,
} from "../../types/labelSystem";
import {
  LABEL_VARIABLE_CATEGORIES,
  PREVIEW_SAMPLES,
  TEMPLATE_TYPE_CATEGORIES,
} from "../../types/labelSystem";
import { UI_STRINGS } from "../../constants/uiStrings";
import { renderLabel } from "../../labelRenderer";
import { generateId } from "./utils/id";
import { TemplateLibrary } from "./components/TemplateLibrary";
import { LabelToolbar } from "./components/LabelToolbar";
import { LabelInspectorPanel } from "./components/LabelInspectorPanel";

/** Designer scale: preview_pixels / template_mm. Single constant for canvas, save, and PDF. */
const PX_PER_MM = 8;

/** Grid snap in pixels so drag/resize stay in pixel space (no px→mm→snap→px jitter). */
const GRID_PX = 5;

/** Set to true to log drag-related pointer events to the console. */
const DRAG_DEBUG = false;

/** Set to true to show visible bounding boxes on overlay hit areas (for debugging misalignment). */
const DEBUG_SHOW_BOUNDING_BOXES = false;

/** Snap canvas position to grid in pixels. Use for drag, resize, drop. */
function snapToGridPx(px: number): number {
  return Math.round(px / GRID_PX) * GRID_PX;
}

/** Overlay size in px for any template element (avoids 0x0 hit areas). */
function getOverlaySizePx(el: TemplateElement): { w: number; h: number } {
  const wMm = "width" in el ? (el as { width: number }).width : 0;
  const hMm = "height" in el ? (el as { height: number }).height : 0;
  return { w: Math.max(0, wMm * PX_PER_MM), h: Math.max(0, hMm * PX_PER_MM) };
}

/** Grid line interval in mm (render line every N mm). */
const GRID_LINE_STEP_MM = 5;

/** Tokens that should create a barcode element when dropped on the canvas. */
const BARCODE_VARIABLE_TOKENS = new Set([
  "loc_barcode",
  "cart_barcode",
  "basket_barcode",
  "barcode_data",
  "ean",
]);

/** Clamp element position and size to label bounds so it never goes outside the canvas. */
function clampElementToLabel(
  el: LabelElement,
  labelWidthMm: number,
  labelHeightMm: number
): LabelElement {
  const w = Math.max(0.5, Math.min(el.width, labelWidthMm));
  const h = Math.max(0.5, Math.min(el.height, labelHeightMm));
  const maxX = Math.max(0, labelWidthMm - w);
  const maxY = Math.max(0, labelHeightMm - h);
  const x = Math.max(0, Math.min(el.x, maxX));
  const y = Math.max(0, Math.min(el.y, maxY));
  return { ...el, x, y, width: w, height: h };
}

/** Clamp any template element (element, group, repeater) to label bounds. */
function clampTemplateElement<T extends { x: number; y: number; width: number; height: number }>(
  el: T,
  labelWidthMm: number,
  labelHeightMm: number
): T {
  const w = Math.max(0.5, Math.min(el.width, labelWidthMm));
  const h = Math.max(0.5, Math.min(el.height, labelHeightMm));
  const maxX = Math.max(0, labelWidthMm - w);
  const maxY = Math.max(0, labelHeightMm - h);
  const x = Math.max(0, Math.min(el.x, maxX));
  const y = Math.max(0, Math.min(el.y, maxY));
  return { ...el, x, y, width: w, height: h };
}

function tokenToBinding(token: string): string {
  const t = token.trim();
  return t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1) : t;
}

function isBarcodeVariable(token: string): boolean {
  return BARCODE_VARIABLE_TOKENS.has(tokenToBinding(token));
}

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
  templateId?: number | null;
  onBack?: () => void;
};

export function LabelTemplateDesigner({ template, onTemplateChange, templateId, onBack }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  /** Drag state: all positions in canvas pixels to avoid px→mm→snap→px jitter. */
  const [dragState, setDragState] = useState<{
    id: string;
    startClientX: number;
    startClientY: number;
    elX_px: number;
    elY_px: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  type ResizeCorner = "nw" | "ne" | "sw" | "se";
  /** Resize state: element box in canvas pixels so resize is smooth. */
  const [resizeState, setResizeState] = useState<{
    id: string;
    corner: ResizeCorner;
    startClientX: number;
    startClientY: number;
    startElPx: { x_px: number; y_px: number; w_px: number; h_px: number };
  } | null>(null);
  const [rackBuilderOpen, setRackBuilderOpen] = useState(false);
  const [rackLocations, setRackLocations] = useState(4);
  const [rackSegmentWidth, setRackSegmentWidth] = useState(30);
  const [rackBarcodePosition, setRackBarcodePosition] = useState<"left" | "center" | "right">("center");
  const canvasRef = useRef<HTMLDivElement>(null);
  const draftingTableRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const templateRef = useRef(template);
  const updateElementRef = useRef<(id: string, patch: Partial<TemplateElement>) => void>(() => {});

  const previewRecord: Record<string, unknown> = useMemo(
    () => PREVIEW_SAMPLES[template.template_type ?? "location"],
    [template.template_type]
  );

  /** Shared renderer SVG for preview (single pipeline with PDF). */
  const [labelSvg, setLabelSvg] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    renderLabel(template, previewRecord as Record<string, unknown>).then((svg) => {
      if (!cancelled) setLabelSvg(svg);
    });
    return () => { cancelled = true; };
  }, [template, previewRecord]);

  const variableCategoryIds = TEMPLATE_TYPE_CATEGORIES[template.template_type ?? "location"];
  const variableCategories = LABEL_VARIABLE_CATEGORIES.filter((c) => variableCategoryIds.includes(c.id));

  const updateElement = useCallback(
    (id: string, patch: Partial<TemplateElement>) => {
      const labelW = template.widthMm;
      const labelH = template.heightMm;
      onTemplateChange({
        ...template,
        elements: template.elements.map((el) => {
          if (el.id !== id) return el;
          const merged = { ...el, ...patch } as TemplateElement;
          const clamped =
            merged.type === "group" || merged.type === "repeater"
              ? clampTemplateElement(merged, labelW, labelH)
              : clampElementToLabel(merged as LabelElement, labelW, labelH);
          return clamped;
        }) as LabelTemplate["elements"],
        updatedAt: new Date().toISOString(),
      });
    },
    [template, onTemplateChange]
  );
  templateRef.current = template;
  updateElementRef.current = updateElement;

  const addElement = useCallback(
    (el: LabelElement) => {
      onTemplateChange({
        ...template,
        elements: [...template.elements, el],
        updatedAt: new Date().toISOString(),
      });
      setSelectedId(el.id);
    },
    [template, onTemplateChange]
  );

  /** Add element at (xMm, yMm) when dropping a variable onto the canvas. Barcode variable → barcode element; else → dynamicText. */
  const addElementFromVariableDrop = useCallback(
    (token: string, xMm: number, yMm: number) => {
      const binding = tokenToBinding(token);
      const defaultW = 40;
      const defaultH = 8;
      const x = Math.max(0, Math.min(xMm, template.widthMm - defaultW));
      const y = Math.max(0, Math.min(yMm, template.heightMm - defaultH));
      if (isBarcodeVariable(token)) {
        const el: BarcodeElement = {
          id: generateId(),
          type: "barcode",
          x,
          y,
          width: Math.min(defaultW, template.widthMm - x),
          height: Math.min(12, template.heightMm - y),
          format: "Code128",
          dataBinding: binding as DynamicBinding,
          showValue: false,
        };
        addElement(el);
      } else {
        const el: DynamicTextElement = {
          id: generateId(),
          type: "dynamicText",
          x,
          y,
          width: Math.min(defaultW, template.widthMm - x),
          height: Math.min(defaultH, template.heightMm - y),
          binding: token as DynamicBinding,
          fontSize: 10,
          align: "left",
          verticalText: false,
        };
        addElement(el);
      }
    },
    [addElement, template.widthMm, template.heightMm]
  );

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const token = e.dataTransfer.getData("application/x-label-variable");
      if (!token) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x_px = snapToGridPx(e.clientX - rect.left);
      const y_px = snapToGridPx(e.clientY - rect.top);
      addElementFromVariableDrop(token, x_px / PX_PER_MM, y_px / PX_PER_MM);
    },
    [addElementFromVariableDrop]
  );

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-label-variable")) e.preventDefault();
  }, []);

  const generateRackSection = useCallback(() => {
    const segW = Math.max(10, rackSegmentWidth);
    const segH = 15;
    const bcW = 25;
    const bcH = 10;
    const bcX =
      rackBarcodePosition === "left" ? 1 : rackBarcodePosition === "right" ? segW - bcW - 1 : (segW - bcW) / 2;
    const templateElements: LabelElement[] = [
      {
        id: generateId(),
        type: "barcode",
        x: bcX,
        y: 1,
        width: bcW,
        height: bcH,
        format: "Code128",
        dataBinding: "barcode_data",
        showValue: false,
        textPosition: "below",
      },
      {
        id: generateId(),
        type: "dynamicText",
        x: 1,
        y: bcH + 1.5,
        width: segW - 2,
        height: 4,
        binding: "barcode_data",
        fontSize: 6,
        align: rackBarcodePosition === "left" ? "left" : rackBarcodePosition === "right" ? "right" : "center",
      },
    ];
    const rep: RepeaterElement = {
      id: generateId(),
      type: "repeater",
      x: 5,
      y: 5,
      width: segW * Math.min(rackLocations, 20),
      height: segH,
      dataset: "segments",
      direction: "horizontal",
      itemWidth: segW,
      itemHeight: segH,
      template: { elements: templateElements },
    };
    onTemplateChange({
      ...template,
      elements: [...template.elements, rep],
      updatedAt: new Date().toISOString(),
    });
    setSelectedId(rep.id);
  }, [template, onTemplateChange, rackLocations, rackSegmentWidth, rackBarcodePosition]);

  const handleSave = useCallback(async () => {
    const name = (template.name || "Bez nazwy").trim();
    const payload = {
      name,
      template_type: template.template_type ?? "location",
      template_json: JSON.stringify({
        ...template,
        name,
        template_type: template.template_type ?? "location",
        updatedAt: new Date().toISOString(),
      }),
    };
    setSaving(true);
    try {
      if (templateId != null && !Number.isNaN(templateId)) {
        await api.put(`/label-templates/${templateId}/`, payload);
      } else {
        await api.post("/label-templates/", payload);
      }
      onBack?.();
    } catch (err) {
      console.error("Save template failed:", err);
    } finally {
      setSaving(false);
    }
  }, [template, templateId, onBack]);

  const deleteElement = useCallback(
    (id: string) => {
      onTemplateChange({
        ...template,
        elements: template.elements.filter((e) => e.id !== id),
        updatedAt: new Date().toISOString(),
      });
      if (selectedId === id) setSelectedId(null);
    },
    [template, onTemplateChange, selectedId]
  );

  const selected = template.elements.find((e) => e.id === selectedId);
  const sortedElements = [...template.elements].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
  );

  /** Overlay order: selected element last so it stays on top and receives pointer events. */
  const overlayElementsOrdered = useMemo(() => {
    if (!selectedId) return sortedElements;
    const selectedEl = sortedElements.find((e) => e.id === selectedId);
    if (!selectedEl) return sortedElements;
    return [...sortedElements.filter((e) => e.id !== selectedId), selectedEl];
  }, [sortedElements, selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
      if (inInput) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          deleteElement(selectedId);
        }
      }
      if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (selectedId) {
          const el = template.elements.find((e) => e.id === selectedId);
          if (el && "type" in el) {
            const dup = { ...el, id: generateId() } as TemplateElement;
            if (dup.type === "group" && "elements" in dup) dup.elements = (dup.elements as LabelElement[]).map((c) => ({ ...c, id: generateId() }));
            if (dup.type === "repeater" && "template" in dup && dup.template?.elements) dup.template = { elements: dup.template.elements.map((c) => ({ ...c, id: generateId() })) };
            onTemplateChange({
              ...template,
              elements: [...template.elements, dup],
              updatedAt: new Date().toISOString(),
            });
            setSelectedId(dup.id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement, template, onTemplateChange]);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-element-id]") || target.closest("[data-draggable-wrapper]")) return;
      setSelectedId(null);
    },
    []
  );

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (DRAG_DEBUG) console.log("[LabelDesigner] element mousedown", { id, clientX: e.clientX, clientY: e.clientY });
      setSelectedId(id);
      setDragState(null);
      const el = template.elements.find((x) => x.id === id);
      if (!el || !("x" in el)) return;
      const elX_px = el.x * PX_PER_MM;
      const elY_px = el.y * PX_PER_MM;
      setDragState({
        id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        elX_px,
        elY_px,
      });
    },
    [template.elements]
  );

  useEffect(() => {
    if (!dragState) return;
    const state = dragState;
    const onMove = (e: MouseEvent) => {
      if (DRAG_DEBUG) console.log("[LabelDesigner] drag mousemove", { id: state.id, clientX: e.clientX, clientY: e.clientY });
      const t = templateRef.current;
      const el = t.elements.find((x) => x.id === state.id);
      if (!el || !("width" in el) || !("height" in el)) return;
      const dxPx = e.clientX - state.startClientX;
      const dyPx = e.clientY - state.startClientY;
      const canvasW_px = t.widthMm * PX_PER_MM;
      const canvasH_px = t.heightMm * PX_PER_MM;
      const elW_px = el.width * PX_PER_MM;
      const elH_px = el.height * PX_PER_MM;
      let newX_px = snapToGridPx(state.elX_px + dxPx);
      let newY_px = snapToGridPx(state.elY_px + dyPx);
      newX_px = Math.max(0, Math.min(newX_px, canvasW_px - elW_px));
      newY_px = Math.max(0, Math.min(newY_px, canvasH_px - elH_px));
      updateElementRef.current(state.id, {
        x: newX_px / PX_PER_MM,
        y: newY_px / PX_PER_MM,
      });
    };
    const onUp = () => {
      if (DRAG_DEBUG) console.log("[LabelDesigner] drag mouseup", { id: state.id });
      setDragState(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState]);

  useEffect(() => {
    if (!resizeState) return;
    const onMove = (e: MouseEvent) => {
      const el = template.elements.find((x) => x.id === resizeState.id);
      if (!el || !("width" in el)) return;
      const dxPx = e.clientX - resizeState.startClientX;
      const dyPx = e.clientY - resizeState.startClientY;
      const { x_px: sx, y_px: sy, w_px: sw, h_px: sh } = resizeState.startElPx;
      const canvasW_px = template.widthMm * PX_PER_MM;
      const canvasH_px = template.heightMm * PX_PER_MM;
      const minSize_px = Math.max(GRID_PX, 4);
      let x_px = sx;
      let y_px = sy;
      let w_px = sw;
      let h_px = sh;
      switch (resizeState.corner) {
        case "se":
          w_px = sw + dxPx;
          h_px = sh + dyPx;
          break;
        case "sw":
          x_px = sx + dxPx;
          w_px = sw - dxPx;
          h_px = sh + dyPx;
          break;
        case "ne":
          y_px = sy + dyPx;
          w_px = sw + dxPx;
          h_px = sh - dyPx;
          break;
        case "nw":
          x_px = sx + dxPx;
          y_px = sy + dyPx;
          w_px = sw - dxPx;
          h_px = sh - dyPx;
          break;
      }
      w_px = Math.max(minSize_px, snapToGridPx(w_px));
      h_px = Math.max(minSize_px, snapToGridPx(h_px));
      x_px = snapToGridPx(x_px);
      y_px = snapToGridPx(y_px);
      x_px = Math.max(0, Math.min(x_px, canvasW_px - w_px));
      y_px = Math.max(0, Math.min(y_px, canvasH_px - h_px));
      updateElement(resizeState.id, {
        x: x_px / PX_PER_MM,
        y: y_px / PX_PER_MM,
        width: w_px / PX_PER_MM,
        height: h_px / PX_PER_MM,
      });
    };
    const onUp = () => setResizeState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizeState, template.elements, template.widthMm, template.heightMm, updateElement]);

  useEffect(() => {
    if (!isMiddlePanning) return;
    const onMove = (e: MouseEvent) => {
      const s = middlePanRef.current;
      const el = draftingTableRef.current;
      if (!s || !el) return;
      el.scrollLeft = s.scrollLeft - (e.clientX - s.startX);
      el.scrollTop = s.scrollTop - (e.clientY - s.startY);
    };
    const onUp = () => {
      setIsMiddlePanning(false);
      middlePanRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isMiddlePanning]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#F8FAFC]">
      <LabelToolbar
        template={template}
        onTemplateChange={onTemplateChange}
        saving={saving}
        handleSave={handleSave}
        onBack={onBack}
        setPresetModalOpen={setPresetModalOpen}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Elements only */}
        <aside className="w-44 shrink-0 flex flex-col gap-2 p-3 bg-white border-r border-[#E2E8F0] overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-600">{UI_STRINGS.labels.designer.addElement}</h3>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                const el: BarcodeElement = {
                  id: generateId(),
                  type: "barcode",
                  x: 2,
                  y: 2,
                  width: 40,
                  height: 12,
                  format: "Code128",
                  dataBinding: "barcode_data",
                  showValue: false,
                };
                addElement(el);
              }}
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              {UI_STRINGS.labels.designer.barcode}
            </button>
            <button
              type="button"
              onClick={() => {
                const el: StaticTextElement = {
                  id: generateId(),
                  type: "staticText",
                  x: 2,
                  y: 2,
                  width: 46,
                  height: 4,
                  text: "Tekst",
                  fontSize: 8,
                  align: "left",
                };
                addElement(el);
              }}
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              {UI_STRINGS.labels.designer.staticText}
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "line",
                  x: 2,
                  y: 10,
                  width: 46,
                  height: 0,
                  strokeWidth: 0.5,
                })
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              {UI_STRINGS.labels.designer.line}
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "rect",
                  x: 2,
                  y: 12,
                  width: 46,
                  height: 4,
                  strokeWidth: 0.3,
                })
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              {UI_STRINGS.labels.designer.rect}
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "triangle",
                  x: 2,
                  y: 16,
                  width: 20,
                  height: 20,
                  variant: "topLeft",
                } as LabelElement)
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Trójkąt
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "arrow",
                  x: 2,
                  y: 36,
                  width: 15,
                  height: 10,
                  direction: "right",
                } as LabelElement)
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Strzałka
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "polygon",
                  x: 2,
                  y: 46,
                  width: 25,
                  height: 25,
                  points: "0 0, 100% 0, 50% 100%",
                } as LabelElement)
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Wielokąt
            </button>
            <button
              type="button"
              onClick={() => {
                const group: GroupElement = {
                  id: generateId(),
                  type: "group",
                  x: 5,
                  y: 5,
                  width: 60,
                  height: 30,
                  elements: [],
                };
                onTemplateChange({
                  ...template,
                  elements: [...template.elements, group],
                  updatedAt: new Date().toISOString(),
                });
                setSelectedId(group.id);
              }}
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Grupa
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "section",
                  x: 5,
                  y: 5,
                  width: 40,
                  height: 20,
                  backgroundColor: "#eab308",
                  borderColor: "#000",
                  borderWidth: 0.5,
                } as LabelElement)
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Sekcja (strefa)
            </button>
            <button
              type="button"
              onClick={() =>
                addElement({
                  id: generateId(),
                  type: "statusIcon",
                  x: 2,
                  y: 2,
                  width: 8,
                  height: 8,
                  icon: "arrow_right",
                } as LabelElement)
              }
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Ikona
            </button>
            <button
              type="button"
              onClick={() => {
                const rep: RepeaterElement = {
                  id: generateId(),
                  type: "repeater",
                  x: 5,
                  y: 5,
                  width: 90,
                  height: 20,
                  dataset: "levels",
                  direction: "horizontal",
                  itemWidth: 30,
                  template: { elements: [] },
                };
                onTemplateChange({
                  ...template,
                  elements: [...template.elements, rep],
                  updatedAt: new Date().toISOString(),
                });
                setSelectedId(rep.id);
              }}
              className="px-3 py-2 rounded-lg text-xs bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100 text-left"
            >
              Powtarzacz
            </button>
          </div>

          {/* Rack section builder */}
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 overflow-hidden">
            <button
              type="button"
              onClick={() => setRackBuilderOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100/80"
            >
              <span>Rack section builder</span>
              <span className="text-slate-400">{rackBuilderOpen ? "▼" : "▶"}</span>
            </button>
            {rackBuilderOpen && (
              <div className="px-2 pb-2 space-y-2">
                <div>
                  <label className="text-[10px] text-slate-500">Liczba lokalizacji</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={rackLocations}
                    onChange={(e) => setRackLocations(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Szer. segmentu (mm)</label>
                  <input
                    type="number"
                    min={10}
                    value={rackSegmentWidth}
                    onChange={(e) => setRackSegmentWidth(Math.max(10, Number(e.target.value) || 30))}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Pozycja kodu</label>
                  <select
                    value={rackBarcodePosition}
                    onChange={(e) => setRackBarcodePosition(e.target.value as "left" | "center" | "right")}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    <option value="left">Lewo</option>
                    <option value="center">Środek</option>
                    <option value="right">Prawo</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={generateRackSection}
                  className="w-full px-2 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-500"
                >
                  Generuj
                </button>
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-500 mt-1">
            Przeciągnij zmienną z prawego panelu na etykietę, aby dodać kod kreskowy lub tekst.
          </p>
          <TemplateLibrary
            current={template}
            onLoad={(t) => onTemplateChange({ ...t, updatedAt: new Date().toISOString() })}
            presetModalOpen={presetModalOpen}
            setPresetModalOpen={setPresetModalOpen}
            templateId={templateId ?? undefined}
          />
        </aside>

        {/* Center: Label canvas — preview stays inside this area, centered */}
        <div
          ref={draftingTableRef}
          className="flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-auto p-6 bg-[#F8FAFC]"
          onMouseDown={(e) => {
            if (e.button !== 1) return;
            const el = draftingTableRef.current;
            if (!el) return;
            e.preventDefault();
            middlePanRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
            setIsMiddlePanning(true);
          }}
          style={{ cursor: isMiddlePanning ? "grabbing" : "default" }}
        >
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
              onMouseDownCapture={DRAG_DEBUG ? (e: React.MouseEvent) => {
                const t = e.target as HTMLElement;
                console.log("[LabelDesigner] mousedown (capture)", {
                  isDraggableWrapper: !!t.closest("[data-draggable-wrapper]"),
                  isElementId: !!t.closest("[data-element-id]"),
                  tagName: t.tagName,
                  className: t.className?.slice(0, 50),
                });
              } : undefined}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
            >
              {/* Grid overlay: lines every GRID_LINE_STEP_MM */}
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
            {/* Editor preview: same renderer as PDF (renderLabel) so layout matches exactly */}
            {labelSvg && (
              <div
                className="absolute inset-0 z-[1] pointer-events-none"
                style={{ width: "100%", height: "100%" }}
                aria-hidden
                dangerouslySetInnerHTML={{
                  __html: labelSvg.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"'),
                }}
              />
            )}
            {/* Draggable wrappers: outer hit targets; selected rendered last with higher z-index */}
            {overlayElementsOrdered.map((el) => {
              const left = "x" in el ? el.x * PX_PER_MM : 0;
              const top = "y" in el ? el.y * PX_PER_MM : 0;
              const { w, h } = getOverlaySizePx(el);
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
                    ...(DEBUG_SHOW_BOUNDING_BOXES ? { outline: "1px dashed rgba(255,0,0,0.6)", outlineOffset: -1 } : {}),
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

        {/* Right: Variables (draggable) + Element properties */}
        <LabelInspectorPanel
          template={template}
          selected={selected}
          updateElement={updateElement}
          deleteElement={deleteElement}
          collapsedCategories={collapsedCategories}
          setCollapsedCategories={setCollapsedCategories}
          variableCategories={variableCategories}
        />
      </div>
    </div>
  );
}
