import { useState, useCallback, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelRecord,
  SelectionMode,
  RepeaterElement,
  TemplateElement,
} from "../../types/labelSystem";
import type { Printer } from "../../types/printer";
import type { PrinterProfile } from "../../types/printerProfiles";
import { applyCalibration } from "../../utils/labels/applyCalibration";
import { drawSvgVector } from "../../utils/labels/svgToPdfVector";
import { getRecordsFromLayout } from "./labelData";
import { LabelPreviewCard } from "./LabelPreviewCard";
import { renderLabel } from "../../labelRenderer";
import {
  connectQZ,
  listSystemPrinters,
  printPdf,
  isQzAvailable,
  setQzSecurity,
} from "../../printing/qzService";

const TENANT_ID = 1;

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
};

type CartListItem = { id: number; name: string; type?: string };

export function LabelPrintQueue({ template }: Props) {
  const [printMode, setPrintMode] = useState<"location" | "cart_basket" | "rack" | "rack_strip" | "pdf_import">("location");
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [cartList, setCartList] = useState<CartListItem[]>([]);
  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);
  const [generatingBasketLabels, setGeneratingBasketLabels] = useState(false);
  const [rackRack, setRackRack] = useState("A");
  const [rackLevels, setRackLevels] = useState(5);
  const [rackPositions, setRackPositions] = useState(4);
  const [rackZone, setRackZone] = useState("");
  const [rackRecords, setRackRecords] = useState<LabelRecord[]>([]);
  const [rackGenerating, setRackGenerating] = useState(false);
  const [rackPdfLoading, setRackPdfLoading] = useState(false);
  const [pdfImportBarcodes, setPdfImportBarcodes] = useState<string[]>([]);
  const [pdfImportLoading, setPdfImportLoading] = useState(false);
  const [pdfImportError, setPdfImportError] = useState<string | null>(null);
  const [pdfImportPdfLoading, setPdfImportPdfLoading] = useState(false);
  const [stripRack, setStripRack] = useState("A");
  const [stripLevel, setStripLevel] = useState(1);
  const [stripStart, setStripStart] = useState(1);
  const [stripEnd, setStripEnd] = useState(10);
  const [stripRecords, setStripRecords] = useState<LabelRecord[]>([]);
  const [stripGenerating, setStripGenerating] = useState(false);
  const [stripPdfLoading, setStripPdfLoading] = useState(false);
  const [layout, setLayout] = useState<{
    racks?: { aisle_letter?: string; rack_index?: number; bins?: { label?: string; barcode_data?: string; location_id?: string; level_index?: number; segment_index?: number; storage_type?: string; volume_dm3?: number }[] }[];
    visual_elements?: { type?: string; zoneType?: string; name?: string }[];
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("all");
  const [selectedRackIds, setSelectedRackIds] = useState<string[]>([]);
  const [manualLocationIds, setManualLocationIds] = useState<string[]>([]);
  const [manualLocationSearch, setManualLocationSearch] = useState("");
  const [thermalMode, setThermalMode] = useState(() => {
    try {
      const v = localStorage.getItem("label_print_thermal_mode");
      return v !== "false";
    } catch {
      return true;
    }
  });
  const [loading, setLoading] = useState(false);
  const [locationTemplates, setLocationTemplates] = useState<{ id: number; name: string; is_default: boolean }[]>([]);
  const [selectedLocationTemplateId, setSelectedLocationTemplateId] = useState<number | null>(null);
  const [locationPreviewTemplate, setLocationPreviewTemplate] = useState<LabelTemplate | null>(null);
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false);
  const [rackPreviewTemplate, setRackPreviewTemplate] = useState<LabelTemplate | null>(null);
  const [rackPreviewLoading, setRackPreviewLoading] = useState(false);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const [backendPdfFallbackWarning, setBackendPdfFallbackWarning] = useState(false);
  const [qzReady, setQzReady] = useState(false);
  const [qzChecking, setQzChecking] = useState(true);
  const [systemPrinters, setSystemPrinters] = useState<string[] | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/tenants/${TENANT_ID}/warehouses/`);
        const list = Array.isArray(res.data) ? res.data : [];
        setWarehouses(list);
        if (list.length > 0 && selectedWarehouseId === null) setSelectedWarehouseId(list[0].id);
      } catch {
        setWarehouses([]);
      }
    })();
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (printMode !== "cart_basket") return;
    (async () => {
      try {
        const res = await api.get<Array<{ id?: number; name?: string; is_group?: boolean; items?: CartListItem[] }>>("/carts/", { params: { tenant_id: TENANT_ID } });
        const data = Array.isArray(res.data) ? res.data : [];
        const flat: CartListItem[] = data.flatMap((g) => (Array.isArray(g.items) ? g.items : []));
        setCartList(flat);
        if (flat.length > 0 && selectedCartId === null) setSelectedCartId(flat[0].id);
      } catch {
        setCartList([]);
      }
    })();
  }, [printMode, selectedCartId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Printer[]>("/printers", { params: { tenant_id: TENANT_ID } });
        const list = Array.isArray(res.data) ? res.data : [];
        setPrinters(list);
      } catch {
        setPrinters([]);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isQzAvailable()) {
      setQzChecking(false);
      setQzReady(false);
      return;
    }
    setQzSecurity((toSign: string) =>
      api.get<{ signature: string }>("/qz/sign", { params: { request: toSign } }).then((r) => r.data.signature)
    );
    (async () => {
      try {
        await connectQZ();
        if (!cancelled) setQzReady(true);
      } catch {
        if (!cancelled) setQzReady(false);
      } finally {
        if (!cancelled) setQzChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLayout = useCallback(async () => {
    if (selectedWarehouseId == null) return;
    setLoading(true);
    try {
      const res = await api.get("/warehouse/layout", {
        params: { tenant_id: TENANT_ID, warehouse_id: selectedWarehouseId },
      });
      setLayout(res.data);
    } catch {
      setLayout(null);
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (selectedWarehouseId != null) loadLayout();
    else setLayout(null);
  }, [selectedWarehouseId, loadLayout]);

  useEffect(() => {
    if (printMode !== "location" && printMode !== "rack" && printMode !== "rack_strip" && printMode !== "pdf_import") return;
    api.get<{ id: number; name: string; is_default: boolean }[]>("/labels/templates/by-type/location/", { params: { tenant_id: TENANT_ID } })
      .then((res) => setLocationTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocationTemplates([]));
  }, [printMode]);

  const templateIdForPreview =
    selectedLocationTemplateId ??
    locationTemplates.find((t) => t.is_default)?.id ??
    locationTemplates[0]?.id ??
    null;

  const records = layout ? getRecordsFromLayout(layout, selectionMode, selectedRackIds, manualLocationIds) : [];

  /** Page records (dataset structure for repeaters) — same as PDF pipeline. Used for preview and PDF. */
  const locationPageRecords = useMemo(() => {
    if (!records.length) return [];
    const t = locationPreviewTemplate ?? template;
    return buildPageRecords(t, records);
  }, [locationPreviewTemplate, template, records]);

  useEffect(() => {
    if (printMode !== "location" || templateIdForPreview == null) {
      setLocationPreviewTemplate(null);
      return;
    }
    let cancelled = false;
    setLocationPreviewLoading(true);
    (async () => {
      try {
        const res = await api.get<{ template_json: string }>(`/label-templates/${templateIdForPreview}`, {
          params: { tenant_id: TENANT_ID },
        });
        const templateObj = JSON.parse(res.data.template_json) as LabelTemplate;
        if (!cancelled) setLocationPreviewTemplate(templateObj);
      } catch {
        if (!cancelled) setLocationPreviewTemplate(null);
      } finally {
        if (!cancelled) setLocationPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printMode, templateIdForPreview]);

  useEffect(() => {
    if (printMode !== "rack" || rackRecords.length === 0 || templateIdForPreview == null) {
      setRackPreviewTemplate(null);
      return;
    }
    let cancelled = false;
    setRackPreviewLoading(true);
    (async () => {
      try {
        const res = await api.get<{ template_json: string }>(`/label-templates/${templateIdForPreview}`, {
          params: { tenant_id: TENANT_ID },
        });
        const templateObj = JSON.parse(res.data.template_json) as LabelTemplate;
        if (!cancelled) setRackPreviewTemplate(templateObj);
      } catch {
        if (!cancelled) setRackPreviewTemplate(null);
      } finally {
        if (!cancelled) setRackPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printMode, templateIdForPreview, rackRecords]);

  const handleGeneratePdf = useCallback(async () => {
    if (records.length === 0) return;
    setBackendPdfFallbackWarning(false);
    // Location labels: use filtered records only. Prefer backend POST /labels/render-pdf (no GET /warehouse/layout/labels/).
    if (printMode === "location" && selectedLocationTemplateId != null) {
      try {
        let templateForBackend: LabelTemplate | null = locationPreviewTemplate ?? template;
        if (!templateForBackend?.elements?.length) {
          const tRes = await api.get<{ template_json: string }>(
            `/label-templates/${selectedLocationTemplateId}`,
            { params: { tenant_id: TENANT_ID } }
          );
          templateForBackend = JSON.parse(tRes.data.template_json) as LabelTemplate;
        }
        const recordsToSend = buildRecordsForBackendRenderPdf(templateForBackend, records);
        const res = await api.post(
          "/labels/render-pdf",
          {
            template_id: selectedLocationTemplateId,
            records: recordsToSend,
            ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
          },
          { params: { tenant_id: TENANT_ID }, responseType: "blob" }
        );
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `location-labels-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      } catch (e) {
        console.error("Backend render-pdf failed, falling back to client PDF:", e);
        setBackendPdfFallbackWarning(true);
      }
    }
    // Client fallback: use the same template as preview (locationPreviewTemplate in location mode)
    const templateForPdf =
      printMode === "location" && locationPreviewTemplate != null
        ? locationPreviewTemplate
        : template;
    if (printMode === "location" && locationPreviewTemplate == null) {
      console.warn("Location preview template not loaded; PDF may use wrong template.");
    }
    const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
    const blob = await generatePdfBlob(templateForPdf, records, thermalMode, selectedPrinter?.profile ?? null);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etykiety-${templateForPdf.name.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [template, records, thermalMode, printMode, selectedLocationTemplateId, printers, selectedPrinterId, locationPreviewTemplate]);

  /** Returns the same PDF blob as Generate PDF (for direct print or fallback download). */
  const getLocationLabelPdfBlob = useCallback(async (): Promise<Blob> => {
    if (records.length === 0) throw new Error("No records");
    if (printMode === "location" && selectedLocationTemplateId != null) {
      try {
        let templateForBackend: LabelTemplate | null = locationPreviewTemplate ?? template;
        if (!templateForBackend?.elements?.length) {
          const tRes = await api.get<{ template_json: string }>(
            `/label-templates/${selectedLocationTemplateId}`,
            { params: { tenant_id: TENANT_ID } }
          );
          templateForBackend = JSON.parse(tRes.data.template_json) as LabelTemplate;
        }
        const recordsToSend = buildRecordsForBackendRenderPdf(templateForBackend, records);
        const res = await api.post<Blob>(
          "/labels/render-pdf",
          {
            template_id: selectedLocationTemplateId,
            records: recordsToSend,
            ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
          },
          { params: { tenant_id: TENANT_ID }, responseType: "blob" }
        );
        return res.data;
      } catch {
        // fallback to client PDF
      }
    }
    const templateForPdf =
      printMode === "location" && locationPreviewTemplate != null ? locationPreviewTemplate : template;
    const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
    return await generatePdfBlob(templateForPdf, records, thermalMode, selectedPrinter?.profile ?? null);
  }, [template, records, thermalMode, printMode, selectedLocationTemplateId, printers, selectedPrinterId, locationPreviewTemplate]);

  const handlePrint = useCallback(async () => {
    const printer = selectedPrinterId != null ? printers.find((p) => p.id === selectedPrinterId) ?? null : null;
    const fallbackDownload = async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etykiety-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    };
    setPrinting(true);
    try {
      const blob = await getLocationLabelPdfBlob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const dataUrl = r.result as string;
          const base64 = dataUrl.split(",")[1];
          resolve(base64 ?? "");
        };
        r.onerror = () => reject(new Error("Blob to base64 failed"));
        r.readAsDataURL(blob);
      });
      if (!printer?.system_printer_name) {
        await fallbackDownload(blob);
        return;
      }
      await printPdf(printer.system_printer_name, base64);
    } catch (e) {
      console.error("Print failed, falling back to download:", e);
      try {
        const blob = await getLocationLabelPdfBlob();
        await fallbackDownload(blob);
      } catch (e2) {
        console.error("Fallback download failed:", e2);
      }
    } finally {
      setPrinting(false);
    }
  }, [printers, selectedPrinterId, getLocationLabelPdfBlob]);

  const handleDetectSystemPrinters = useCallback(async () => {
    try {
      const list = await listSystemPrinters();
      setSystemPrinters(list);
    } catch (e) {
      console.error("List system printers failed:", e);
      setSystemPrinters([]);
    }
  }, []);

  const handleGenerateRackLabels = useCallback(async () => {
    setRackGenerating(true);
    try {
      const res = await api.post<{ records: LabelRecord[] }>("/labels/generate-rack", {
        rack: rackRack,
        levels: rackLevels,
        positions: rackPositions,
        ...(rackZone.trim() ? { zone: rackZone.trim() } : {}),
      });
      setRackRecords(Array.isArray(res.data?.records) ? res.data.records : []);
    } catch (e) {
      console.error("Generate rack labels failed:", e);
      setRackRecords([]);
    } finally {
      setRackGenerating(false);
    }
  }, [rackRack, rackLevels, rackPositions, rackZone]);

  const handleDownloadRackPdf = useCallback(async () => {
    if (rackRecords.length === 0) return;
    const templateId = selectedLocationTemplateId ?? locationTemplates.find((t) => t.is_default)?.id ?? locationTemplates[0]?.id;
    if (templateId == null) {
      return;
    }
    setRackPdfLoading(true);
    try {
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: templateId,
          records: rackRecords,
          ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
        },
        { params: { tenant_id: TENANT_ID }, responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-labels-${rackRack}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Rack labels PDF failed:", e);
    } finally {
      setRackPdfLoading(false);
    }
  }, [rackRecords, selectedLocationTemplateId, locationTemplates, rackRack, printers, selectedPrinterId]);

  const handlePdfImportUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPdfImportError("Please select a PDF file.");
      return;
    }
    setPdfImportError(null);
    setPdfImportLoading(true);
    setPdfImportBarcodes([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<{ barcodes: string[] }>("/labels/import-barcode-pdf", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const list = Array.isArray(res.data?.barcodes) ? res.data.barcodes : [];
      setPdfImportBarcodes(list);
      if (list.length === 0) setPdfImportError("No barcodes detected in this PDF.");
    } catch (err: unknown) {
      const res = err && typeof err === "object" && "response" in err ? (err as { response?: { data?: { detail?: string } } }).response : undefined;
      const detail = res?.data?.detail;
      setPdfImportError(detail ? String(detail) : "Import failed.");
      setPdfImportBarcodes([]);
    } finally {
      setPdfImportLoading(false);
    }
    e.target.value = "";
  }, []);

  const handlePdfImportGenerateLabels = useCallback(async () => {
    if (pdfImportBarcodes.length === 0) return;
    const templateId = selectedLocationTemplateId ?? locationTemplates.find((t) => t.is_default)?.id ?? locationTemplates[0]?.id;
    if (templateId == null) return;
    const records: LabelRecord[] = pdfImportBarcodes.map((code) => ({
      loc_name: code,
      loc_barcode: code,
      location_name: code,
      barcode_data: code,
      "{loc_name}": code,
      "{loc_barcode}": code,
    }));
    setPdfImportPdfLoading(true);
    try {
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: templateId,
          records,
          ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
        },
        { params: { tenant_id: TENANT_ID }, responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `imported-barcodes-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF generation failed:", e);
      setPdfImportError("Failed to generate PDF.");
    } finally {
      setPdfImportPdfLoading(false);
    }
  }, [pdfImportBarcodes, selectedLocationTemplateId, locationTemplates, printers, selectedPrinterId]);

  const handleGenerateRackStrip = useCallback(async () => {
    setStripGenerating(true);
    try {
      const res = await api.post<{ records: LabelRecord[] }>("/labels/generate-rack-strip", {
        rack: stripRack,
        level: stripLevel,
        start: stripStart,
        end: stripEnd,
      });
      setStripRecords(Array.isArray(res.data?.records) ? res.data.records : []);
    } catch (e) {
      console.error("Generate rack strip failed:", e);
      setStripRecords([]);
    } finally {
      setStripGenerating(false);
    }
  }, [stripRack, stripLevel, stripStart, stripEnd]);

  const handleDownloadRackStripPdf = useCallback(async () => {
    if (stripRecords.length === 0) return;
    const templateId = selectedLocationTemplateId ?? locationTemplates.find((t) => t.is_default)?.id ?? locationTemplates[0]?.id;
    if (templateId == null) return;
    setStripPdfLoading(true);
    try {
      const stripRecord = { locations: stripRecords };
      const res = await api.post(
        "/labels/render-pdf",
        {
          template_id: templateId,
          records: [stripRecord],
          ...((() => { const p = printers.find(pr => pr.id === selectedPrinterId); return p?.profile_id != null ? { printer_profile_id: p.profile_id } : {}; })()),
        },
        { params: { tenant_id: TENANT_ID }, responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `rack-strip-${stripRack}-${stripLevel}-${stripStart}-${stripEnd}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Rack strip PDF failed:", e);
    } finally {
      setStripPdfLoading(false);
    }
  }, [stripRecords, stripRack, stripLevel, stripStart, stripEnd, selectedLocationTemplateId, locationTemplates, printers, selectedPrinterId]);

  const handleGenerateBasketLabelsForCart = useCallback(async () => {
    if (selectedCartId == null) return;
    setGeneratingBasketLabels(true);
    try {
      const res = await api.get<{ id: number; name: string; barcode?: string; baskets?: Array<{ id: number; name: string | null; row: number; column: number; barcode?: string }> }>(`/carts/${selectedCartId}/`);
      const cart = res.data;
      const cartBarcode = cart.barcode ?? `CART-${cart.id}`;
      const baskets = cart.baskets ?? [];
      const records: LabelRecord[] = baskets.map((b, idx) => {
        const code = b.name && String(b.name).trim() ? b.name : `S-${b.row}-${b.column}`;
        const barcode = b.barcode ?? `${cartBarcode}-B${String(idx + 1).padStart(2, "0")}`;
        return {
          basket_id: String(b.id),
          basket_code: code,
          basket_barcode: barcode,
          basket_level: String(b.row + 1),
          basket_position: String(b.column + 1),
          cart_id: String(cart.id),
          barcode_data: barcode,
          "{basket_id}": String(b.id),
          "{basket_code}": code,
          "{basket_barcode}": barcode,
          "{basket_level}": String(b.row + 1),
          "{basket_position}": String(b.column + 1),
          "{cart_id}": String(cart.id),
        };
      });
      if (records.length === 0) return;
      const selectedPrinter = printers.find((p) => p.id === selectedPrinterId) ?? null;
      const blob = await generatePdfBlob(template, records, thermalMode, selectedPrinter?.profile ?? null);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `basket-labels-cart-${selectedCartId}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Generate basket labels failed:", e);
    } finally {
      setGeneratingBasketLabels(false);
    }
  }, [template, selectedCartId, thermalMode, printers, selectedPrinterId]);

  const rackOptions = layout?.racks?.map((r, i) => {
    const aisle = (r.aisle_letter ?? "A").toString().trim().toUpperCase().slice(0, 1);
    const idx = Number(r.rack_index ?? i + 1);
    const id = `${aisle}${idx}`;
    return { id, label: `Regał ${id}` };
  }) ?? [];

  const labelsToPrintCount =
    printMode === "location" ? records.length
    : printMode === "rack" ? rackRecords.length
    : printMode === "rack_strip" ? stripRecords.length
    : printMode === "pdf_import" ? pdfImportBarcodes.length
    : null;

  return (
    <div className="h-full overflow-y-auto p-4 max-w-4xl mx-auto space-y-6">
      {/* Section 1 — Mode selector */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Print labels</h2>
        <p className="text-sm text-slate-600 mb-2">Mode</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPrintMode("location")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${printMode === "location" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Location labels
          </button>
          <button
            type="button"
            onClick={() => setPrintMode("cart_basket")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${printMode === "cart_basket" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Cart / Basket labels
          </button>
          <button
            type="button"
            onClick={() => setPrintMode("rack")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${printMode === "rack" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Generate rack labels
          </button>
          <button
            type="button"
            onClick={() => setPrintMode("rack_strip")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${printMode === "rack_strip" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Rack Strip Builder
          </button>
          <button
            type="button"
            onClick={() => setPrintMode("pdf_import")}
            className={`px-3 py-1.5 rounded text-sm font-medium ${printMode === "pdf_import" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Import PDF barcodes
          </button>
        </div>
      </div>

      {/* Section 2 — Settings panel */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
        <h3 className="text-base font-semibold text-slate-700">Settings</h3>
        {printMode === "location" && (
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Warehouse</label>
            <select
              value={selectedWarehouseId ?? ""}
              onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
            >
              <option value="">— Wybierz magazyn —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}
        {(printMode === "location" || printMode === "rack" || printMode === "rack_strip" || printMode === "pdf_import") && (
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Template</label>
            <select
              value={selectedLocationTemplateId ?? ""}
              onChange={(e) => setSelectedLocationTemplateId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
            >
              <option value="">{printMode === "location" ? "Location default" : "— Select template —"}</option>
              {locationTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.is_default ? (printMode === "location" ? " (domyślny)" : " (default)") : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Printer</label>
          <select
            value={selectedPrinterId ?? ""}
            onChange={(e) => setSelectedPrinterId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
          >
            <option value="">None</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">Calibration (offset/scale) is applied only when exporting or printing PDF.</p>
        </div>
        {labelsToPrintCount !== null && (
          <p className="text-sm text-slate-600">
            Labels to print: <strong>{labelsToPrintCount}</strong>
          </p>
        )}
      </div>

        {printMode === "rack_strip" && (
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Rack Strip Builder</h3>
            <p className="text-xs text-slate-500">Generate one long beam label with multiple segments (e.g. A-1-1 | A-1-2 | A-1-3 …). Use a template with a repeater (dataset: locations).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Rack</label>
                <input
                  type="text"
                  value={stripRack}
                  onChange={(e) => setStripRack(e.target.value)}
                  placeholder="A"
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Level</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={stripLevel}
                  onChange={(e) => setStripLevel(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Start position</label>
                <input
                  type="number"
                  min={1}
                  value={stripStart}
                  onChange={(e) => setStripStart(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">End position</label>
                <input
                  type="number"
                  min={1}
                  value={stripEnd}
                  onChange={(e) => setStripEnd(Math.max(stripStart, Number(e.target.value) || 1))}
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateRackStrip}
              disabled={stripGenerating || stripEnd < stripStart}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white disabled:opacity-50 font-semibold"
            >
              {stripGenerating ? "Generating…" : "Generate strip"}
            </button>
            {stripRecords.length > 0 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Template (repeater with dataset &quot;locations&quot;)</label>
                  <select
                    value={selectedLocationTemplateId ?? ""}
                    onChange={(e) => setSelectedLocationTemplateId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                  >
                    <option value="">— Select template —</option>
                    {locationTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadRackStripPdf}
                  disabled={stripPdfLoading || locationTemplates.length === 0}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 font-semibold"
                >
                  {stripPdfLoading ? "Generating PDF…" : "Download PDF"}
                </button>
              </>
            )}
          </div>
        )}

        {printMode === "pdf_import" && (
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Import PDF barcodes</h3>
            <p className="text-xs text-slate-500">Upload a PDF containing barcodes to extract codes and generate new labels.</p>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">PDF file</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handlePdfImportUpload}
                disabled={pdfImportLoading}
                className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2 file:mr-2 file:rounded file:border-0 file:bg-cyan-100 file:px-3 file:py-1 file:text-sm file:font-medium file:text-cyan-700"
              />
            </div>
            {pdfImportError && <p className="text-sm text-red-600">{pdfImportError}</p>}
            {pdfImportLoading && <p className="text-sm text-slate-500">Detecting barcodes…</p>}
            {pdfImportBarcodes.length > 0 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Template</label>
                  <select
                    value={selectedLocationTemplateId ?? ""}
                    onChange={(e) => setSelectedLocationTemplateId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                  >
                    <option value="">— Select template —</option>
                    {locationTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handlePdfImportGenerateLabels}
                  disabled={pdfImportPdfLoading || locationTemplates.length === 0}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 font-semibold"
                >
                  {pdfImportPdfLoading ? "Generating PDF…" : "Generate labels"}
                </button>
              </>
            )}
          </div>
        )}

        {printMode === "rack" && (
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Generate rack labels</h3>
            <p className="text-xs text-slate-500">Generate location labels for a rack (e.g. A-1-1, A-1-2, …).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Rack</label>
                <input
                  type="text"
                  value={rackRack}
                  onChange={(e) => setRackRack(e.target.value)}
                  placeholder="A"
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Levels</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={rackLevels}
                  onChange={(e) => setRackLevels(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Positions</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={rackPositions}
                  onChange={(e) => setRackPositions(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Zone (optional)</label>
                <input
                  type="text"
                  value={rackZone}
                  onChange={(e) => setRackZone(e.target.value)}
                  placeholder=""
                  className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateRackLabels}
              disabled={rackGenerating}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white disabled:opacity-50 font-semibold"
            >
              {rackGenerating ? "Generating…" : "Generate"}
            </button>
            {rackRecords.length > 0 && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Template</label>
                  <select
                    value={selectedLocationTemplateId ?? ""}
                    onChange={(e) => setSelectedLocationTemplateId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
                  >
                    <option value="">— Select template —</option>
                    {locationTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadRackPdf}
                  disabled={rackRecords.length === 0 || rackPdfLoading || locationTemplates.length === 0}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 font-semibold"
                >
                  {rackPdfLoading ? "Generating PDF…" : "Download PDF"}
                </button>
              </>
            )}
          </div>
        )}

        {printMode === "cart_basket" && (
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Generate basket labels for cart</h3>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Cart</label>
              <select
                value={selectedCartId ?? ""}
                onChange={(e) => setSelectedCartId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
              >
                <option value="">— Select cart —</option>
                {cartList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} (ID {c.id})</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleGenerateBasketLabelsForCart}
              disabled={selectedCartId == null || generatingBasketLabels}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 font-semibold"
            >
              {generatingBasketLabels ? "Generating…" : "Generate basket labels"}
            </button>
          </div>
        )}

        {printMode === "location" && (
          <>
        <button
          type="button"
          onClick={loadLayout}
          disabled={selectedWarehouseId == null || loading}
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white disabled:opacity-50 text-sm font-semibold"
        >
          {loading ? "Ładowanie…" : "Załaduj układ"}
        </button>

        {layout && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">Które etykiety drukować</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all" as const, label: "Wszystkie lokalizacje" },
                  { value: "by_rack" as const, label: "Po regale" },
                  { value: "reserve_only" as const, label: "Tylko rezerwa" },
                  { value: "manual" as const, label: "Ręczny wybór (lista)" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectionMode(opt.value)}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${
                      selectionMode === opt.value ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-[#E2E8F0]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {selectionMode === "by_rack" && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Wybierz regały</label>
                <div className="flex flex-wrap gap-2">
                  {rackOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setSelectedRackIds((prev) =>
                          prev.includes(opt.id) ? prev.filter((id) => id !== opt.id) : [...prev, opt.id]
                        )
                      }
                      className={`px-2 py-1 rounded text-xs border ${
                        selectedRackIds.includes(opt.id) ? "bg-cyan-600 text-white border-cyan-600" : "bg-slate-100 text-slate-700 border-[#E2E8F0] hover:bg-slate-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectionMode === "manual" && (() => {
              const allForManual = layout ? getRecordsFromLayout(layout, "all", [], []) : [];
              const searchLower = manualLocationSearch.trim().toLowerCase();
              const filtered = searchLower
                ? allForManual.filter(
                    (r) =>
                      (r.location_code ?? "").toLowerCase().includes(searchLower) ||
                      (r.location_barcode ?? "").toLowerCase().includes(searchLower) ||
                      (r.rack ?? "").toLowerCase().includes(searchLower)
                  )
                : allForManual;
              const isSelected = (r: LabelRecord) =>
                manualLocationIds.includes(r.location_barcode ?? "") || manualLocationIds.includes(r.location_code ?? "");
              const toggle = (r: LabelRecord) => {
                const add = [r.location_barcode, r.location_code].filter(Boolean) as string[];
                setManualLocationIds((prev) => {
                  const next = new Set(prev);
                  if (isSelected(r)) add.forEach((id) => next.delete(id));
                  else add.forEach((id) => next.add(id));
                  return [...next];
                });
              };
              return (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Ręczny wybór lokalizacji</label>
                  <input
                    type="text"
                    placeholder="Szukaj (kod, regał…)"
                    value={manualLocationSearch}
                    onChange={(e) => setManualLocationSearch(e.target.value)}
                    className="w-full max-w-sm rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2 text-sm mb-2"
                  />
                  <div className="max-h-48 overflow-y-auto rounded border border-[#E2E8F0] bg-white">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-[#E2E8F0]">
                        <tr>
                          <th className="px-2 py-1.5 w-8" />
                          <th className="px-2 py-1.5 font-medium text-slate-600">location_code</th>
                          <th className="px-2 py-1.5 font-medium text-slate-600">rack</th>
                          <th className="px-2 py-1.5 font-medium text-slate-600">level</th>
                          <th className="px-2 py-1.5 font-medium text-slate-600">position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, i) => (
                          <tr
                            key={i}
                            className="border-b border-slate-100 hover:bg-slate-50"
                            onClick={() => toggle(r)}
                          >
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={isSelected(r)}
                                onChange={() => toggle(r)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-[#E2E8F0]"
                              />
                            </td>
                            <td className="px-2 py-1 font-mono text-xs">{r.location_code ?? "—"}</td>
                            <td className="px-2 py-1">{r.rack ?? "—"}</td>
                            <td className="px-2 py-1">{r.level ?? "—"}</td>
                            <td className="px-2 py-1">{r.position ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Wybrano: {manualLocationIds.length} lokalizacji</p>
                </div>
              );
            })()}

            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={thermalMode}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setThermalMode(checked);
                  try {
                    localStorage.setItem("label_print_thermal_mode", String(checked));
                  } catch {
                    /* ignore */
                  }
                }}
              />
              Tryb drukarki termicznej (monochrom, wysoki kontrast)
            </label>

            {backendPdfFallbackWarning && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Backend PDF generation failed — using client renderer.
              </p>
            )}
          </>
        )}
        </>
        )}

      {/* Section 3 — Main action (location mode) */}
      {printMode === "location" && (
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={records.length === 0}
            className="w-full px-4 py-3 rounded-lg bg-cyan-600 text-white disabled:opacity-50 font-semibold text-base hover:bg-cyan-700 transition-colors"
          >
            Generate PDF
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={
              records.length === 0 ||
              printing ||
              !qzReady ||
              selectedPrinterId == null ||
              !printers.find((p) => p.id === selectedPrinterId)?.system_printer_name
            }
            className="w-full px-4 py-3 rounded-lg bg-slate-700 text-white disabled:opacity-50 font-semibold text-base hover:bg-slate-800 transition-colors"
          >
            {printing ? "Printing…" : "Print"}
          </button>
          {!qzChecking && !qzReady && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Install QZ Tray to enable direct printing.
            </p>
          )}
          {qzReady && selectedPrinterId != null && !printers.find((p) => p.id === selectedPrinterId)?.system_printer_name && (
            <p className="text-sm text-slate-600">
              Map a system printer in Settings → Printers for this printer to enable Print.
            </p>
          )}
          <details className="text-sm text-slate-600">
            <summary className="cursor-pointer font-medium">Detect system printers</summary>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                onClick={handleDetectSystemPrinters}
                disabled={!qzReady}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm"
              >
                Detect system printers
              </button>
              {systemPrinters && (
                <ul className="list-disc list-inside text-xs text-slate-600 max-h-32 overflow-y-auto">
                  {systemPrinters.length === 0 ? (
                    <li>No printers found</li>
                  ) : (
                    systemPrinters.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Section 4 — Preview area (location mode) */}
      {printMode === "location" && layout && records.length > 0 && (
        <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
          <h3 className="text-sm font-semibold text-slate-700 bg-slate-50 px-4 py-3 border-b border-[#E2E8F0]">
            Preview (first 20 labels)
          </h3>
          <div className="p-4">
            {locationPreviewLoading ? (
              <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
            ) : templateIdForPreview == null ? (
              <p className="text-sm text-slate-500">Wybierz szablon, aby zobaczyć podgląd etykiet.</p>
            ) : (
              <div className="grid grid-cols-6 gap-3">
                {locationPreviewTemplate &&
                  locationPageRecords.slice(0, 20).map((record, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center rounded border border-slate-200 bg-white shadow-sm overflow-hidden"
                    >
                      <LabelPreviewCard
                        template={locationPreviewTemplate}
                        record={record}
                        cardWidthPx={120}
                      />
                      <span className="text-[10px] text-slate-500 py-1 font-mono">
                        {String(record?.loc_name ?? record?.location_name ?? record?.location_code ?? record?.barcode_data ?? "")}
                      </span>
                    </div>
                  ))}
                {locationPageRecords.length > 20 && (
                  <span className="text-xs text-slate-500 self-center">+{locationPageRecords.length - 20} kolejnych</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {printMode === "rack_strip" && stripRecords.length > 0 && (
        <div className="mt-6 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
          <h3 className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-2 border-b border-[#E2E8F0]">
            Preview — rack strip ({stripRecords.length} segments)
          </h3>
          <div className="p-3">
            <div className="flex flex-wrap gap-2 items-center text-xs font-mono text-slate-700">
              {stripRecords.map((r, i) => (
                <span key={i} className="px-2 py-1 rounded bg-slate-100 border border-slate-200">
                  {String((r as LabelRecord).loc_name ?? (r as LabelRecord).barcode_data ?? "")}
                </span>
              ))}
            </div>
            <p className="text-slate-500 text-[10px] mt-2">One label with repeater; barcode under each segment.</p>
          </div>
        </div>
      )}

      {printMode === "rack" && rackRecords.length > 0 && (
        <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white">
          <h3 className="text-sm font-semibold text-slate-700 bg-slate-50 px-4 py-3 border-b border-[#E2E8F0]">
            Preview (first 20 labels)
          </h3>
          <div className="p-4">
            {rackPreviewLoading ? (
              <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
            ) : templateIdForPreview == null ? (
              <p className="text-sm text-slate-500">Wybierz szablon, aby zobaczyć podgląd etykiet.</p>
            ) : (
              <div className="grid grid-cols-6 gap-3">
                {rackPreviewTemplate &&
                  rackRecords.slice(0, 20).map((record, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center rounded border border-slate-200 bg-white shadow-sm overflow-hidden"
                    >
                      <LabelPreviewCard
                        template={rackPreviewTemplate}
                        record={record}
                        cardWidthPx={120}
                      />
                      <span className="text-[10px] text-slate-500 py-1 font-mono">
                        {String(record?.loc_name ?? record?.location_name ?? record?.barcode_data ?? "")}
                      </span>
                    </div>
                  ))}
                {rackRecords.length > 20 && (
                  <span className="text-xs text-slate-500 self-center">+{rackRecords.length - 20} kolejnych</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {printMode === "pdf_import" && pdfImportBarcodes.length > 0 && (
        <div className="mt-6 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
          <h3 className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-2 border-b border-[#E2E8F0]">
            Detected barcodes — {pdfImportBarcodes.length}
          </h3>
          <ul className="max-h-64 overflow-y-auto p-2 space-y-1 text-xs text-slate-700 font-mono">
            {pdfImportBarcodes.slice(0, 100).map((code, i) => (
              <li key={i}>{code}</li>
            ))}
            {pdfImportBarcodes.length > 100 && (
              <li className="text-slate-500">… +{pdfImportBarcodes.length - 100} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Convert SVG string to PNG data URL at given mm size (for PDF). Uses same render as editor. */
const PDF_PX_PER_MM = 6;

function svgToPngDataUrl(svgString: string, widthMm: number, heightMm: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    img.onload = () => {
      const cw = Math.max(1, Math.round(widthMm * PDF_PX_PER_MM));
      const ch = Math.max(1, Math.round(heightMm * PDF_PX_PER_MM));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2d unavailable"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("SVG image load failed"));
    img.src = dataUrl;
  });
}

/** When true, use vector SVG→PDF; when false, use raster (SVG→PNG→PDF). */
const VECTOR_PDF_ENABLED = true;

/** Find first repeater in template tree (top-level or inside groups). */
function findRepeater(elements: TemplateElement[]): RepeaterElement | null {
  for (const el of elements) {
    if (el.type === "repeater") return el as RepeaterElement;
    if (el.type === "group" && "elements" in el && Array.isArray(el.elements)) {
      const found = findRepeater(el.elements as TemplateElement[]);
      if (found) return found;
    }
  }
  return null;
}

/** Chunk array into groups of `size`; same as RackLabelDownloadModal. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Capacity (slots per label) using same logic as RackLabelDownloadModal:
 * grid -> columns; else itemWidth -> floor(template.widthMm / itemWidth); else 1.
 */
function getSlotsPerLabelLikeRack(rep: RepeaterElement, template: LabelTemplate): number {
  if (rep.layout === "grid" && rep.columns != null && rep.columns > 0) {
    return Math.max(1, rep.columns);
  }
  const itemWidth =
    Number(rep.itemWidth) ?? Number((rep as { item_width?: number }).item_width) ?? 0;
  if (itemWidth > 0) {
    return Math.max(1, Math.floor(template.widthMm / itemWidth));
  }
  return 1;
}

/** Normalize a record so template variables (loc_name, loc_barcode, etc.) resolve. */
function normalizeRepeaterItem(r: LabelRecord): Record<string, unknown> {
  const rec = r as Record<string, unknown>;
  const locName = rec.location_name ?? rec.location_code ?? rec.loc_name ?? "";
  const barcode = rec.location_barcode ?? rec.barcode_data ?? rec.loc_barcode ?? rec.location_code ?? locName;
  return {
    ...rec,
    loc_name: locName,
    loc_barcode: barcode,
    barcode_data: barcode,
    location_name: rec.location_name ?? locName,
    location_code: rec.location_code ?? locName,
    location_barcode: rec.location_barcode ?? barcode,
  };
}

/**
 * Build repeater dataset from the same location records used by preview (getRecordsFromLayout).
 * No synthetic data: dataset items use actual record fields only. Dataset key from repeater.dataset
 * (e.g. levels, locations, bins). Ensures PDF repeater matches preview and warehouse layout.
 */
function buildRecordsLikeRackLabelModal(
  template: LabelTemplate,
  records: LabelRecord[]
): Record<string, unknown>[] {
  const repeater = findRepeater(template.elements ?? []);
  if (!repeater) {
    return records.map((r) => r as Record<string, unknown>);
  }
  const datasetKey = repeater.dataset?.trim() || "locations";
  const capacity = getSlotsPerLabelLikeRack(repeater, template);
  const chunks = chunk(records, capacity);

  const groupedRecords: Record<string, unknown>[] = [];
  for (const group of chunks) {
    const datasetItems = group.map((loc) => normalizeRepeaterItem(loc));
    const first = group[0];
    const firstNormalized = first ? normalizeRepeaterItem(first) : {};
    groupedRecords.push({
      ...firstNormalized,
      [datasetKey]: datasetItems,
    });
  }
  return groupedRecords;
}

/**
 * For /labels/render-pdf: use same record structure as RackLabelDownloadModal.
 */
function buildRecordsForBackendRenderPdf(
  template: LabelTemplate | null,
  records: LabelRecord[]
): Record<string, unknown>[] {
  if (!template?.elements?.length) return records.map((r) => r as Record<string, unknown>);
  return buildRecordsLikeRackLabelModal(template, records);
}

/**
 * Build list of records to render (one per physical label). Reuses RackLabelDownloadModal logic
 * so client-side PDF layout matches backend and "Download rack labels".
 */
function buildPageRecords(
  template: LabelTemplate,
  records: LabelRecord[]
): Record<string, unknown>[] {
  return buildRecordsLikeRackLabelModal(template, records);
}

/**
 * Client-side PDF: uses shared renderLabel so layout matches editor exactly.
 * Repeater templates: builds dataset records (e.g. { [datasetKey]: [r1, r2, r3] }) so repeater renders. Dataset key from repeater.dataset.
 * Tries vector render first (smaller PDF, sharper barcodes), falls back to raster.
 */
async function generatePdfBlob(
  template: LabelTemplate,
  records: LabelRecord[],
  _thermal: boolean,
  printerProfile?: PrinterProfile | null
): Promise<Blob> {
  // --- Diagnostic: template and repeater detection ---
  console.log("TEMPLATE JSON", template);
  const repeater = findRepeater(template.elements ?? []);
  console.log("REPEATER FOUND:", repeater);
  console.log("DATASET KEY:", repeater?.dataset);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const labelW = template.widthMm;
  const labelH = template.heightMm;
  const cols = Math.floor((pageW - 2 * margin) / labelW);
  const rows = Math.floor((pageH - 2 * margin) / labelH);
  const stepX = (pageW - 2 * margin) / cols;
  const stepY = (pageH - 2 * margin) / rows;

  const pageRecords = buildPageRecords(template, records);

  const BATCH_SIZE = 20;
  let index = 0;
  for (let start = 0; start < pageRecords.length; start += BATCH_SIZE) {
    const chunk = pageRecords.slice(start, start + BATCH_SIZE);
    for (const record of chunk) {
      const col = index % cols;
      const row = Math.floor(index / cols) % rows;
      const pageNum = Math.floor(index / (cols * rows));
      if (pageNum > 0 && col === 0 && row === 0) pdf.addPage();

      const x0 = margin + col * stepX;
      const y0 = margin + row * stepY;

      const svg = await renderLabel(template, record, { thermal: _thermal });
      const calibratedSvg = applyCalibration(svg, printerProfile);

      if (VECTOR_PDF_ENABLED) {
        try {
          await drawSvgVector(pdf, calibratedSvg, x0, y0, labelW, labelH);
        } catch {
          const pngDataUrl = await svgToPngDataUrl(calibratedSvg, labelW, labelH);
          pdf.addImage(pngDataUrl, "PNG", x0, y0, labelW, labelH);
        }
      } else {
        const pngDataUrl = await svgToPngDataUrl(calibratedSvg, labelW, labelH);
        pdf.addImage(pngDataUrl, "PNG", x0, y0, labelW, labelH);
      }
      index++;
    }
    await new Promise((r) => setTimeout(r, 0));
  }

  return pdf.output("blob");
}
