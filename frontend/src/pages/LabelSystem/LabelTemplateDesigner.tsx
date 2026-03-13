import { useState, useCallback, useRef, useEffect } from "react";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelElement,
  TemplateElement,
  BarcodeElement,
  DynamicTextElement,
  DynamicBinding,
} from "../../types/labelSystem";
import {
  LABEL_VARIABLE_CATEGORIES,
  TEMPLATE_TYPE_CATEGORIES,
} from "../../types/labelSystem";
import { generateId } from "./utils/id";
import { LabelToolbar } from "./components/LabelToolbar";
import { LabelInspectorPanel } from "./components/LabelInspectorPanel";
import { LabelCanvas } from "./components/LabelCanvas";
import { LabelLeftPanel } from "./components/LabelLeftPanel";
import { useLabelPreview } from "./hooks/useLabelPreview";
import { useLabelSelection } from "./hooks/useLabelSelection";
import { useLabelDrag } from "./hooks/useLabelDrag";
import { useLabelResize } from "./hooks/useLabelResize";
import { importSvgTemplate } from "../../labelImporter/svgImporter";
import { importPngTemplate } from "../../labelImporter/imageImporter";

const BASE_PX_PER_MM = 8;
const GRID_PX = 5;
const GRID_LINE_STEP_MM = 5;

const BARCODE_VARIABLE_TOKENS = new Set([
  "loc_barcode",
  "cart_barcode",
  "basket_barcode",
  "barcode_data",
  "ean",
]);

function snapToGridPx(px: number): number {
  return Math.round(px / GRID_PX) * GRID_PX;
}

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
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [autoSliceStrip, setAutoSliceStrip] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const draftingTableRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);

  const { labelSvg } = useLabelPreview(template);

  const {
    selectedId,
    setSelectedId,
    selected,
    overlayElementsOrdered,
    handleCanvasMouseDown,
    deleteElement,
  } = useLabelSelection(template, onTemplateChange);

  const PX_PER_MM = BASE_PX_PER_MM * zoom;

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

  const addElement = useCallback(
    (el: LabelElement) => {
      onTemplateChange({
        ...template,
        elements: [...template.elements, el],
        updatedAt: new Date().toISOString(),
      });
      setSelectedId(el.id);
    },
    [template, onTemplateChange, setSelectedId]
  );

  const handleImportBackgroundImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        // eslint-disable-next-line no-alert
        alert("Invalid image file");
        e.target.value = "";
        return;
      }

      try {
        const importedTemplate = await importPngTemplate(file, {
          autoSlice: autoSliceStrip,
        });
        onTemplateChange(importedTemplate);
      } catch (err) {
        // eslint-disable-next-line no-alert
        alert("Invalid image file");
      }

      e.target.value = "";
    },
    [onTemplateChange, autoSliceStrip]
  );

  const handleImportSvgFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const svgText = await file.text();
        const importedTemplate = importSvgTemplate(svgText);
        onTemplateChange(importedTemplate);
      } catch (err) {
        console.error("SVG import failed:", err);
        // eslint-disable-next-line no-alert
        alert("Invalid SVG template");
      } finally {
        e.target.value = "";
      }
    },
    [onTemplateChange]
  );

  const { handleElementMouseDown } = useLabelDrag({
    template,
    setSelectedId,
    updateElement,
    PX_PER_MM,
    GRID_PX,
  });

  const { setResizeState } = useLabelResize({
    template,
    updateElement,
    PX_PER_MM,
    GRID_PX,
  });

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

  const onMiddlePanStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1) return;
    const el = draftingTableRef.current;
    if (!el) return;
    e.preventDefault();
    middlePanRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setIsMiddlePanning(true);
  }, []);

  const variableCategoryIds = TEMPLATE_TYPE_CATEGORIES[template.template_type ?? "location"];
  const variableCategories = LABEL_VARIABLE_CATEGORIES.filter((c) => variableCategoryIds.includes(c.id));

  useEffect(() => {
    const container = draftingTableRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth || 1;
    const containerHeight = container.clientHeight || 1;
    const desiredWidthPx = template.widthMm * BASE_PX_PER_MM;
    const desiredHeightPx = template.heightMm * BASE_PX_PER_MM;
    if (desiredWidthPx <= 0 || desiredHeightPx <= 0) return;
    const scaleX = containerWidth / desiredWidthPx;
    const scaleY = containerHeight / desiredHeightPx;
    const nextZoom = Math.min(scaleX, scaleY);
    setZoom(nextZoom);
    container.scrollLeft = 0;
    container.scrollTop = 0;
  }, [template.widthMm, template.heightMm]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#F8FAFC]">
      <div className="shrink-0 flex flex-col">
        <LabelToolbar
          template={template}
          onTemplateChange={onTemplateChange}
          saving={saving}
          handleSave={handleSave}
          onBack={onBack}
          setPresetModalOpen={setPresetModalOpen}
        />
        <div className="flex items-center gap-6 px-4 py-2 bg-white border-b border-[#E2E8F0] border-t-0">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase">Import SVG</label>
            <input
              type="file"
              accept=".svg"
              onChange={handleImportSvgFileChange}
              className="text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase">Import background image</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={handleImportBackgroundImageChange}
              className="text-xs"
            />
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={autoSliceStrip}
              onChange={(e) => setAutoSliceStrip(e.target.checked)}
            />
            <span>Auto slice label strip</span>
          </label>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LabelLeftPanel
          template={template}
          addElement={addElement}
          onTemplateChange={onTemplateChange}
          setSelectedId={setSelectedId}
          templateId={templateId}
          presetModalOpen={presetModalOpen}
          setPresetModalOpen={setPresetModalOpen}
        />

        <LabelCanvas
          template={template}
          overlayElementsOrdered={overlayElementsOrdered}
          selected={selected}
          selectedId={selectedId}
          handleElementMouseDown={handleElementMouseDown}
          setResizeState={setResizeState}
          handleCanvasMouseDown={handleCanvasMouseDown}
          handleCanvasDragOver={handleCanvasDragOver}
          handleCanvasDrop={handleCanvasDrop}
          labelSvg={labelSvg}
          PX_PER_MM={PX_PER_MM}
          GRID_LINE_STEP_MM={GRID_LINE_STEP_MM}
          canvasRef={canvasRef}
          draftingTableRef={draftingTableRef}
          isMiddlePanning={isMiddlePanning}
          onMiddlePanStart={onMiddlePanStart}
        />

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
