import { useState, useCallback, useRef, useEffect, useMemo, type MouseEvent } from "react";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelElement,
  TemplateElement,
  GroupElement,
  RepeaterElement,
  BarcodeElement,
  DynamicTextElement,
  DynamicBinding,
  ImageElement,
} from "../../types/labelSystem";
import {
  LABEL_VARIABLE_CATEGORIES,
  TEMPLATE_TYPE_CATEGORIES,
} from "../../types/labelSystem";
import { filterWarehouseVariablesForGroupedLocation } from "../../labelSystem/locationGroupedVariables";
import { generateId } from "./utils/id";
import { LabelToolbar } from "./components/LabelToolbar";
import { LabelDesignerCanvasToolbar } from "./components/LabelDesignerCanvasToolbar";
import { LabelInspectorPanel } from "./components/LabelInspectorPanel";
import { VariableInspectorPanel } from "./components/VariableInspectorPanel";
import { LabelCanvas } from "./components/LabelCanvas";
import { useTemplateVariableAnalysis } from "../../labelSystem/hooks/useTemplateVariableAnalysis";
import { useTemplateValidation } from "../../labelSystem/validation/useTemplateValidation";
import { TemplateValidationPanel } from "../../labelSystem/validation/TemplateValidationPanel";
import { LabelLeftPanel } from "./components/LabelLeftPanel";
import { useLabelPreview } from "./hooks/useLabelPreview";
import {
  useLabelSelection,
  findElementById,
  findRepeaterContainingId,
  pickTopElementAtCanvasPx,
  type LabelCanvasSelection,
} from "./hooks/useLabelSelection";
import { useLabelDrag } from "./hooks/useLabelDrag";
import { useLabelResize } from "./hooks/useLabelResize";
import { importSvgTemplate } from "../../labelImporter/svgImporter";
import { importPngTemplate } from "../../labelImporter/imageImporter";
import { LayersPanel } from "../../components/label/LayersPanel";
import { UI_STRINGS } from "../../constants/uiStrings";
import { LABEL_IMAGE_TOOLBAR_PLACEHOLDER_DATA_URL } from "../../labelSystem/labelImageToolbarPlaceholder";
import { LabelDesignerPreviewModal } from "./components/LabelDesignerPreviewModal";
import { DocumentTemplateHtmlPanel } from "./components/DocumentTemplateHtmlPanel";
import { isDocumentPrintModuleType } from "./labelPrintModuleTypes";

const BASE_PX_PER_MM = 8;
const GRID_PX = 5;
const GRID_LINE_STEP_MM = 5;

const BARCODE_VARIABLE_TOKENS = new Set([
  "loc_barcode",
  "cart_barcode",
  "basket_barcode",
  "barcode_data",
  "ean",
  "product_barcode",
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

function isImageVariable(token: string): boolean {
  return tokenToBinding(token) === "image";
}

function templateSubtreeContainsId(elements: TemplateElement[], id: string): boolean {
  for (const el of elements) {
    if (el.id === id) return true;
    if (el.type === "group" && templateSubtreeContainsId((el as GroupElement).elements ?? [], id)) return true;
    if (el.type === "repeater" && templateSubtreeContainsId((el as RepeaterElement).template?.elements ?? [], id))
      return true;
  }
  return false;
}

/** Innermost repeater whose template subtree contains `id` (groups + nested repeaters). */
function findRepeaterOwningElement(elements: TemplateElement[], id: string): RepeaterElement | null {
  for (const el of elements) {
    if (el.type === "group") {
      const deeper = findRepeaterOwningElement((el as GroupElement).elements ?? [], id);
      if (deeper) return deeper;
    }
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      const tpl = rep.template?.elements ?? [];
      const deeper = findRepeaterOwningElement(tpl, id);
      if (deeper) return deeper;
      if (templateSubtreeContainsId(tpl, id)) return rep;
    }
  }
  return null;
}

/** Repeater to add into: selected repeater itself, or innermost repeater containing the selection. */
function resolveTargetRepeater(template: LabelTemplate, selectedId: string | null): RepeaterElement | null {
  if (!selectedId) return null;
  const el = findElementById(template.elements ?? [], selectedId);
  if (el?.type === "repeater") return el as RepeaterElement;
  return findRepeaterOwningElement(template.elements ?? [], selectedId);
}

function mapElementsInsertIntoRepeater(
  elements: TemplateElement[],
  repeaterId: string,
  element: LabelElement
): TemplateElement[] {
  return elements.map((el) => {
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      if (rep.id === repeaterId) {
        return {
          ...rep,
          template: {
            ...rep.template,
            elements: [...(rep.template?.elements ?? []), element],
          },
        };
      }
      return {
        ...rep,
        template: {
          ...rep.template,
          elements: mapElementsInsertIntoRepeater(rep.template?.elements ?? [], repeaterId, element),
        },
      };
    }
    if (el.type === "group") {
      const g = el as GroupElement;
      return {
        ...g,
        elements: mapElementsInsertIntoRepeater(g.elements ?? [], repeaterId, element),
      };
    }
    return el;
  });
}

