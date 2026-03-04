import { useState, useCallback, useRef, useEffect } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelElement,
  BarcodeElement,
  DynamicTextElement,
  StaticTextElement,
  BarcodeFormat,
  DynamicBinding,
  StatusIconType,
  ConditionalFormatRule,
} from "../../types/labelSystem";
import { DYNAMIC_BINDINGS, LABEL_VARIABLE_CATEGORIES } from "../../types/labelSystem";
import { UI_STRINGS } from "../../constants/uiStrings";

const MM_TO_PX = (mm: number, dpi: number) => (mm * dpi) / 25.4;

function generateId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
};

export function LabelTemplateDesigner({ template, onTemplateChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const draftingTableRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);

  const updateElement = useCallback(
    (id: string, patch: Partial<LabelElement>) => {
      onTemplateChange({
        ...template,
        elements: template.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)) as LabelTemplate["elements"],
        updatedAt: new Date().toISOString(),
      });
    },
    [template, onTemplateChange]
  );

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

  const addVariableField = useCallback(
    (token: string) => {
      const defaultWidth = 40;
      const defaultHeight = 8;
      const centerX = template.widthMm / 2;
      const centerY = template.heightMm / 2;
      const x = Math.max(0, centerX - defaultWidth / 2);
      const y = Math.max(0, centerY - defaultHeight / 2);
      const el: DynamicTextElement = {
        id: generateId(),
        type: "dynamicText",
        x,
        y,
        width: Math.min(defaultWidth, template.widthMm - x),
        height: Math.min(defaultHeight, template.heightMm - y),
        binding: token as DynamicBinding,
        fontSize: 10,
        align: "center",
        verticalText: false,
      };
      addElement(el);
    },
    [addElement, template.widthMm, template.heightMm]
  );

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
  const wPx = MM_TO_PX(template.widthMm, template.dpi);
  const hPx = MM_TO_PX(template.heightMm, template.dpi);

  const previewRecord: Record<string, unknown> = {
    location_name: "A-01-02-03",
    rack_id: "A-01",
    level: 2,
    zone_name: "Magazyn",
    volume_capacity: 120,
    barcode_data: "A-01-02-03",
    storage_type: "primary",
    aisle_letter: "A",
    rack_index: 1,
    isBottomLevel: false,
    "{loc_name}": "A-01-02-03",
    "{loc_barcode}": "A-01-02-03",
    "{zone}": "Magazyn",
    "{cart_id}": "CART-001",
    "{cart_barcode}": "CART-001",
    "{load_capacity}": "300kg",
    "{prod_name}": "Karton 40x30x25",
    "{sku}": "KAR-40-01",
    "{ean}": "5901234123458",
    "{order_id}": "ORD-2026-0001",
    "{client}": "ACME Sp. z o.o.",
    "{priority}": "Normalny",
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const inInput = document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || (document.activeElement as HTMLElement).isContentEditable);
        if (inInput) return;
        if (selectedId) {
          e.preventDefault();
          deleteElement(selectedId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement]);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-element-id]")) return;
      setSelectedId(null);
    },
    []
  );

  const handleElementMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSelectedId(id);
      const el = template.elements.find((x) => x.id === id);
      if (el) setDragState({ id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y });
    },
    [template.elements]
  );

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const mmPerPx = 25.4 / template.dpi;
      const dxMm = (e.clientX - dragState.startX) * mmPerPx;
      const dyMm = (e.clientY - dragState.startY) * mmPerPx;
      updateElement(dragState.id, { x: Math.max(0, dragState.elX + dxMm), y: Math.max(0, dragState.elY + dyMm) });
    };
    const onUp = () => setDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragState, template.dpi, updateElement]);

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
    <div className="flex h-full min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* Left: Tools + Library */}
      <aside className="w-56 shrink-0 flex flex-col gap-3 p-3 bg-white rounded-2xl border border-slate-100 overflow-y-auto shadow-md"
      >
        <div>
          <label className="block text-[10px] text-slate-500 uppercase mb-1">{UI_STRINGS.labels.designer.templateName}</label>
          <input
            type="text"
            value={template.name}
            onChange={(e) => onTemplateChange({ ...template, name: e.target.value, updatedAt: new Date().toISOString() })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase mb-1">{UI_STRINGS.labels.designer.widthMm}</label>
            <input
              type="number"
              min={10}
              max={200}
              value={template.widthMm}
              onChange={(e) => onTemplateChange({ ...template, widthMm: Number(e.target.value) || 50, updatedAt: new Date().toISOString() })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase mb-1">{UI_STRINGS.labels.designer.heightMm}</label>
            <input
              type="number"
              min={10}
              max={200}
              value={template.heightMm}
              onChange={(e) => onTemplateChange({ ...template, heightMm: Number(e.target.value) || 30, updatedAt: new Date().toISOString() })}
              className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase mb-1">{UI_STRINGS.labels.designer.dpi}</label>
          <input
            type="number"
            min={72}
            max={600}
            value={template.dpi}
            onChange={(e) => onTemplateChange({ ...template, dpi: Number(e.target.value) || 300, updatedAt: new Date().toISOString() })}
            className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
          />
        </div>

        <div className="border-t border-slate-100 pt-2 mt-2">
          <h3 className="text-xs font-bold text-slate-600 mb-1">{UI_STRINGS.labels.designer.conditionalFormatting}</h3>
          <p className="text-[9px] text-slate-500 mb-1">{UI_STRINGS.labels.designer.conditionalHint}</p>
          {(template.conditionalFormatting ?? []).map((rule, i) => (
            <div key={i} className="flex items-center gap-1 mb-1 p-1 rounded bg-slate-50 border border-[#E2E8F0]">
              <select
                value={rule.when}
                onChange={(e) => {
                  const next = [...(template.conditionalFormatting ?? [])];
                  next[i] = { ...rule, when: e.target.value as ConditionalFormatRule["when"] };
                  onTemplateChange({ ...template, conditionalFormatting: next, updatedAt: new Date().toISOString() });
                }}
                className="flex-1 rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-1 py-0.5 text-[10px]"
              >
                <option value="reserve">Rezerwa</option>
                <option value="primary">Główna</option>
                <option value="bottom_level">Dolna półka</option>
                <option value="always">Zawsze</option>
              </select>
              <input
                type="color"
                value={rule.backgroundColor ?? "#ffffff"}
                onChange={(e) => {
                  const next = [...(template.conditionalFormatting ?? [])];
                  next[i] = { ...rule, backgroundColor: e.target.value };
                  onTemplateChange({ ...template, conditionalFormatting: next, updatedAt: new Date().toISOString() });
                }}
                className="w-6 h-5 rounded cursor-pointer"
                title="Kolor tła"
              />
              <input
                type="color"
                value={rule.textColor ?? "#000000"}
                onChange={(e) => {
                  const next = [...(template.conditionalFormatting ?? [])];
                  next[i] = { ...rule, textColor: e.target.value };
                  onTemplateChange({ ...template, conditionalFormatting: next, updatedAt: new Date().toISOString() });
                }}
                className="w-6 h-5 rounded cursor-pointer"
                title="Kolor tekstu"
              />
              <button
                type="button"
                onClick={() => onTemplateChange({ ...template, conditionalFormatting: (template.conditionalFormatting ?? []).filter((_, j) => j !== i), updatedAt: new Date().toISOString() })}
                className="text-red-600 hover:text-red-700 text-[10px]"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onTemplateChange({ ...template, conditionalFormatting: [...(template.conditionalFormatting ?? []), { when: "reserve", backgroundColor: "#fee2e2", textColor: "#b91c1c" }], updatedAt: new Date().toISOString() })}
            className="w-full px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
          >
            {UI_STRINGS.labels.designer.addRule}
          </button>
        </div>

        <h3 className="text-xs font-bold text-slate-600 mt-2">{UI_STRINGS.labels.designer.addElement}</h3>
        <div className="flex flex-wrap gap-1">
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
                showValue: true,
              };
              addElement(el);
            }}
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
          >
            {UI_STRINGS.labels.designer.barcode}
          </button>
          <button
            type="button"
            onClick={() => {
              const el: DynamicTextElement = {
                id: generateId(),
                type: "dynamicText",
                x: 2,
                y: 14,
                width: 46,
                height: 4,
                binding: "location_name",
                fontSize: 10,
                align: "left",
              };
              addElement(el);
            }}
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
          >
            {UI_STRINGS.labels.designer.dynamicText}
          </button>
          <button
            type="button"
            onClick={() => {
              const el: StaticTextElement = {
                id: generateId(),
                type: "staticText",
                x: 2,
                y: 18,
                width: 46,
                height: 4,
                text: "Tekst",
                fontSize: 8,
                align: "left",
              };
              addElement(el);
            }}
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
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
                y: 22,
                width: 46,
                height: 0,
                strokeWidth: 0.5,
              })
            }
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
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
                y: 23,
                width: 46,
                height: 4,
                strokeWidth: 0.3,
              })
            }
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
          >
            {UI_STRINGS.labels.designer.rect}
          </button>
          <button
            type="button"
            onClick={() =>
              addElement({
                id: generateId(),
                type: "statusIcon",
                x: 42,
                y: 2,
                width: 5,
                height: 5,
                icon: "lock",
                condition: "reserve",
              })
            }
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
          >
            {UI_STRINGS.labels.designer.statusIcon}
          </button>
          <button
            type="button"
            onClick={() =>
              addElement({
                id: generateId(),
                type: "statusIcon",
                x: 42,
                y: 8,
                width: 5,
                height: 5,
                icon: "arrow_up",
                condition: "always",
              })
            }
            className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-[#1E293B] hover:bg-slate-200 border border-slate-100"
          >
            {UI_STRINGS.labels.designer.iconLibrary}
          </button>
        </div>

        <TemplateLibrary current={template} onLoad={onTemplateChange} />
      </aside>

      {/* Center + Right: canvas scroll + sticky sidebar in one flex container */}
      <div className="flex flex-1 min-h-0 overflow-hidden min-w-0">
      {/* Canvas */}
      <div
        ref={draftingTableRef}
        className="flex-1 min-h-0 min-w-0 overflow-auto p-6 flex items-start justify-center bg-[#F8FAFC]"
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
          ref={canvasRef}
          className="bg-white rounded-2xl border border-slate-100 shadow-xl"
          style={{
            width: wPx,
            height: hPx,
            minWidth: wPx,
            minHeight: hPx,
          }}
          onMouseDown={handleCanvasMouseDown}
        >
          {template.elements.map((el) => (
            <DesignerElement
              key={el.id}
              element={el}
              dpi={template.dpi}
              selected={selectedId === el.id}
              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
              previewRecord={previewRecord}
            />
          ))}
        </div>
      </div>

      {/* Right: Variables + Properties — sticky, stays pinned when canvas scrolls */}
      <aside
        className="w-72 shrink-0 flex flex-col gap-3 p-3 bg-white rounded-2xl border border-slate-100 overflow-y-auto shadow-lg sticky self-start h-fit max-h-full"
        style={{ top: 20 }}
      >
        <div>
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-600 mb-2">{UI_STRINGS.labels.panel.variables}</h3>
          <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
            {UI_STRINGS.labels.panel.variablesHint}
          </p>
          <div className="space-y-2">
            {LABEL_VARIABLE_CATEGORIES.map((cat) => {
              const isCollapsed = collapsedCategories[cat.id];
              const categoryLabel = UI_STRINGS.labels.categories[cat.id];
              return (
                <div key={cat.id} className="rounded-xl border border-slate-100 bg-slate-50/80 shadow-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCollapsedCategories((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                    className="w-full flex items-center justify-between px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-100/80 transition-colors"
                  >
                    <span>{categoryLabel}</span>
                    <span className="text-slate-400">{isCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="px-2 pb-2 flex flex-col gap-1">
                      {cat.items.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => addVariableField(v.token)}
                          className="px-3 py-2 rounded-lg bg-white border border-slate-100 text-[11px] font-mono text-slate-700 hover:bg-slate-100 hover:border-cyan-200 hover:shadow-sm transition-all text-left"
                          title={`Wstaw ${v.token}`}
                        >
                          {v.label}
                        </button>
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
              <h3 className="text-xs font-bold text-slate-600 mb-2">{UI_STRINGS.labels.panel.elementProperties}</h3>
              <ElementProperties
                element={selected}
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

function DesignerElement({
  element,
  dpi,
  selected,
  onMouseDown,
  previewRecord,
}: {
  element: LabelElement;
  dpi: number;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  previewRecord: Record<string, unknown>;
}) {
  const scale = dpi / 25.4;
  const left = element.x * scale;
  const top = element.y * scale;
  const width = Math.max(1, element.width * scale);
  const height = Math.max(1, element.height * scale);

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    border: selected ? "2px solid #0891b2" : "1px dashed rgba(8,145,178,0.4)",
    boxSizing: "border-box",
    cursor: "move",
  };

  const content = renderElementContent(element, previewRecord, scale);

  const bg = element.backgroundColor ?? "transparent";
  const fg = element.textColor ?? "#000";

  return (
    <div data-element-id={element.id} style={{ ...style, backgroundColor: bg }} onMouseDown={onMouseDown} className="overflow-hidden">
      <div style={{ color: fg, width: "100%", height: "100%" }}>
        {content}
      </div>
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
      return <BarcodePreview format={el.format} value={val} showValue={el.showValue} scale={scale} textColor={fg} />;
    }
    case "dynamicText": {
      const val = String(record[el.binding] ?? "");
      const display = val || `{${el.binding}}`;
      const isVertical = el.verticalText === true;
      return (
        <div
          className="w-full h-full flex overflow-hidden"
          style={{
            fontSize: (el.fontSize ?? 10) * scale * 0.35,
            fontFamily: el.fontFamily ?? "sans-serif",
            fontWeight: el.bold ? "bold" : "normal",
            color: fg,
            ...(isVertical
              ? { flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 0, lineHeight: 1 }
              : { flexDirection: "row", alignItems: "center", textAlign: el.align ?? "left" }),
          }}
        >
          {isVertical ? display.split("").map((c, i) => <span key={i}>{c}</span>) : display}
        </div>
      );
    }
    case "staticText":
      return (
        <div
          className="w-full h-full flex overflow-hidden"
          style={{
            fontSize: (el.fontSize ?? 8) * scale * 0.35,
            fontFamily: el.fontFamily ?? "sans-serif",
            fontWeight: el.bold ? "bold" : "normal",
            color: fg,
            ...(el.verticalText
              ? { flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 0, lineHeight: 1 }
              : { flexDirection: "row", alignItems: "center", textAlign: el.align ?? "left" }),
          }}
        >
          {el.verticalText ? el.text.split("").map((c, i) => <span key={i}>{c}</span>) : el.text}
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
            fill={bg ?? el.fill ?? "none"}
            stroke={fg}
            strokeWidth={(el.strokeWidth ?? 0.3) * scale}
          />
        </svg>
      );
    case "statusIcon":
      return <StatusIconPreview icon={el.icon} size={Math.min(el.width, el.height) * scale} color={fg} />;
    case "image":
      return el.src ? <img src={el.src} alt={el.alt ?? ""} className="w-full h-full object-contain" /> : <div className="w-full h-full bg-slate-300" />;
    default:
      return null;
  }
}

function BarcodePreview({
  format,
  value,
  showValue,
  textColor,
}: { format: BarcodeFormat; value: string; showValue?: boolean; scale: number; textColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    if (format === "QR" || format === "DataMatrix") {
      QRCode.toDataURL(value || "SAMPLE", { width: 80, margin: 0 }).then(setQrUrl).catch(() => setQrUrl(""));
    }
  }, [format, value]);

  useEffect(() => {
    if (format === "Code128" && value && canvasRef.current) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: "CODE128",
          width: 1,
          height: 1,
          displayValue: !!showValue,
        });
      } catch {}
    }
  }, [format, value, showValue]);

  if (format === "QR" || format === "DataMatrix") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white">
        {qrUrl ? <img src={qrUrl} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[8px] text-slate-400">QR</span>}
      </div>
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white">
      <canvas ref={canvasRef} className="max-w-full max-h-[80%]" style={{ imageRendering: "pixelated" }} />
      {showValue && <span className="text-[8px] mt-0.5" style={{ color: textColor ?? "#000" }}>{value}</span>}
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

function ElementProperties({
  element,
  onUpdate,
  onDelete,
}: {
  element: LabelElement;
  onUpdate: (patch: Partial<LabelElement>) => void;
  onDelete: () => void;
}) {
  const isBarcode = element.type === "barcode";
  const isDynamicText = element.type === "dynamicText";
  const isStaticText = element.type === "staticText";
  const isStatusIcon = element.type === "statusIcon";

  return (
    <div className="space-y-2 text-xs text-[#1E293B]">
      <div className="grid grid-cols-2 gap-1">
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.xMm}</label>
        <input
          type="number"
          step={0.5}
          value={element.x}
          onChange={(e) => onUpdate({ x: Number(e.target.value) || 0 })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.yMm}</label>
        <input
          type="number"
          step={0.5}
          value={element.y}
          onChange={(e) => onUpdate({ y: Number(e.target.value) || 0 })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.widthMm}</label>
        <input
          type="number"
          step={0.5}
          value={element.width}
          onChange={(e) => onUpdate({ width: Math.max(0.5, Number(e.target.value) || 0) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.heightMm}</label>
        <input
          type="number"
          step={0.5}
          value={element.height}
          onChange={(e) => onUpdate({ height: Math.max(0.5, Number(e.target.value) || 0) })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-20"
        />
      </div>
      <div>
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.rotation}</label>
        <input
          type="number"
          value={element.rotation ?? 0}
          onChange={(e) => onUpdate({ rotation: Number(e.target.value) || 0 })}
          className="rounded border border-slate-100 bg-slate-50 text-[#1E293B] px-2 py-0.5 w-full"
        />
      </div>
      <div className="border-t border-slate-100 pt-2 space-y-1">
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.backgroundColor}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={element.backgroundColor ?? "#ffffff"}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
          />
          <input
            type="text"
            value={element.backgroundColor ?? ""}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value || undefined })}
            placeholder="#ffffff"
            className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
          />
        </div>
        <label className="text-slate-500">{UI_STRINGS.labels.elementProps.textColor}</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={element.textColor ?? "#000000"}
            onChange={(e) => onUpdate({ textColor: e.target.value })}
            className="w-8 h-6 rounded border border-[#E2E8F0] cursor-pointer"
          />
          <input
            type="text"
            value={element.textColor ?? ""}
            onChange={(e) => onUpdate({ textColor: e.target.value || undefined })}
            placeholder="#000000"
            className="flex-1 rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-0.5 text-[10px] font-mono"
          />
        </div>
      </div>
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
              checked={element.showValue ?? true}
              onChange={(e) => onUpdate({ showValue: e.target.checked })}
            />
            Pokaż wartość
          </label>
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
  template_json: string;
  created_at: string | null;
  updated_at: string | null;
};

function TemplateLibrary({
  current,
  onLoad,
}: {
  current: LabelTemplate;
  onLoad: (t: LabelTemplate) => void;
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
      onLoad({ ...t, id: t.id ?? generateId(), name: row.name, updatedAt: new Date().toISOString() });
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
    </div>
  );
}
