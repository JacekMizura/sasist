import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
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
  BarcodeFormat,
  BarcodeTextPosition,
  DynamicBinding,
  StatusIconType,
  TemplateType,
} from "../../types/labelSystem";
import {
  DYNAMIC_BINDINGS,
  LABEL_VARIABLE_CATEGORIES,
  TEMPLATE_TYPE_OPTIONS,
  PREVIEW_SAMPLES,
  TEMPLATE_TYPE_CATEGORIES,
} from "../../types/labelSystem";
import { UI_STRINGS } from "../../constants/uiStrings";
import { generatePreset, PRESET_TYPES, PRESET_LABELS, type PresetType } from "../../services/labelPresets";
import {
  scaleToPx,
  type LayoutItem,
} from "../../utils/labelLayoutEngine";
import { renderLabel } from "../../labelRenderer";

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

/** Renders a single layout item (from shared layout engine) with scale px/mm. Same layout as PDF/preview. */
function _LayoutItemRenderer({ item, scalePxPerMm }: { item: LayoutItem; scalePxPerMm: number }) {
  const px = scaleToPx(item, scalePxPerMm);
  const rot = typeof item.rotation === "number" ? item.rotation : 0;
  const bg = item.backgroundColor ?? "transparent";
  const fg = item.textColor ?? "#000000";
  const border = item.borderColor ?? fg;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: px.left,
    top: px.top,
    width: px.width,
    height: px.height,
    transform: `rotate(${rot}deg)`,
    transformOrigin: "center",
    boxSizing: "border-box",
    backgroundColor: bg,
    borderColor: border,
    color: fg,
    pointerEvents: "none",
  };

  if (item.type === "text") {
    const fontSizePx = (item.fontSize ?? 10) * scalePxPerMm * 0.35;
    const justifyContent =
      item.horizontalAlign === "center" ? "center" : item.horizontalAlign === "right" ? "flex-end" : "flex-start";
    const alignItems =
      item.verticalAlign === "top" ? "flex-start" : item.verticalAlign === "bottom" ? "flex-end" : "center";
    return (
      <div
        style={{
          ...baseStyle,
          display: "flex",
          alignItems,
          justifyContent,
          padding: 1,
          overflow: "hidden",
          fontSize: fontSizePx,
          fontFamily: item.fontFamily ?? "sans-serif",
          fontWeight: item.bold ? "bold" : "normal",
          textAlign: item.horizontalAlign ?? "left",
        }}
      >
        {item.verticalText && item.text
          ? item.text.split("").map((c, i) => <span key={i}>{c}</span>)
          : (item.text ?? "")}
      </div>
    );
  }

  if (item.type === "barcode") {
    return (
      <div style={{ ...baseStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <BarcodeLayoutItem
          value={item.barcodeValue ?? "SAMPLE"}
          format={item.barcodeFormat ?? "Code128"}
          widthPx={px.width}
          heightPx={px.height}
          textColor={fg}
        />
      </div>
    );
  }

  if (item.type === "line") {
    const sw = (item.strokeWidth ?? 0.5) * scalePxPerMm;
    return (
      <svg width={px.width} height={px.height} style={{ position: "absolute", left: px.left, top: px.top, pointerEvents: "none" }} className="block">
        <line x1={0} y1={px.height / 2} x2={px.width} y2={px.height / 2} stroke={fg} strokeWidth={sw} />
      </svg>
    );
  }

  if (item.type === "rect") {
    const sw = (item.strokeWidth ?? 0.5) * scalePxPerMm;
    const fill = item.fill ?? item.backgroundColor ?? "none";
    return (
      <svg width={px.width} height={px.height} style={{ position: "absolute", left: px.left, top: px.top, pointerEvents: "none" }} className="block">
        <rect x={0} y={0} width={px.width} height={px.height} fill={fill} stroke={border} strokeWidth={sw} />
      </svg>
    );
  }

  if (item.type === "section") {
    const sw = (item.borderWidth ?? 0.5) * scalePxPerMm;
    return (
      <svg width={px.width} height={px.height} style={{ position: "absolute", left: px.left, top: px.top, pointerEvents: "none" }} className="block">
        <rect x={0} y={0} width={px.width} height={px.height} fill={bg} stroke={border} strokeWidth={sw} />
      </svg>
    );
  }

  if (item.type === "icon") {
    return (
      <div style={{ ...baseStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <StatusIconPreview icon={(item.icon as StatusIconType) ?? "none"} size={Math.min(px.width, px.height)} color={fg} />
      </div>
    );
  }

  if (item.type === "image" && item.src) {
    return (
      <div style={baseStyle}>
        <img src={item.src} alt="" className="w-full h-full object-contain" />
      </div>
    );
  }

  if (item.type === "arrow") {
    const dir = (item.direction ?? "right").toLowerCase();
    const w = px.width;
    const h = px.height;
    const cx = w / 2;
    const cy = h / 2;
    const head = Math.min(w, h) * 0.4;
    const sw = Math.max(0.5, (item.strokeWidth ?? 1) * scalePxPerMm);
    const stroke = border;
    const fill = item.backgroundColor ?? fg;
    const line = (x1: number, y1: number, x2: number, y2: number) => (
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sw} />
    );
    const triangle = (pts: string) => (
      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />
    );
    let content: React.ReactNode;
    if (dir === "right") {
      content = (
        <>
          {line(0, cy, w - head, cy)}
          {triangle(`${w},${cy} ${w - head},${cy - head * 0.7} ${w - head},${cy + head * 0.7}`)}
        </>
      );
    } else if (dir === "left") {
      content = (
        <>
          {line(head, cy, w, cy)}
          {triangle(`0,${cy} ${head},${cy - head * 0.7} ${head},${cy + head * 0.7}`)}
        </>
      );
    } else if (dir === "up") {
      content = (
        <>
          {line(cx, head, cx, h - head)}
          {triangle(`${cx},${h} ${cx - head * 0.7},${h - head} ${cx + head * 0.7},${h - head}`)}
        </>
      );
    } else {
      content = (
        <>
          {line(cx, h - head, cx, head)}
          {triangle(`${cx},0 ${cx - head * 0.7},${head} ${cx + head * 0.7},${head}`)}
        </>
      );
    }
    return (
      <div style={baseStyle}>
        <svg width={w} height={h} className="block" style={{ display: "block" }}>
          {content}
        </svg>
      </div>
    );
  }

  if (item.type === "triangle" || item.type === "polygon") {
    return <div style={{ ...baseStyle, border: `1px solid ${border}` }} />;
  }

  return <div style={baseStyle} />;
}

/** Barcode that fills element width: generate Code128 then scale so barcode width === element width. Bars only, no text. */
function BarcodeLayoutItem({
  value,
  format,
  widthPx,
  heightPx,
  textColor: _textColor,
}: {
  value: string;
  format: string;
  widthPx: number;
  heightPx: number;
  textColor?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [scaleX, setScaleX] = useState(1);

  useEffect(() => {
    if ((format !== "Code128" && format !== "QR") || !svgRef.current) return;
    if (format === "QR") return;
    try {
      JsBarcode(svgRef.current, value || "SAMPLE", {
        format: "CODE128",
        height: heightPx,
        margin: 0,
        displayValue: false,
      });
      const w = (svgRef.current as SVGGraphicsElement)?.getBBox?.()?.width ?? widthPx;
      setScaleX(w > 0 ? widthPx / w : 1);
    } catch {
      setScaleX(1);
    }
  }, [format, value, heightPx, widthPx]);

  if (format === "QR" || format === "DataMatrix") {
    return (
      <div style={{ width: widthPx, height: heightPx, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <QRCodeSync value={value} size={Math.min(widthPx, heightPx)} />
      </div>
    );
  }

  return (
    <div style={{ width: widthPx, height: heightPx, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        ref={svgRef}
        style={{
          height: heightPx,
          transform: `scaleX(${scaleX})`,
          transformOrigin: "center center",
        }}
      />
    </div>
  );
}

function QRCodeSync({ value, size }: { value: string; size: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value || "SAMPLE", { width: size, margin: 0 }).then(setUrl).catch(() => setUrl(""));
  }, [value, size]);
  return url ? <img src={url} alt="" width={size} height={size} /> : <span style={{ fontSize: 8 }}>QR</span>;
}

/** Grid snap size in mm (drag snaps to this). */
const GRID_SIZE_MM = 1;

/** Grid line interval in mm (render line every N mm). */
const GRID_LINE_STEP_MM = 5;

/** Warehouse color palette: yellow, red, green, blue, black + zone colors. */
const ZONE_COLORS = [
  "#eab308", "#ef4444", "#22c55e", "#3b82f6", "#000000",
  "#f97316", "#8b5cf6", "#06b6d4", "#64748b", "#ffffff",
];

/** Max label dimension for large rack labels (mm). */
const MAX_LABEL_MM = 2000;

/** Tokens that should create a barcode element when dropped on the canvas. */
const BARCODE_VARIABLE_TOKENS = new Set([
  "loc_barcode",
  "cart_barcode",
  "basket_barcode",
  "barcode_data",
  "ean",
]);

function generateId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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

function snapToGrid(mm: number): number {
  return Math.round(mm / GRID_SIZE_MM) * GRID_SIZE_MM;
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
  const [rotationHandleDrag, setRotationHandleDrag] = useState<{ id: string; startAngle: number; startRotation: number } | null>(null);
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
  const [_previewSvg, setPreviewSvg] = useState<string | null>(null);
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

  const scalePxPerMm = PX_PER_MM;

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
    if (!rotationHandleDrag) return;
    const onMove = (e: MouseEvent) => {
      const el = template.elements.find((x) => x.id === rotationHandleDrag.id);
      if (!el) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const elCenterX = (el.x + el.width / 2) * scalePxPerMm + rect.left;
      const elCenterY = (el.y + el.height / 2) * scalePxPerMm + rect.top;
      const angle = (Math.atan2(e.clientY - elCenterY, e.clientX - elCenterX) * 180) / Math.PI;
      let delta = angle - rotationHandleDrag.startAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const raw = rotationHandleDrag.startRotation + delta;
      const normalized = ((raw % 360) + 360) % 360;
      updateElement(rotationHandleDrag.id, { rotation: normalized });
    };
    const onUp = () => setRotationHandleDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [rotationHandleDrag, template.elements, updateElement, scalePxPerMm]);

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

  // Fetch SVG preview from backend (same engine as PDF) so designer matches PDF output
  useEffect(() => {
    const payload = {
      template: {
        widthMm: template.widthMm,
        heightMm: template.heightMm,
        elements: template.elements,
      },
      record: previewRecord,
    };
    const t = window.setTimeout(() => {
      api.post<{ svg: string }>("/label/preview/", payload)
        .then((res) => setPreviewSvg(res.data?.svg ?? null))
        .catch(() => setPreviewSvg(null));
    }, 300);
    return () => window.clearTimeout(t);
  }, [template.widthMm, template.heightMm, template.elements, previewRecord]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* Top toolbar: Back, Name, Type, Size, DPI, Save */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 bg-white border-b border-[#E2E8F0]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ← Szablony
          </button>
        )}
        <button
          type="button"
          onClick={() => setPresetModalOpen(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
        >
          Create from preset
        </button>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 uppercase">Nazwa</label>
          <input
            type="text"
            value={template.name}
            onChange={(e) => onTemplateChange({ ...template, name: e.target.value, updatedAt: new Date().toISOString() })}
            className="w-48 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 uppercase">Typ</label>
          <select
            value={template.template_type ?? "location"}
            onChange={(e) => onTemplateChange({ ...template, template_type: e.target.value as TemplateType, updatedAt: new Date().toISOString() })}
            className="rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
          >
            {TEMPLATE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 uppercase">Wymiary (mm)</label>
          <input
            type="number"
            min={10}
            max={MAX_LABEL_MM}
            value={template.widthMm}
            onChange={(e) => onTemplateChange({ ...template, widthMm: Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 50)), updatedAt: new Date().toISOString() })}
            className="w-16 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
          />
          <span className="text-slate-400">×</span>
          <input
            type="number"
            min={10}
            max={MAX_LABEL_MM}
            value={template.heightMm}
            onChange={(e) => onTemplateChange({ ...template, heightMm: Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 30)), updatedAt: new Date().toISOString() })}
            className="w-16 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-500 uppercase">DPI</label>
          <input
            type="number"
            min={72}
            max={600}
            value={template.dpi}
            onChange={(e) => onTemplateChange({ ...template, dpi: Number(e.target.value) || 300, updatedAt: new Date().toISOString() })}
            className="w-16 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-60"
        >
          {saving ? "Zapisywanie…" : "Zapisz szablon"}
        </button>
      </div>

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
        <aside className="w-72 shrink-0 flex flex-col gap-3 p-3 bg-white border-l border-[#E2E8F0] overflow-y-auto">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-600 mb-2">{UI_STRINGS.labels.panel.variables}</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
              Przeciągnij zmienną na etykietę. Zmienne kodów kreskowych utworzą element kodu kreskowego.
            </p>
            <div className="space-y-2">
              {variableCategories.map((cat) => {
                const isCollapsed = collapsedCategories[cat.id];
                const categoryLabel = UI_STRINGS.labels.categories[cat.id] ?? cat.label;
                return (
                  <div key={cat.id} className="rounded-xl border border-slate-100 bg-slate-50/80 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setCollapsedCategories((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100/80"
                    >
                      <span>{categoryLabel}</span>
                      <span className="text-slate-400">{isCollapsed ? "▶" : "▼"}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="px-2 pb-2 flex flex-col gap-1">
                        {cat.items.map((v) => (
                          <div
                            key={v.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("application/x-label-variable", v.token);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            className="px-3 py-2 rounded-lg bg-white border border-slate-100 text-[11px] font-mono text-slate-700 hover:bg-slate-100 hover:border-cyan-200 cursor-grab active:cursor-grabbing"
                            title={`Przeciągnij na etykietę: ${v.token}`}
                          >
                            {v.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            {selected ? (
              <>
                {selected && "width" in selected && (
                  <div className="mb-2">
                    <span className="text-[10px] text-slate-500 uppercase block mb-1">Wyrównaj</span>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" title="Align left" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { x: snapToGrid(0) })}>⬅</button>
                      <button type="button" title="Align center" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { x: snapToGrid(Math.max(0, (template.widthMm - selected.width) / 2)) })}>↔</button>
                      <button type="button" title="Align right" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { x: snapToGrid(Math.max(0, template.widthMm - selected.width)) })}>➡</button>
                      <button type="button" title="Align top" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { y: snapToGrid(0) })}>⬆</button>
                      <button type="button" title="Align middle" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { y: snapToGrid(Math.max(0, (template.heightMm - selected.height) / 2)) })}>↕</button>
                      <button type="button" title="Align bottom" className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600" onClick={() => updateElement(selected.id, { y: snapToGrid(Math.max(0, template.heightMm - selected.height)) })}>⬇</button>
                    </div>
                  </div>
                )}
                {selected && selected.type !== "group" && selected.type !== "repeater" && (
                  <div className="mb-2">
                    <span className="text-[10px] text-slate-500 uppercase block mb-1">Warstwa</span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        title={UI_STRINGS.warehouse.visuals.toFront}
                        className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                        onClick={() => {
                          const allZ = template.elements.map((e) => (e as { zIndex?: number }).zIndex ?? 0);
                          updateElement(selected.id, { zIndex: (allZ.length ? Math.max(...allZ) : 0) + 1 });
                        }}
                      >
                        {UI_STRINGS.warehouse.visuals.toFront}
                      </button>
                      <button
                        type="button"
                        title={UI_STRINGS.warehouse.visuals.bringForward}
                        className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                        onClick={() => updateElement(selected.id, { zIndex: ((selected as LabelElement).zIndex ?? 0) + 1 })}
                      >
                        {UI_STRINGS.warehouse.visuals.bringForward}
                      </button>
                      <button
                        type="button"
                        title={UI_STRINGS.warehouse.visuals.sendBackward}
                        className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                        onClick={() => updateElement(selected.id, { zIndex: ((selected as LabelElement).zIndex ?? 0) - 1 })}
                      >
                        {UI_STRINGS.warehouse.visuals.sendBackward}
                      </button>
                      <button
                        type="button"
                        title={UI_STRINGS.warehouse.visuals.toBack}
                        className="p-1.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px]"
                        onClick={() => {
                          const allZ = template.elements.map((e) => (e as { zIndex?: number }).zIndex ?? 0);
                          updateElement(selected.id, { zIndex: (allZ.length ? Math.min(...allZ) : 0) - 1 });
                        }}
                      >
                        {UI_STRINGS.warehouse.visuals.toBack}
                      </button>
                    </div>
                  </div>
                )}
                <h3 className="text-xs font-bold text-slate-600 mb-2">{UI_STRINGS.labels.panel.elementProperties}</h3>
                <ElementProperties
                  element={selected}
                  labelWidthMm={template.widthMm}
                  labelHeightMm={template.heightMm}
                  onUpdate={(patch) => updateElement(selected.id, patch)}
                  onDelete={() => deleteElement(selected.id)}
                />
              </>
            ) : (
              <p className="text-xs text-slate-500">{UI_STRINGS.labels.panel.clickToEdit}</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

const REPEATER_PREVIEW_COUNT = 3;

function _GroupRenderer({
  group,
  scale,
  selected,
  onMouseDown,
  previewRecord,
  onRotationHandleDrag,
}: {
  group: GroupElement;
  scale: number;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  previewRecord: Record<string, unknown>;
  onRotationHandleDrag: (s: { id: string; startAngle: number; startRotation: number } | null) => void;
}) {
  const left = group.x * scale;
  const top = group.y * scale;
  const width = Math.max(1, group.width * scale);
  const height = Math.max(1, group.height * scale);
  const rot = typeof group.rotation === "number" ? group.rotation : 0;
  const handleRotationMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).closest("[data-element-id]")?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    onRotationHandleDrag({ id: group.id, startAngle, startRotation: rot });
  };
  return (
    <div
      data-element-id={group.id}
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: `rotate(${rot}deg)`,
        transformOrigin: "center",
        border: selected ? "2px solid #0891b2" : "1px dashed rgba(8,145,178,0.4)",
        boxSizing: "border-box",
        cursor: "move",
        backgroundColor: "rgba(248,250,252,0.6)",
      }}
      onMouseDown={onMouseDown}
      className="overflow-visible"
    >
      {group.elements.map((el) => (
        <DesignerElement
          key={el.id}
          element={el}
          scalePxPerMm={scale}
          selected={false}
          onMouseDown={(e) => e.stopPropagation()}
          previewRecord={previewRecord}
        />
      ))}
      {selected && (
        <div
          role="button"
          tabIndex={0}
          onMouseDown={handleRotationMouseDown}
          className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-cyan-500 border-2 border-white shadow cursor-grab active:cursor-grabbing flex items-center justify-center text-white text-[10px]"
          title="Obracaj grupę"
          style={{ zIndex: 10 }}
        >
          ↻
        </div>
      )}
    </div>
  );
}

function _RepeaterRenderer({
  repeater,
  scale,
  selected,
  onMouseDown,
  previewRecord,
}: {
  repeater: RepeaterElement;
  scale: number;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  previewRecord: Record<string, unknown>;
}) {
  const left = repeater.x * scale;
  const top = repeater.y * scale;
  const itemW = repeater.itemWidth * scale;
  const itemH = (repeater.itemHeight ?? repeater.itemWidth) * scale;
  const dir = repeater.direction === "vertical";
  const templates = repeater.template?.elements ?? [];
  return (
    <div
      data-element-id={repeater.id}
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: dir ? itemW : itemW * REPEATER_PREVIEW_COUNT,
        height: dir ? itemH * REPEATER_PREVIEW_COUNT : itemH,
        border: selected ? "2px solid #0891b2" : "1px dashed rgba(8,145,178,0.4)",
        boxSizing: "border-box",
        cursor: "move",
        backgroundColor: "rgba(241,245,249,0.8)",
      }}
      onMouseDown={onMouseDown}
      className="overflow-hidden"
    >
      {Array.from({ length: REPEATER_PREVIEW_COUNT }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: dir ? 0 : i * itemW,
            top: dir ? i * itemH : 0,
            width: itemW,
            height: itemH,
          }}
        >
          {templates.map((el) => (
            <DesignerElement
              key={`${i}-${el.id}`}
              element={el}
              scalePxPerMm={scale}
              selected={false}
              onMouseDown={(e) => e.stopPropagation()}
              previewRecord={previewRecord}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

void _LayoutItemRenderer;
void _GroupRenderer;
void _RepeaterRenderer;

function DesignerElement({
  element,
  scalePxPerMm,
  selected,
  onMouseDown,
  previewRecord,
  onRotationHandleDrag,
  updateElement,
}: {
  element: LabelElement;
  scalePxPerMm: number;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  previewRecord: Record<string, unknown>;
  onRotationHandleDrag?: (s: { id: string; startAngle: number; startRotation: number } | null) => void;
  updateElement?: (id: string, patch: Partial<TemplateElement>) => void;
}) {
  const scale = scalePxPerMm;
  const left = element.x * scale;
  const top = element.y * scale;
  const width = Math.max(1, element.width * scale);
  const height = Math.max(1, element.height * scale);
  const rot = typeof element.rotation === "number" ? element.rotation : 0;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: `rotate(${rot}deg)`,
    transformOrigin: "center",
    border: selected ? "2px solid #0891b2" : "1px dashed rgba(8,145,178,0.4)",
    boxSizing: "border-box",
    cursor: "move",
  };

  const content = renderElementContent(element, previewRecord, scale);

  const bg = element.backgroundColor ?? "transparent";
  const fg = element.textColor ?? "#000";
  const borderColor = element.borderColor ?? fg;

  const handleRotationMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRotationHandleDrag || !updateElement) return;
    const rect = (e.target as HTMLElement).closest("[data-element-id]")?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    onRotationHandleDrag({ id: element.id, startAngle, startRotation: rot });
  };

  return (
    <div data-element-id={element.id} style={{ ...style, backgroundColor: bg, borderColor }} onMouseDown={onMouseDown} className="overflow-hidden">
      <div style={{ color: fg, width: "100%", height: "100%", borderColor: element.borderColor }} className="w-full h-full">
        {content}
      </div>
      {selected && onRotationHandleDrag && updateElement && (
        <div
          role="button"
          tabIndex={0}
          onMouseDown={handleRotationMouseDown}
          className="absolute -top-6 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-cyan-500 border-2 border-white shadow cursor-grab active:cursor-grabbing flex items-center justify-center text-white text-[10px]"
          title="Obracaj"
          style={{ zIndex: 10 }}
        >
          ↻
        </div>
      )}
    </div>
  );
}

function renderElementContent(
  el: LabelElement,
  record: Record<string, unknown>,
  scale: number
): React.ReactNode {
  const fg = el.textColor ?? "#000";
  const bg = el.backgroundColor;

  switch (el.type) {
    case "barcode": {
      const val = String(record[el.dataBinding] ?? record.barcode_data ?? "SAMPLE");
      const widthPx = el.width * scale;
      const heightPx = el.height * scale;
      return <BarcodePreview format={el.format} value={val} textPosition={(el as BarcodeElement).textPosition ?? "below"} widthPx={widthPx} heightPx={heightPx} textColor={fg} />;
    }
    case "dynamicText": {
      const val = String(record[el.binding] ?? "");
      const display = val || `{${el.binding}}`;
      const isVertical = el.verticalText === true;
      return (
        <div
          className="w-full h-full flex overflow-hidden"
          style={{
            maxWidth: "100%",
            minWidth: 0,
            fontSize: (el.fontSize ?? 10) * scale * 0.35,
            fontFamily: el.fontFamily ?? "sans-serif",
            fontWeight: el.bold ? "bold" : "normal",
            color: fg,
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...(isVertical
              ? { flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 0, lineHeight: 1 }
              : { flexDirection: "row", alignItems: "center", textAlign: el.align ?? "left" }),
          }}
          title={display}
        >
          <span className="block truncate" style={{ maxWidth: "100%" }}>
            {isVertical ? display.split("").map((c, i) => <span key={i}>{c}</span>) : display}
          </span>
        </div>
      );
    }
    case "staticText":
      return (
        <div
          className="w-full h-full flex overflow-hidden"
          style={{
            maxWidth: "100%",
            minWidth: 0,
            fontSize: (el.fontSize ?? 8) * scale * 0.35,
            fontFamily: el.fontFamily ?? "sans-serif",
            fontWeight: el.bold ? "bold" : "normal",
            color: fg,
            overflow: "hidden",
            textOverflow: "ellipsis",
            ...(el.verticalText
              ? { flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 0, lineHeight: 1 }
              : { flexDirection: "row", alignItems: "center", textAlign: el.align ?? "left" }),
          }}
        >
          <span className="block truncate" style={{ maxWidth: "100%" }}>
            {el.verticalText ? el.text.split("").map((c, i) => <span key={i}>{c}</span>) : el.text}
          </span>
        </div>
      );
    case "line":
      return (
        <svg width="100%" height="100%" className="block">
          <line
            x1={0}
            y1={el.height * scale * 0.5}
            x2={el.width * scale}
            y2={el.height * scale * 0.5}
            stroke={fg}
            strokeWidth={(el.strokeWidth ?? 0.5) * scale}
          />
        </svg>
      );
    case "rect":
      return (
        <svg width="100%" height="100%" className="block">
          <rect
            x={0}
            y={0}
            width={el.width * scale}
            height={el.height * scale}
            fill={bg ?? (el as import("../../types/labelSystem").RectElement).fill ?? "none"}
            stroke={fg}
            strokeWidth={(el.strokeWidth ?? 0.3) * scale}
          />
        </svg>
      );
    case "section": {
      const sec = el as import("../../types/labelSystem").SectionElement;
      const secBg = sec.backgroundColor ?? "#eab308";
      const secBorder = sec.borderColor ?? "#000";
      const secBorderW = (sec.borderWidth ?? 0.5) * scale;
      return (
        <svg width="100%" height="100%" className="block">
          <rect
            x={0}
            y={0}
            width={el.width * scale}
            height={el.height * scale}
            fill={secBg}
            stroke={secBorder}
            strokeWidth={secBorderW}
          />
        </svg>
      );
    }
    case "statusIcon":
      return <StatusIconPreview icon={el.icon} size={Math.min(el.width, el.height) * scale} color={fg} />;
    case "image":
      return el.src ? <img src={el.src} alt={el.alt ?? ""} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-slate-300" />;
    case "triangle": {
      const variant = (el as import("../../types/labelSystem").TriangleElement).variant ?? "topLeft";
      const clipPaths: Record<string, string> = {
        topLeft: "polygon(0 0, 100% 0, 0 100%)",
        topRight: "polygon(100% 0, 100% 100%, 0 0)",
        bottomLeft: "polygon(0 0, 0 100%, 100% 100%)",
        bottomRight: "polygon(100% 0, 0 100%, 100% 100%)",
      };
      const borderColor = el.borderColor ?? el.textColor ?? "#000";
      return (
        <div
          className="w-full h-full"
          style={{
            clipPath: clipPaths[variant],
            WebkitClipPath: clipPaths[variant],
            backgroundColor: bg ?? "transparent",
            border: `1px solid ${borderColor}`,
          }}
        />
      );
    }
    case "arrow": {
      const dir = (el as import("../../types/labelSystem").ArrowElement).direction ?? "right";
      const pathMap: Record<string, string> = {
        right: "M0,50 L70,10 L70,40 L100,40 L100,60 L70,60 L70,90 Z",
        left: "M100,50 L30,10 L30,40 L0,40 L0,60 L30,60 L30,90 Z",
        up: "M50,0 L90,70 L60,70 L60,100 L40,100 L40,70 L10,70 Z",
        down: "M50,100 L90,30 L60,30 L60,0 L40,0 L40,30 L10,30 Z",
      };
      const borderColor = el.borderColor ?? el.textColor ?? "#000";
      return (
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="block">
          <path d={pathMap[dir]} fill={bg ?? "transparent"} stroke={borderColor} strokeWidth={1} />
        </svg>
      );
    }
    case "polygon": {
      const points = (el as import("../../types/labelSystem").PolygonElement).points ?? "0 0, 100% 0, 50% 100%";
      const borderColor = el.borderColor ?? el.textColor ?? "#000";
      return (
        <div
          className="w-full h-full"
          style={{
            clipPath: `polygon(${points})`,
            WebkitClipPath: `polygon(${points})`,
            backgroundColor: bg ?? "transparent",
            border: `1px solid ${borderColor}`,
          }}
        />
      );
    }
    default:
      return null;
  }
}

function BarcodePreview({
  format,
  value,
  widthPx,
  heightPx,
}: { format: BarcodeFormat; value: string; showValue?: boolean; textPosition?: BarcodeTextPosition; widthPx: number; heightPx: number; textColor?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [scaleX, setScaleX] = useState(1);

  useEffect(() => {
    if (format === "QR" || format === "DataMatrix") {
      QRCode.toDataURL(value || "SAMPLE", { width: 80, margin: 0 }).then(setQrUrl).catch(() => setQrUrl(""));
    }
  }, [format, value]);

  useEffect(() => {
    if (format === "Code128" && svgRef.current) {
      try {
        JsBarcode(svgRef.current, value || "SAMPLE", {
          format: "CODE128",
          height: heightPx,
          margin: 0,
          displayValue: false,
        });
        const w = (svgRef.current as SVGGraphicsElement)?.getBBox?.()?.width ?? widthPx;
        setScaleX(w > 0 ? widthPx / w : 1);
      } catch {
        setScaleX(1);
      }
    }
  }, [format, value, widthPx, heightPx]);

  if (format === "QR" || format === "DataMatrix") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white">
        {qrUrl ? <img src={qrUrl} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[8px] text-slate-400">QR</span>}
      </div>
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white overflow-hidden" style={{ width: widthPx, height: heightPx }}>
      <svg
        ref={svgRef}
        className="block"
        style={{ height: heightPx, transform: `scaleX(${scaleX})`, transformOrigin: "center center" }}
      />
    </div>
  );
}

function StatusIconPreview({ icon, size, color }: { icon: StatusIconType; size: number; color?: string }) {
  const c = color ?? "#000";
  if (icon === "none") return null;
  const s = Math.max(8, size);
  const arrow = (deg: number) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" style={{ transform: `rotate(${deg}deg)` }}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
  if (icon === "arrow_up") return arrow(0);
  if (icon === "arrow_down") return arrow(180);
  if (icon === "arrow_left") return arrow(-90);
  if (icon === "arrow_right") return arrow(90);
  if (icon === "lock")
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    );
  if (icon === "heavy_load")
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
        <path d="M12 3v18M9 6l3-3 3 3M9 12l3 3 3-3M5 9l2 6h10l2-6" />
      </svg>
    );
  if (icon === "hazard")
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2">
        <path d="M12 2L2 22h20L12 2z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    );
  return null;
}

/** Clamp rotation to 0–360. */
function clampRotation(deg: number): number {
  const n = ((deg % 360) + 360) % 360;
  return Number.isFinite(n) ? n : 0;
}

function ElementProperties({
  element,
  labelWidthMm,
  labelHeightMm,
  onUpdate,
  onDelete,
}: {
  element: TemplateElement;
  labelWidthMm: number;
  labelHeightMm: number;
  onUpdate: (patch: Partial<TemplateElement>) => void;
  onDelete: () => void;
}) {
  const isGroup = element.type === "group";
  const isRepeater = element.type === "repeater";
  const isBarcode = element.type === "barcode";
  const isDynamicText = element.type === "dynamicText";
  const isStaticText = element.type === "staticText";
  const isStatusIcon = element.type === "statusIcon";
  const isSection = element.type === "section";
  const isShape = element.type === "triangle" || element.type === "arrow" || element.type === "polygon" || element.type === "rect" || element.type === "line";

  const maxX = Math.max(0, labelWidthMm - element.width);
  const maxY = Math.max(0, labelHeightMm - element.height);

  return (
    <div className="space-y-2 text-xs text-[#1E293B]">
      <div className="grid grid-cols-2 gap-1">
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.xMm}</label>
        <input
          type="number"
          step={0.5}
          min={0}
          max={maxX}
          value={element.x}
          onChange={(e) => onUpdate({ x: Math.max(0, Math.min(Number(e.target.value) || 0, maxX)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.yMm}</label>
        <input
          type="number"
          step={0.5}
          min={0}
          max={maxY}
          value={element.y}
          onChange={(e) => onUpdate({ y: Math.max(0, Math.min(Number(e.target.value) || 0, maxY)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.widthMm}</label>
        <input
          type="number"
          step={0.5}
          min={0.5}
          max={labelWidthMm}
          value={element.width}
          onChange={(e) => onUpdate({ width: Math.max(0.5, Math.min(Number(e.target.value) || 0, labelWidthMm)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.heightMm}</label>
        <input
          type="number"
          step={0.5}
          min={0.5}
          max={labelHeightMm}
          value={element.height}
          onChange={(e) => onUpdate({ height: Math.max(0.5, Math.min(Number(e.target.value) || 0, labelHeightMm)) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
      </div>
      {!isRepeater && (
        <div>
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.rotation}</label>
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            value={String(clampRotation(element.rotation ?? 0))}
            onChange={(e) => onUpdate({ rotation: clampRotation(Number(e.target.value) || 0) })}
            className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
          />
        </div>
      )}
      {!isGroup && !isRepeater && (
        <div>
          <label className="text-slate-500">Warstwa (z-index)</label>
          <input
            type="number"
            value={(element as LabelElement).zIndex ?? 0}
            onChange={(e) => onUpdate({ zIndex: Number(e.target.value) || 0 })}
            className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-full"
          />
        </div>
      )}
      {isSection && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <label className="text-slate-500">Grubość obramowania (mm)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={(element as import("../../types/labelSystem").SectionElement).borderWidth ?? 0.5}
            onChange={(e) => onUpdate({ borderWidth: Math.max(0, Number(e.target.value) || 0) })}
            className="w-full rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px]"
          />
        </div>
      )}
      {!isGroup && !isRepeater && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          <label className="text-slate-500">Paleta stref (tło)</label>
          <div className="flex flex-wrap gap-1">
            {ZONE_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onUpdate({ backgroundColor: hex })}
                className="w-6 h-6 rounded border border-slate-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
          </div>
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.backgroundColor}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(element as LabelElement).backgroundColor ?? "#ffffff"}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
              className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
            />
            <input
              type="text"
              value={(element as LabelElement).backgroundColor ?? ""}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value || undefined })}
              placeholder="#ffffff"
              className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
            />
          </div>
          <label className="text-slate-500">{UI_STRINGS.labels.elementProps.textColor}</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(element as LabelElement).textColor ?? "#000000"}
              onChange={(e) => onUpdate({ textColor: e.target.value })}
              className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
            />
            <input
              type="text"
              value={(element as LabelElement).textColor ?? ""}
              onChange={(e) => onUpdate({ textColor: e.target.value || undefined })}
              placeholder="#000000"
              className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
            />
          </div>
          {isShape && (
            <>
              <label className="text-slate-500">Kolor obramowania</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(element as LabelElement).borderColor ?? "#000000"}
                  onChange={(e) => onUpdate({ borderColor: e.target.value })}
                  className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
                />
                <input
                  type="text"
                  value={(element as LabelElement).borderColor ?? ""}
                  onChange={(e) => onUpdate({ borderColor: e.target.value || undefined })}
                  placeholder="#000"
                  className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
                />
              </div>
            </>
          )}
        </div>
      )}
      {isGroup && (
        <p className="text-[10px] text-slate-500">Grupa: {(element as GroupElement).elements.length} elementów. Przesuń grupę, aby przenieść wszystkie.</p>
      )}
      {isRepeater && (
        <div className="space-y-1">
          <label className="text-slate-500">Dataset (np. levels, locations)</label>
          <input
            type="text"
            value={(element as RepeaterElement).dataset}
            onChange={(e) => onUpdate({ dataset: e.target.value })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
            placeholder="locations"
          />
          <label className="text-slate-500">Kierunek</label>
          <select
            value={(element as RepeaterElement).direction}
            onChange={(e) => onUpdate({ direction: e.target.value as "horizontal" | "vertical" })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          >
            <option value="horizontal">Poziomo</option>
            <option value="vertical">Pionowo</option>
          </select>
          <label className="text-slate-500">Szer. elementu (mm)</label>
          <input
            type="number"
            min={1}
            value={(element as RepeaterElement).itemWidth}
            onChange={(e) => onUpdate({ itemWidth: Number(e.target.value) || 10 })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          />
          <label className="text-slate-500">Wys. elementu (mm)</label>
          <input
            type="number"
            min={1}
            value={(element as RepeaterElement).itemHeight ?? (element as RepeaterElement).itemWidth}
            onChange={(e) => onUpdate({ itemHeight: Number(e.target.value) || 10 })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 px-2 py-0.5 text-[10px]"
          />
        </div>
      )}
      {isBarcode && (
        <>
          <div>
            <label className="text-slate-400">Format</label>
            <select
              value={element.format}
              onChange={(e) => onUpdate({ format: e.target.value as BarcodeFormat })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="Code128">Code128</option>
              <option value="QR">QR Code</option>
              <option value="DataMatrix">DataMatrix</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400">Powiązanie danych</label>
            <select
              value={element.dataBinding}
              onChange={(e) => onUpdate({ dataBinding: e.target.value as DynamicBinding })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              {DYNAMIC_BINDINGS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.showValue ?? false}
              onChange={(e) => onUpdate({ showValue: e.target.checked })}
            />
            Pokaż wartość
          </label>
          <div>
            <label className="text-slate-400">Pozycja tekstu</label>
            <select
              value={(element as BarcodeElement).textPosition ?? "below"}
              onChange={(e) => onUpdate({ textPosition: e.target.value as BarcodeTextPosition })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="below">Poniżej</option>
              <option value="above">Powyżej</option>
              <option value="hidden">Ukryty</option>
            </select>
          </div>
        </>
      )}
      {isDynamicText && (
        <>
          <div>
            <label className="text-slate-400">Powiązanie</label>
            <select
              value={element.binding}
              onChange={(e) => onUpdate({ binding: e.target.value as DynamicBinding })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              {DYNAMIC_BINDINGS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <label className="text-slate-400">Rozmiar czcionki</label>
            <input
              type="number"
              min={4}
              max={72}
              value={element.fontSize ?? 10}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 10 })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            />
            <label className="text-slate-400">Wyrównanie</label>
            <select
              value={element.align ?? "left"}
              onChange={(e) => onUpdate({ align: e.target.value as "left" | "center" | "right" })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="left">Lewo</option>
              <option value="center">Środek</option>
              <option value="right">Prawo</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.bold ?? false}
              onChange={(e) => onUpdate({ bold: e.target.checked })}
            />
            Pogrubienie
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.verticalText ?? false}
              onChange={(e) => onUpdate({ verticalText: e.target.checked })}
            />
            Tekst pionowy
          </label>
        </>
      )}
      {isStaticText && (
        <>
          <div>
            <label className="text-slate-400">Tekst</label>
            <input
              type="text"
              value={element.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <label className="text-slate-400">Rozmiar czcionki</label>
            <input
              type="number"
              min={4}
              max={72}
              value={element.fontSize ?? 8}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) || 8 })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            />
            <label className="text-slate-400">Wyrównanie</label>
            <select
              value={element.align ?? "left"}
              onChange={(e) => onUpdate({ align: e.target.value as "left" | "center" | "right" })}
              className="rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="left">Lewo</option>
              <option value="center">Środek</option>
              <option value="right">Prawo</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.bold ?? false}
              onChange={(e) => onUpdate({ bold: e.target.checked })}
            />
            Pogrubienie
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={element.verticalText ?? false}
              onChange={(e) => onUpdate({ verticalText: e.target.checked })}
            />
            Tekst pionowy
          </label>
        </>
      )}
      {isStatusIcon && (
        <div>
          <label className="text-slate-400">Ikona</label>
          <select
            value={element.icon}
            onChange={(e) => onUpdate({ icon: e.target.value as StatusIconType })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
          >
            <option value="none">Brak</option>
            <option value="lock">Kłódka (rezerwa)</option>
            <option value="heavy_load">Ciężar (dolna półka)</option>
            <option value="hazard">Uwaga</option>
            <option value="arrow_up">Strzałka ↑</option>
            <option value="arrow_down">Strzałka ↓</option>
            <option value="arrow_left">Strzałka ←</option>
            <option value="arrow_right">Strzałka →</option>
          </select>
          <div>
            <label className="text-slate-400">Warunek</label>
            <select
              value={element.condition ?? "always"}
              onChange={(e) => onUpdate({ condition: e.target.value as "reserve" | "bottom_level" | "always" })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5"
            >
              <option value="always">Zawsze</option>
              <option value="reserve">Tylko rezerwa</option>
              <option value="bottom_level">Tylko dolna półka</option>
            </select>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="mt-2 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 border border-red-200"
      >
        {UI_STRINGS.labels.elementProps.deleteElement}
      </button>
    </div>
  );
}

const STORAGE_KEY = "label-system-templates";

type SavedTemplateServer = {
  id: number;
  tenant_id: number;
  name: string;
  template_type?: string | null;
  template_json: string;
  created_at: string | null;
  updated_at: string | null;
};

function TemplateLibrary({
  current,
  onLoad,
  presetModalOpen,
  setPresetModalOpen,
  templateId,
}: {
  current: LabelTemplate;
  onLoad: (t: LabelTemplate) => void;
  presetModalOpen: boolean;
  setPresetModalOpen: (open: boolean) => void;
  templateId?: number;
}) {
  const [saved, setSaved] = useState<LabelTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });
  const [serverTemplates, setServerTemplates] = useState<SavedTemplateServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchServerTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SavedTemplateServer[]>("/label-templates/");
      setServerTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      setServerTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServerTemplates();
  }, [fetchServerTemplates]);

  const saveCurrent = () => {
    const next = [...saved.filter((t) => t.id !== current.id), { ...current, updatedAt: new Date().toISOString() }];
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveTemplateToServer = async () => {
    const name = (current.name || "Bez nazwy").trim();
    setSaving(true);
    try {
      await api.post("/label-templates/", {
        name,
        template_json: JSON.stringify(current),
      });
      await fetchServerTemplates();
    } catch (e) {
      console.error("Save template failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const load = (t: LabelTemplate) => {
    onLoad({ ...t, id: t.id ?? generateId(), updatedAt: new Date().toISOString() });
  };

  const loadFromServer = (row: SavedTemplateServer) => {
    try {
      const t = JSON.parse(row.template_json) as LabelTemplate;
      onLoad({
        ...t,
        id: t.id ?? generateId(),
        name: row.name,
        template_type: (row.template_type ?? t.template_type) as TemplateType | undefined,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      console.error("Invalid template_json from server");
    }
  };

  const removeFromServer = async (id: number) => {
    try {
      await api.delete(`/label-templates/${id}/`);
      await fetchServerTemplates();
    } catch (e) {
      console.error("Delete template failed:", e);
    }
  };

  const remove = (id: string) => {
    const next = saved.filter((t) => t.id !== id);
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 shadow-lg">
      <h3 className="text-xs font-bold text-slate-600 mb-2">{UI_STRINGS.labels.designer.templateLibrary}</h3>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={saveCurrent}
          className="w-full px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
        >
          {UI_STRINGS.labels.designer.saveCurrent}
        </button>
        <button
          type="button"
          onClick={saveTemplateToServer}
          disabled={saving}
          className="w-full px-2 py-1 rounded-lg text-[10px] bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-60"
        >
          {saving ? "Zapisywanie…" : UI_STRINGS.labels.designer.saveTemplate}
        </button>
      </div>
      {/* Server templates — Wybierz zapisany szablon */}
      {loading ? (
        <p className="text-[10px] text-slate-500 mt-1">Ładowanie…</p>
      ) : serverTemplates.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] text-slate-600 font-semibold mb-0.5">{UI_STRINGS.labels.designer.loadSavedTemplate}</p>
          <ul className="space-y-0.5 max-h-24 overflow-y-auto rounded-lg border border-slate-100 bg-white shadow-sm py-1">
            {serverTemplates.map((row) => (
              <li key={row.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => loadFromServer(row)}
                  className="flex-1 text-left text-[10px] text-slate-700 truncate hover:underline rounded"
                >
                  {row.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeFromServer(row.id)}
                  className="text-slate-500 hover:text-red-400 text-[10px] shrink-0"
                  title={UI_STRINGS.labels.designer.removeFromLibrary}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Local templates */}
      <div className="mt-2">
        <p className="text-[10px] text-slate-500 mb-0.5">Lokalne</p>
      <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
        {saved.map((t) => (
          <li key={t.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => load(t)}
              className="flex-1 text-left text-[10px] text-slate-700 truncate hover:underline"
            >
              {t.name}
            </button>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-slate-500 hover:text-red-400 text-[10px]"
              title={UI_STRINGS.labels.designer.removeFromLibrary}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      </div>

      {/* Preset selection modal */}
      {presetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPresetModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Create from preset</h2>
              <p className="text-sm text-slate-500 mt-0.5">Choose a warehouse label layout to start from.</p>
            </div>
            <ul className="p-2 overflow-y-auto flex-1">
              {PRESET_TYPES.map((type) => (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = generatePreset(type as PresetType);
                      if (templateId != null) onLoad({ ...next, id: String(templateId), name: current.name || next.name });
                      else onLoad(next);
                      setPresetModalOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200"
                  >
                    {PRESET_LABELS[type as PresetType]}
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