function insertIntoRepeaterTemplate(
  template: LabelTemplate,
  repeaterId: string,
  element: LabelElement
): LabelTemplate {
  return {
    ...template,
    elements: mapElementsInsertIntoRepeater(template.elements ?? [], repeaterId, element),
    updatedAt: new Date().toISOString(),
  };
}

function findRepeaterByDataset(template: LabelTemplate, dataset: string): RepeaterElement | null {
  function walk(elements: TemplateElement[]): RepeaterElement | null {
    for (const el of elements) {
      if (el.type === "repeater") {
        const rep = el as RepeaterElement;
        if (rep.dataset === dataset) return rep;
      }
      if (el.type === "group") {
        const group = el as GroupElement;
        const found = walk(group.elements ?? []);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(template.elements ?? []);
}

function elementBoundsMm(el: TemplateElement): { x: number; y: number; w: number; h: number } | null {
  if (!("x" in el && "y" in el && "width" in el && "height" in el)) return null;
  return { x: el.x, y: el.y, w: el.width, h: el.height };
}

function shiftTopLevelIntoSlot(el: TemplateElement, dx: number, dy: number): TemplateElement {
  if (el.type === "group") {
    const g = el as GroupElement;
    return { ...g, x: g.x - dx, y: g.y - dy };
  }
  if (el.type === "repeater") {
    const r = el as RepeaterElement;
    return { ...r, x: r.x - dx, y: r.y - dy };
  }
  const le = el as LabelElement;
  return { ...le, x: le.x - dx, y: le.y - dy };
}

function wrapTopLevelSelectionIntoRepeater(
  template: LabelTemplate,
  ids: string[]
): { template: LabelTemplate; repeaterId: string } | null {
  const root = template.elements ?? [];
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return null;

  const rootById = new Map(root.map((el) => [el.id, el]));
  const picked: TemplateElement[] = [];
  for (const id of uniqueIds) {
    const el = rootById.get(id);
    if (!el || el.type === "repeater") return null;
    picked.push(el);
  }

  const removeIds = new Set(uniqueIds);
  const removedFromRoot = root.filter((el) => removeIds.has(el.id));
  if (removedFromRoot.length !== uniqueIds.length) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of picked) {
    const b = elementBoundsMm(el);
    if (!b) return null;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }

  const rawW = maxX - minX;
  const rawH = maxY - minY;
  const itemWidth = Number.isFinite(rawW) && rawW > 0 ? rawW : 0.5;
  const itemHeight = Number.isFinite(rawH) && rawH > 0 ? rawH : 0.5;

  const cloned = picked.map((el) => shiftTopLevelIntoSlot(structuredClone(el), minX, minY));

  const maxZ = root.reduce((m, e) => Math.max(m, e.zIndex ?? 0), 0);
  const repeaterId = generateId();
  const repeater: RepeaterElement = {
    id: repeaterId,
    type: "repeater",
    x: minX,
    y: minY,
    width: itemWidth,
    height: itemHeight,
    zIndex: maxZ + 1,
    dataset: "levels",
    direction: "horizontal",
    itemWidth,
    itemHeight,
    template: { elements: cloned as (LabelElement | GroupElement)[] },
  };

  const elementsWithoutPicked = root.filter((el) => !removeIds.has(el.id));

  return {
    template: {
      ...template,
      elements: [...elementsWithoutPicked, repeater],
      updatedAt: new Date().toISOString(),
    },
    repeaterId,
  };
}

export type TemplateMeta = { group_id: number | null };

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
  templateId?: number | null;
  templateMeta?: TemplateMeta;
  onTemplateMetaChange?: (meta: TemplateMeta) => void;
  onBack?: () => void;
};

type RightDesignerTab = "layers" | "properties" | "variables";

export function LabelTemplateDesigner({ template, onTemplateChange, templateId, templateMeta, onTemplateMetaChange, onBack }: Props) {
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [snapUiOn, setSnapUiOn] = useState(true);
  const [rightTab, setRightTab] = useState<RightDesignerTab>("properties");
  const [autoSliceStrip, setAutoSliceStrip] = useState(false);
  /** Location templates: palette + inspector match CSV merged label (floor_1…3, etc.). */
  const [groupedLocationVariables, setGroupedLocationVariables] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const draftingTableRef = useRef<HTMLDivElement>(null);
  const middlePanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [groups, setGroups] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    api
      .get<Array<{ id: number; name: string }>>("/label-templates/groups", {
        params: { tenant_id: 1, template_type: template.template_type ?? "location" },
      })
      .then((res) => setGroups(Array.isArray(res.data) ? res.data : []))
      .catch(() => setGroups([]));
  }, [template.template_type]);

  const isLocationTemplate = (template.template_type ?? "location") === "location";
  const isDocumentTemplate = isDocumentPrintModuleType(String(template.template_type ?? ""));
  const groupedLocationActive = isLocationTemplate && groupedLocationVariables;
  const previewBuildOptions = useMemo(
    () => ({ groupedLocationLabels: groupedLocationActive }),
    [groupedLocationActive],
  );

  const { labelSvg, hasRepeaterPreview, previewRecord } = useLabelPreview(template, previewBuildOptions);

  const {
    selection,
    setSelection,
    selectedId,
    setSelectedId,
    selected,
    overlayEntries,
    overlayElementsOrdered,
    deleteElement,
  } = useLabelSelection(template, onTemplateChange, previewRecord);

  const [layerMultiSelectIds, setLayerMultiSelectIds] = useState<string[]>([]);

  const setSelectionClearMulti = useCallback((sel: LabelCanvasSelection | null) => {
    setLayerMultiSelectIds([]);
    setSelection(sel);
  }, [setSelection]);

  const setSelectedIdClearMulti = useCallback(
    (id: string | null) => {
      setLayerMultiSelectIds([]);
      setSelectedId(id);
    },
    [setSelectedId]
  );

  const PX_PER_MM = BASE_PX_PER_MM * zoom;

  const updateElement = useCallback(
    (id: string, patch: Partial<TemplateElement>) => {
      const labelW = template.widthMm;
      const labelH = template.heightMm;

      function updateInElements(elements: TemplateElement[]): TemplateElement[] {
        return elements.map((el) => {
          if (el.id === id) {
            const merged = { ...el, ...patch } as TemplateElement;
            return (merged.type === "group" || merged.type === "repeater"
              ? clampTemplateElement(merged, labelW, labelH)
              : clampElementToLabel(merged as LabelElement, labelW, labelH)) as TemplateElement;
          }
          if (el.type === "group") {
            const g = el as GroupElement;
            return { ...g, elements: updateInElements(g.elements ?? []) } as TemplateElement;
          }
          if (el.type === "repeater") {
            const r = el as RepeaterElement;
            return {
              ...r,
              template: {
                ...r.template,
                elements: updateInElements(r.template?.elements ?? []),
              },
            } as TemplateElement;
          }
          return el;
        });
      }

      onTemplateChange({
        ...template,
        elements: updateInElements(template.elements),
        updatedAt: new Date().toISOString(),
      });
    },
    [template, onTemplateChange]
  );

  const addElement = useCallback(
    (el: LabelElement) => {
      const targetRep = resolveTargetRepeater(template, selectedId);
      if (targetRep) {
        const tpl = targetRep.template?.elements ?? [];
        const nextZ = tpl.length;
        const elWithZ = { ...el, zIndex: el.zIndex ?? nextZ } as LabelElement;
        onTemplateChange(insertIntoRepeaterTemplate(template, targetRep.id, elWithZ));
        setSelectedIdClearMulti(el.id);
        return;
      }
      const nextZ = template.elements.length;
      onTemplateChange({
        ...template,
        elements: [...template.elements, { ...el, zIndex: el.zIndex ?? nextZ }],
        updatedAt: new Date().toISOString(),
      });
      setSelectedIdClearMulti(el.id);
    },
    [template, onTemplateChange, setSelectedIdClearMulti, selectedId]
  );

  const handleLayersReorder = useCallback(
    (newOrder: TemplateElement[]) => {
      onTemplateChange({
        ...template,
        elements: newOrder,
        updatedAt: new Date().toISOString(),
      });
    },
    [template, onTemplateChange]
  );

  const handleLayerRowSelect = useCallback(
    (id: string, e?: MouseEvent) => {
      if (e && (e.ctrlKey || e.metaKey)) {
        setLayerMultiSelectIds((prev) => {
          const s = new Set(prev);
          if (s.has(id)) s.delete(id);
          else s.add(id);
          return [...s];
        });
        setSelection({ id, slotIndex: 0 });
        return;
      }
      setLayerMultiSelectIds([]);
      setSelection({ id, slotIndex: 0 });
    },
    [setSelection]
  );

  const rootElementIds = useMemo(
    () => new Set((template.elements ?? []).map((el) => el.id)),
    [template.elements]
  );

  const idsForConvertToRepeater = useMemo(() => {
    const explicit = [...new Set(layerMultiSelectIds)].filter((id) => rootElementIds.has(id));
    if (explicit.length > 0) return explicit;
    if (selectedId && rootElementIds.has(selectedId)) return [selectedId];
    return [];
  }, [layerMultiSelectIds, selectedId, rootElementIds]);

  const canWrapSelectionIntoRepeater = useMemo(() => {
    if (idsForConvertToRepeater.length < 1) return false;
    const rootById = new Map((template.elements ?? []).map((el) => [el.id, el]));
    for (const id of idsForConvertToRepeater) {
      const el = rootById.get(id);
      if (!el || el.type === "repeater") return false;
    }
    return true;
  }, [idsForConvertToRepeater, template.elements]);

  const handleWrapSelectionIntoRepeater = useCallback(() => {
    const ids = [...idsForConvertToRepeater];
    if (ids.length === 0) return;
    const result = wrapTopLevelSelectionIntoRepeater(template, ids);
    if (!result) return;
    onTemplateChange(result.template);
    setLayerMultiSelectIds([]);
    setSelection({ id: result.repeaterId, slotIndex: 0 });
  }, [idsForConvertToRepeater, template, onTemplateChange, setSelection]);

  const handleLayerSetVisible = useCallback(
    (id: string, visible: boolean) => {
      updateElement(id, { visible });
    },
    [updateElement]
  );

  const handleImportBackgroundImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        // eslint-disable-next-line no-alert
        alert("Nieprawidłowy plik obrazu (PNG lub JPEG).");
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
        alert("Nie udało się wczytać obrazu. Sprawdź format pliku.");
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
        alert("Nieprawidłowy plik SVG.");
      } finally {
        e.target.value = "";
      }
    },
    [onTemplateChange]
  );

  const { handleElementMouseDown, dragState } = useLabelDrag({
    template,
    setLabelSelection: setSelection,
    updateElement,
    PX_PER_MM,
    GRID_PX,
  });

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-resize-handle]")) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const xPx = e.clientX - rect.left;
      const yPx = e.clientY - rect.top;
      const hit = pickTopElementAtCanvasPx(overlayEntries, xPx, yPx, PX_PER_MM, { altKey: e.altKey });
      if (!hit) {
        setSelectionClearMulti(null);
        return;
      }

      const isTopRoot = rootElementIds.has(hit.id);
      if ((e.ctrlKey || e.metaKey) && isTopRoot && hit.slotIndex === 0) {
        setLayerMultiSelectIds((prev) => {
          const s = new Set(prev);
          if (s.has(hit.id)) s.delete(hit.id);
          else s.add(hit.id);
          return [...s];
        });
        setSelection({ id: hit.id, slotIndex: hit.slotIndex });
        return;
      }

      setLayerMultiSelectIds([]);
      handleElementMouseDown(e, hit.id, hit.slotIndex);
    },
    [
      overlayEntries,
      PX_PER_MM,
      handleElementMouseDown,
      setSelectionClearMulti,
      setSelection,
      rootElementIds,
    ]
  );

  const selectedDisplayEntry = useMemo(() => {
    if (!selection) return undefined;
    return overlayEntries.find(
      (e) => e.element.id === selection.id && e.slotIndex === selection.slotIndex
    );
  }, [overlayEntries, selection]);

  const repeaterItemLabel = useMemo(() => {
    if (!selection || !selectedId) return null;
    if (!findRepeaterContainingId(template.elements, selectedId)) return null;
    return `Powtórzenie — pozycja ${selection.slotIndex + 1}`;
  }, [selection, selectedId, template.elements]);

  const showRepeaterTemplateDragHint = useMemo(
    () =>
      !!dragState &&
      !!dragState.id &&
      !!findRepeaterContainingId(template.elements, dragState.id),
    [dragState, template.elements]
  );

  const { setResizeState } = useLabelResize({
    template,
    updateElement,
    PX_PER_MM,
    GRID_PX,
  });

  const variableAnalysis = useTemplateVariableAnalysis(template, previewBuildOptions);
  const validation = useTemplateValidation(template);
  const validationErrorElementIds = useMemo(
    () => validation.errors.map((e) => e.elementId).filter((id): id is string => !!id),
    [validation.errors]
  );
  const validationWarningElementIds = useMemo(
    () => validation.warnings.map((e) => e.elementId).filter((id): id is string => !!id),
    [validation.warnings]
  );

  const addElementFromVariableDrop = useCallback(
    (payload: string | { name: string; dataset?: string; createAs?: "text" | "barcode" | "qr" }, xMm: number, yMm: number) => {
      const { name: token, dataset: payloadDataset, createAs } =
        typeof payload === "string"
          ? { name: payload, dataset: undefined as string | undefined, createAs: undefined as ("text" | "barcode" | "qr" | undefined) }
          : payload;
      const binding = tokenToBinding(token);
      const defaultW = 40;
      const defaultH = 8;

      const repeater =
        resolveTargetRepeater(template, selectedId) ??
        (payloadDataset ? findRepeaterByDataset(template, payloadDataset) : null);

      const isBarcode = createAs === "barcode" || (createAs == null && isBarcodeVariable(token));
      const isQr = createAs === "qr";
      const isImage = isImageVariable(token);
      let x: number;
      let y: number;
      let width: number;
      let height: number;

      if (repeater) {
        x = 2;
        y = 2;
        const itemW = repeater.itemWidth ?? defaultW;
        width = Math.min(Math.max(0, itemW - 4), defaultW);
        if (isImage) {
          const ih = repeater.itemHeight ?? 14;
          height = Math.min(18, Math.max(8, ih - 4));
          width = Math.min(width, Math.round(height * 1.35));
        } else {
          height = isBarcode ? Math.min(12, repeater.itemHeight ?? 8) : Math.min(defaultH, repeater.itemHeight ?? 8);
        }
      } else {
        x = Math.max(0, Math.min(xMm, template.widthMm - defaultW));
        y = Math.max(0, Math.min(yMm, template.heightMm - defaultH));
        if (isImage) {
          width = Math.min(32, template.widthMm - x);
          height = Math.min(22, template.heightMm - y);
        } else {
          width = Math.min(defaultW, template.widthMm - x);
          height = isBarcode ? Math.min(12, template.heightMm - y) : Math.min(defaultH, template.heightMm - y);
        }
      }

      if (isImage) {
        const el: ImageElement = {
          id: generateId(),
          type: "image",
          x,
          y,
          width,
          height,
          src: LABEL_IMAGE_TOOLBAR_PLACEHOLDER_DATA_URL,
          srcBinding: token as DynamicBinding,
          alt: "",
        };
        if (repeater) {
          onTemplateChange(insertIntoRepeaterTemplate(template, repeater.id, el));
          setSelectedIdClearMulti(el.id);
        } else {
          addElement(el);
        }
        return;
      }

      if (isBarcode || isQr) {
        const el: BarcodeElement = {
          id: generateId(),
          type: "barcode",
          x,
          y,
          width: isQr ? Math.max(18, Math.min(30, width)) : width,
          height: isQr ? Math.max(18, Math.min(30, height)) : height,
          format: isQr ? "QR" : "Code128",
          dataBinding: binding as DynamicBinding,
          showValue: false,
          qrDataMode: isQr ? "dynamic" : undefined,
          qrMargin: isQr ? 0 : undefined,
          qrErrorCorrection: isQr ? "M" : undefined,
          qrDarkColor: isQr ? "#000000" : undefined,
          qrLightColor: isQr ? "#ffffff" : undefined,
          qrTransparentBg: isQr ? false : undefined,
          qrAutoScale: isQr ? true : undefined,
          qrKeepAspect: isQr ? true : undefined,
          qrHighQuality: isQr ? true : undefined,
          qrPreset: isQr ? "none" : undefined,
        };
        if (repeater) {
          onTemplateChange(insertIntoRepeaterTemplate(template, repeater.id, el));
          setSelectedIdClearMulti(el.id);
        } else {
          addElement(el);
        }
      } else {
        const el: DynamicTextElement = {
          id: generateId(),
          type: "dynamicText",
          x,
          y,
          width,
          height,
          binding: token as DynamicBinding,
          fontSize: 10,
          align: "left",
          verticalText: false,
        };
        if (repeater) {
          onTemplateChange(insertIntoRepeaterTemplate(template, repeater.id, el));
          setSelectedIdClearMulti(el.id);
        } else {
          addElement(el);
        }
      }
    },
    [
      addElement,
      template,
      selectedId,
      onTemplateChange,
      setSelectedIdClearMulti,
      template.widthMm,
      template.heightMm,
    ]
  );

  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/x-label-variable");
      if (!raw) return;
      let payload: string | { name: string; dataset?: string; createAs?: "text" | "barcode" | "qr" };
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && typeof (parsed as { name?: string }).name === "string") {
          payload = {
            name: (parsed as { name: string }).name,
            dataset: (parsed as { dataset?: string }).dataset,
            createAs: (parsed as { createAs?: "text" | "barcode" | "qr" }).createAs,
          };
        } else {
          payload = raw;
        }
      } catch {
        payload = raw;
      }
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x_px = snapToGridPx(e.clientX - rect.left);
      const y_px = snapToGridPx(e.clientY - rect.top);
      addElementFromVariableDrop(payload, x_px / PX_PER_MM, y_px / PX_PER_MM);
    },
    [addElementFromVariableDrop, PX_PER_MM]
  );

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-label-variable")) e.preventDefault();
  }, []);

  const handleSave = useCallback(async () => {
    const name = (template.name || "Bez nazwy").trim();
    const templateType = template.template_type ?? "location";
    const widthMm = Math.min(2000, Math.max(1, Number(template.widthMm) || 50));
    const heightMm = Math.min(2000, Math.max(1, Number(template.heightMm) || 30));

    const layoutForStorage: Record<string, unknown> = {
      widthMm,
      heightMm,
      width: widthMm,
      height: heightMm,
      dpi: template.dpi ?? 300,
      elements: Array.isArray(template.elements) ? template.elements : [],
      template_type: templateType,
      name,
      updatedAt: new Date().toISOString(),
    };
    if (template.conditionalFormatting && template.conditionalFormatting.length > 0) {
      layoutForStorage.conditionalFormatting = template.conditionalFormatting;
    }

    const template_json = JSON.stringify(layoutForStorage);

    const payload: Record<string, string | number | null> = {
      name,
      template_type: templateType,
      template_json,
    };
    const gid = templateMeta?.group_id;
    const isUpdate = templateId != null && !Number.isNaN(templateId);
    if (isUpdate) {
      payload.group_id = gid != null && Number.isFinite(gid) ? gid : null;
    } else if (gid != null && Number.isFinite(gid)) {
      payload.group_id = gid;
    }

    console.log("SENDING TEMPLATE", payload);

    setSaving(true);
    try {
      if (isUpdate) {
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
  }, [template, templateId, templateMeta?.group_id, onBack]);

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
  const variableCategories = useMemo(() => {
    const cats = LABEL_VARIABLE_CATEGORIES.filter((c) => variableCategoryIds.includes(c.id));
    if (!groupedLocationActive) return cats;
    return cats.map((c) =>
      c.id === "warehouse"
        ? { ...c, items: filterWarehouseVariablesForGroupedLocation(c.items) }
        : c,
    );
  }, [variableCategoryIds, groupedLocationActive]);

  const fitCanvasToScrollArea = useCallback(() => {
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

  useEffect(() => {
    fitCanvasToScrollArea();
  }, [fitCanvasToScrollArea]);

  const scrollToCanvas = useCallback(() => {
    draftingTableRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleDuplicateSelection = useCallback(() => {
    if (!selectedId || !rootElementIds.has(selectedId)) return;
    const el = template.elements.find((e) => e.id === selectedId);
    if (!el || el.type === "repeater" || el.type === "group") return;
    const clone = JSON.parse(JSON.stringify(el)) as LabelElement;
    clone.id = generateId();
    const w = "width" in clone ? Math.max(0.5, clone.width) : 10;
    const h = "height" in clone ? Math.max(0.5, clone.height) : 10;
    clone.x = Math.min(Math.max(0, template.widthMm - w), (clone.x ?? 0) + 2);
    clone.y = Math.min(Math.max(0, template.heightMm - h), (clone.y ?? 0) + 2);
    const idx = template.elements.findIndex((e) => e.id === selectedId);
    const newEls = [...template.elements];
    newEls.splice(idx + 1, 0, clone as TemplateElement);
    onTemplateChange({
      ...template,
      elements: newEls,
      updatedAt: new Date().toISOString(),
    });
    setSelectedIdClearMulti(clone.id);
  }, [template, selectedId, rootElementIds, onTemplateChange, setSelectedIdClearMulti]);

  const duplicateDisabled =
    !selectedId ||
    !rootElementIds.has(selectedId) ||
    selected?.type === "group" ||
    selected?.type === "repeater";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100/80">
      <LabelToolbar
        template={template}
        onTemplateChange={onTemplateChange}
        saving={saving}
        handleSave={handleSave}
        onBack={onBack}
        setPresetModalOpen={setPresetModalOpen}
        saveDisabled={!validation.valid}
        templateMeta={templateMeta}
        onTemplateMetaChange={onTemplateMetaChange}
        groups={groups}
        autoSliceStrip={autoSliceStrip}
        setAutoSliceStrip={setAutoSliceStrip}
        groupedLocationVariables={groupedLocationVariables}
        setGroupedLocationVariables={setGroupedLocationVariables}
        isLocationTemplate={isLocationTemplate}
        handleImportSvgFileChange={handleImportSvgFileChange}
        handleImportBackgroundImageChange={handleImportBackgroundImageChange}
        onOpenPreview={() => setPreviewModalOpen(true)}
      />

      {isDocumentTemplate ? (
        <DocumentTemplateHtmlPanel template={template} onTemplateChange={onTemplateChange} />
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LabelLeftPanel
          template={template}
          addElement={addElement}
          onTemplateChange={onTemplateChange}
          setSelectedId={setSelectedIdClearMulti}
          templateId={templateId}
          presetModalOpen={presetModalOpen}
          setPresetModalOpen={setPresetModalOpen}
        />

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <LabelDesignerCanvasToolbar
            zoom={zoom}
            onZoomIn={() => setZoom((z) => Math.min(3, Math.max(0.08, z * 1.15)))}
            onZoomOut={() => setZoom((z) => Math.min(3, Math.max(0.08, z / 1.15)))}
            onFitView={fitCanvasToScrollArea}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid((g) => !g)}
            snapUiOn={snapUiOn}
            onToggleSnapUi={() => setSnapUiOn((s) => !s)}
            onDuplicate={handleDuplicateSelection}
            duplicateDisabled={duplicateDisabled}
            onScrollToCanvas={scrollToCanvas}
          />
          {showRepeaterTemplateDragHint && (
            <div
              className="pointer-events-none absolute bottom-6 left-1/2 z-30 max-w-sm -translate-x-1/2 rounded-lg bg-slate-900/92 px-3 py-2 text-center text-[11px] font-medium text-white shadow-lg"
              role="status"
            >
              Edycja szablonu powtórzenia — zmiany widać na wszystkich powtórzonych elementach
            </div>
          )}
          <LabelCanvas
            template={template}
            overlayElementsOrdered={overlayElementsOrdered}
            selected={selected}
            selection={selection}
            selectedId={selectedId}
            multiSelectedIds={layerMultiSelectIds}
            allowResizeHandles={layerMultiSelectIds.length <= 1}
            selectedDisplayX={selectedDisplayEntry?.displayX}
            selectedDisplayY={selectedDisplayEntry?.displayY}
            repeaterItemLabel={repeaterItemLabel}
            setResizeState={setResizeState}
            handleCanvasMouseDown={handleCanvasMouseDown}
            handleCanvasDragOver={handleCanvasDragOver}
            handleCanvasDrop={handleCanvasDrop}
            labelSvg={labelSvg}
            hasRepeaterPreview={hasRepeaterPreview}
            validationErrorElementIds={validationErrorElementIds}
            validationWarningElementIds={validationWarningElementIds}
            PX_PER_MM={PX_PER_MM}
            GRID_LINE_STEP_MM={GRID_LINE_STEP_MM}
            canvasRef={canvasRef}
            draftingTableRef={draftingTableRef}
            isMiddlePanning={isMiddlePanning}
            onMiddlePanStart={onMiddlePanStart}
            showGrid={showGrid}
          />
        </div>

        <aside className="flex w-[min(100%,18.5rem)] shrink-0 flex-col border-l border-slate-200/90 bg-white shadow-[inset_1px_0_0_rgba(148,163,184,0.12)]">
          <div className="flex shrink-0 border-b border-slate-200/90 bg-slate-50/70 p-1">
            {(
              [
                { id: "layers" as const, label: "Warstwy" },
                { id: "properties" as const, label: "Właściwości" },
                { id: "variables" as const, label: "Zmienne" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setRightTab(t.id)}
                className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all ${
                  rightTab === t.id
                    ? "bg-white text-cyan-800 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
            {rightTab === "layers" && (
              <>
                <LayersPanel
                  elements={template.elements}
                  selection={selection}
                  multiSelectIds={layerMultiSelectIds}
                  onSelect={handleLayerRowSelect}
                  onReorder={handleLayersReorder}
                  onSetVisible={handleLayerSetVisible}
                />
                <button
                  type="button"
                  disabled={!canWrapSelectionIntoRepeater}
                  title={
                    canWrapSelectionIntoRepeater
                      ? UI_STRINGS.labels.panel.convertToRepeater
                      : UI_STRINGS.labels.panel.convertToRepeaterHint
                  }
                  onClick={handleWrapSelectionIntoRepeater}
                  className="w-full shrink-0 rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold text-slate-800 shadow-sm hover:border-cyan-200 hover:to-cyan-50/40 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {UI_STRINGS.labels.panel.convertToRepeater}
                </button>
              </>
            )}
            {rightTab === "properties" && (
              <>
                <TemplateValidationPanel
                  result={validation}
                  onSelectElement={(id) => {
                    setLayerMultiSelectIds([]);
                    setSelection({ id, slotIndex: 0 });
                  }}
                />
                <VariableInspectorPanel
                  analysis={variableAnalysis}
                  selected={selected}
                  groupedLocationInspector={groupedLocationActive}
                  previewRecord={previewRecord}
                />
                <LabelInspectorPanel
                  mode="properties"
                  template={template}
                  selected={selected}
                  updateElement={updateElement}
                  deleteElement={deleteElement}
                  collapsedCategories={collapsedCategories}
                  setCollapsedCategories={setCollapsedCategories}
                  variableCategories={variableCategories}
                  groupedLocationPalette={groupedLocationActive}
                  siblingElementsForLayer={
                    selected?.id
                      ? findRepeaterContainingId(template.elements, selected.id)?.template?.elements
                      : undefined
                  }
                  wrapInAside={false}
                  conditionFieldRecord={previewRecord}
                  templateType={template.template_type ?? "location"}
                />
              </>
            )}
            {rightTab === "variables" && (
              <LabelInspectorPanel
                mode="variables"
                template={template}
                selected={selected}
                updateElement={updateElement}
                deleteElement={deleteElement}
                collapsedCategories={collapsedCategories}
                setCollapsedCategories={setCollapsedCategories}
                variableCategories={variableCategories}
                groupedLocationPalette={groupedLocationActive}
                siblingElementsForLayer={
                  selected?.id
                    ? findRepeaterContainingId(template.elements, selected.id)?.template?.elements
                    : undefined
                }
                wrapInAside={false}
                conditionFieldRecord={previewRecord}
                templateType={template.template_type ?? "location"}
              />
            )}
          </div>
        </aside>
      </div>
      <LabelDesignerPreviewModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        labelSvg={labelSvg}
        widthMm={template.widthMm}
        heightMm={template.heightMm}
        dpi={template.dpi ?? 300}
        templateName={(template.name || "Bez nazwy").trim()}
      />
    </div>
  );
}
