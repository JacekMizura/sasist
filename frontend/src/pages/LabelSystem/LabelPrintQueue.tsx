import { useState, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelRecord,
  SelectionMode,
} from "../../types/labelSystem";
import { getRecordsFromLayout } from "./labelData";
import { LabelPreviewCard } from "./LabelPreviewCard";
import { renderLabel } from "../../labelRenderer";

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
  const [manualLocationIds] = useState<string[]>([]);
  const [thermalMode, setThermalMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [locationTemplates, setLocationTemplates] = useState<{ id: number; name: string; is_default: boolean }[]>([]);
  const [selectedLocationTemplateId, setSelectedLocationTemplateId] = useState<number | null>(null);
  const [locationPreviewTemplate, setLocationPreviewTemplate] = useState<LabelTemplate | null>(null);
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false);
  const [rackPreviewTemplate, setRackPreviewTemplate] = useState<LabelTemplate | null>(null);
  const [rackPreviewLoading, setRackPreviewLoading] = useState(false);

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

  useEffect(() => {
    if (printMode !== "location" || records.length === 0 || templateIdForPreview == null) {
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
  }, [printMode, templateIdForPreview, layout, selectionMode, selectedRackIds, records.length]);

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
    if (printMode === "location" && selectedWarehouseId != null) {
      try {
        const res = await api.get("/warehouse/layout/labels/", {
          params: {
            tenant_id: TENANT_ID,
            warehouse_id: selectedWarehouseId,
            ...(selectedLocationTemplateId != null ? { template_id: selectedLocationTemplateId } : {}),
          },
          responseType: "blob",
        });
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `location-labels-warehouse-${selectedWarehouseId}-${Date.now()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Location labels download failed:", e);
      }
      return;
    }
    // Prefer backend render-pdf for vector PDF (no rasterization); supports rotation and high-DPI printing
    if (printMode === "location" && selectedLocationTemplateId != null) {
      try {
        const res = await api.post(
          "/labels/render-pdf",
          { template_id: selectedLocationTemplateId, records },
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
      }
    }
    const blob = await generatePdfBlob(template, records, thermalMode);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etykiety-${template.name.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [template, records, thermalMode, printMode, selectedWarehouseId, selectedLocationTemplateId]);

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
        { template_id: templateId, records: rackRecords },
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
  }, [rackRecords, selectedLocationTemplateId, locationTemplates, rackRack]);

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
        { template_id: templateId, records },
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
  }, [pdfImportBarcodes, selectedLocationTemplateId, locationTemplates]);

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
        { template_id: templateId, records: [stripRecord] },
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
  }, [stripRecords, stripRack, stripLevel, stripStart, stripEnd, selectedLocationTemplateId, locationTemplates]);

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
      const blob = await generatePdfBlob(template, records, thermalMode);
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
  }, [template, selectedCartId, thermalMode]);

  const rackOptions = layout?.racks?.map((r, i) => {
    const aisle = (r.aisle_letter ?? "A").toString().trim().toUpperCase().slice(0, 1);
    const idx = Number(r.rack_index ?? i + 1);
    const id = `${aisle}${idx}`;
    return { id, label: `Regał ${id}` };
  }) ?? [];

  return (
    <div className="h-full overflow-y-auto p-4 max-w-4xl mx-auto">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Tryb</label>
          <div className="flex gap-2">
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
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Magazyn</label>
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
                  { value: "all" as const, label: "Wszystkie lokacje" },
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

            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={thermalMode}
                onChange={(e) => setThermalMode(e.target.checked)}
              />
              Tryb drukarki termicznej (monochrom, wysoki kontrast)
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Szablon</label>
              <select
                value={selectedLocationTemplateId ?? ""}
                onChange={(e) => setSelectedLocationTemplateId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded border border-[#E2E8F0] bg-white text-[#1E293B] px-3 py-2"
              >
                <option value="">Location default</option>
                {locationTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.is_default ? " (domyślny)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-sm text-slate-600">
              Do wydruku: <strong>{records.length}</strong> etykiet
            </p>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={records.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 font-semibold"
            >
              Generuj PDF (multi-up A4)
            </button>
          </>
        )}
        </>
        )}
      </div>

      {printMode === "location" && layout && records.length > 0 && (
        <div className="mt-6 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
          <h3 className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-2 border-b border-[#E2E8F0]">
            Podgląd etykiet (szablon: {locationTemplates.find((t) => t.id === templateIdForPreview)?.name ?? "—"}, max 20)
          </h3>
          <div className="p-3">
            {locationPreviewLoading ? (
              <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
            ) : templateIdForPreview == null ? (
              <p className="text-sm text-slate-500">Wybierz szablon, aby zobaczyć podgląd etykiet.</p>
            ) : (
              <div className="flex flex-wrap gap-3 items-end">
                {locationPreviewTemplate &&
                  records.slice(0, 20).map((record, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center rounded border border-slate-200 bg-white shadow-sm overflow-hidden"
                      style={{ flexShrink: 0 }}
                    >
                      <LabelPreviewCard
                        template={locationPreviewTemplate}
                        record={record}
                        cardWidthPx={120}
                      />
                      <span className="text-[10px] text-slate-500 py-1 font-mono">
                        {record?.location_name ?? record?.barcode_data ?? ""}
                      </span>
                    </div>
                  ))}
                {records.length > 20 && (
                  <span className="text-xs text-slate-500 self-center">+{records.length - 20} kolejnych</span>
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
        <div className="mt-6 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
          <h3 className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-2 border-b border-[#E2E8F0]">
            Podgląd etykiet (szablon: {locationTemplates.find((t) => t.id === templateIdForPreview)?.name ?? "—"}, max 20)
          </h3>
          <div className="p-3">
            {rackPreviewLoading ? (
              <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
            ) : templateIdForPreview == null ? (
              <p className="text-sm text-slate-500">Wybierz szablon, aby zobaczyć podgląd etykiet.</p>
            ) : (
              <div className="flex flex-wrap gap-3 items-end">
                {rackPreviewTemplate &&
                  rackRecords.slice(0, 20).map((record, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center rounded border border-slate-200 bg-white shadow-sm overflow-hidden"
                      style={{ flexShrink: 0 }}
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

/**
 * Client-side PDF: uses shared renderLabel so layout matches editor exactly.
 * For vector PDF and high-DPI printing, use backend POST /labels/render-pdf instead.
 */
async function generatePdfBlob(
  template: LabelTemplate,
  records: LabelRecord[],
  _thermal: boolean
): Promise<Blob> {
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

  let index = 0;
  for (const record of records) {
    const col = index % cols;
    const row = Math.floor(index / cols) % rows;
    const page = Math.floor(index / (cols * rows));
    if (page > 0 && col === 0 && row === 0) pdf.addPage();

    const x0 = margin + col * stepX;
    const y0 = margin + row * stepY;

    const svg = await renderLabel(template, record);
    const pngDataUrl = await svgToPngDataUrl(svg, labelW, labelH);
    pdf.addImage(pngDataUrl, "PNG", x0, y0, labelW, labelH);
    index++;
  }

  return pdf.output("blob");
}
