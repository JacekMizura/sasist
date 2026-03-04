import { useState, useCallback, useEffect } from "react";
import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import api from "../../api/axios";
import type {
  LabelTemplate,
  LabelRecord,
  SelectionMode,
  FormattingRules,
} from "../../types/labelSystem";
import { applyFormatting, getRecordsFromLayout } from "./labelData";

const TENANT_ID = 1;

type Props = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
};

export function LabelPrintQueue({ template }: Props) {
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [layout, setLayout] = useState<{
    racks?: { aisle_letter?: string; rack_index?: number; bins?: { label?: string; barcode_data?: string; location_id?: string; level_index?: number; segment_index?: number; storage_type?: string; volume_dm3?: number }[] }[];
    visual_elements?: { type?: string; zoneType?: string; name?: string }[];
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("all");
  const [selectedRackIds, setSelectedRackIds] = useState<string[]>([]);
  const [manualLocationIds] = useState<string[]>([]);
  const [formatting, setFormatting] = useState<FormattingRules>({
    zeroPadLevel: true,
    zeroPadSegment: true,
    zeroPadRackIndex: true,
    prefix: "",
    suffix: "",
  });
  const [thermalMode, setThermalMode] = useState(true);
  const [loading, setLoading] = useState(false);

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

  const records = layout ? getRecordsFromLayout(layout, selectionMode, selectedRackIds, manualLocationIds) : [];
  const formattedRecords = records.map((r) => applyFormatting(r, formatting));

  const handleGeneratePdf = useCallback(async () => {
    if (formattedRecords.length === 0) return;
    const blob = await generatePdfBlob(template, formattedRecords, thermalMode);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etykiety-${template.name.replace(/\s+/g, "-")}-${Date.now()}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [template, formattedRecords, thermalMode]);

  const rackOptions = layout?.racks?.map((r, i) => ({
    id: `${r.aisle_letter ?? "A"}${String(r.rack_index ?? i + 1).padStart(2, "0")}`,
    label: `Regał ${r.aisle_letter ?? "A"}${String(r.rack_index ?? i + 1).padStart(2, "0")}`,
  })) ?? [];

  return (
    <div className="h-full overflow-y-auto p-4 max-w-4xl mx-auto">
      <div className="space-y-4">
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

            <div>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">Formatowanie</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={formatting.zeroPadLevel ?? false}
                    onChange={(e) => setFormatting((f) => ({ ...f, zeroPadLevel: e.target.checked }))}
                  />
                  Zero-padding poziomu (np. 01)
                </label>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={formatting.zeroPadSegment ?? false}
                    onChange={(e) => setFormatting((f) => ({ ...f, zeroPadSegment: e.target.checked }))}
                  />
                  Zero-padding segmentu
                </label>
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={formatting.zeroPadRackIndex ?? false}
                    onChange={(e) => setFormatting((f) => ({ ...f, zeroPadRackIndex: e.target.checked }))}
                  />
                  Zero-padding numeru regału (A-01)
                </label>
                <div>
                  <label className="block text-slate-500 text-xs mb-0.5">Prefix</label>
                  <input
                    type="text"
                    value={formatting.prefix ?? ""}
                    onChange={(e) => setFormatting((f) => ({ ...f, prefix: e.target.value }))}
                    placeholder="np. WH-"
                    className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-xs mb-0.5">Suffix</label>
                  <input
                    type="text"
                    value={formatting.suffix ?? ""}
                    onChange={(e) => setFormatting((f) => ({ ...f, suffix: e.target.value }))}
                    placeholder="np. -PL"
                    className="w-full rounded border border-[#E2E8F0] bg-slate-50 text-[#1E293B] px-2 py-1 text-xs"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={thermalMode}
                onChange={(e) => setThermalMode(e.target.checked)}
              />
              Tryb drukarki termicznej (monochrom, wysoki kontrast)
            </label>

            <p className="text-sm text-slate-600">
              Do wydruku: <strong>{formattedRecords.length}</strong> etykiet
            </p>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={formattedRecords.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50 font-semibold"
            >
              Generuj PDF (multi-up A4)
            </button>
          </>
        )}
      </div>

      {layout && formattedRecords.length > 0 && (
        <div className="mt-6 border border-[#E2E8F0] rounded-lg overflow-hidden bg-white">
          <h3 className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-2 border-b border-[#E2E8F0]">Podgląd rekordów (max 50)</h3>
          <ul className="max-h-64 overflow-y-auto p-2 space-y-1 text-xs text-slate-700">
            {formattedRecords.slice(0, 50).map((r, i) => (
              <li key={i} className="font-mono">
                {r.location_name} · {r.barcode_data}
              </li>
            ))}
            {formattedRecords.length > 50 && (
              <li className="text-slate-500">… +{formattedRecords.length - 50} kolejnych</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

async function generatePdfBlob(
  template: LabelTemplate,
  records: LabelRecord[],
  thermal: boolean
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

    await renderLabelToPdf(pdf, template, record, x0, y0, thermal);
    index++;
  }

  return pdf.output("blob");
}

type PdfInstance = InstanceType<typeof jsPDF>;

async function renderLabelToPdf(
  pdf: PdfInstance,
  template: LabelTemplate,
  record: LabelRecord,
  x0: number,
  y0: number,
  thermal: boolean
) {
  const scale = 25.4 / template.dpi;

  for (const el of template.elements) {
    const x = x0 + el.x;
    const y = y0 + el.y;
    const w = el.width;
    const h = el.height;

    if (el.type === "barcode") {
      const val = String(record[el.dataBinding as keyof LabelRecord] ?? record.barcode_data ?? "");
      if (!val) continue;
      if (el.format === "Code128") {
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, val, {
          format: "CODE128",
          width: thermal ? 1.2 : 1,
          height: h * 0.7,
          displayValue: el.showValue ?? true,
        });
        const img = canvas.toDataURL("image/png");
        pdf.addImage(img, "PNG", x, y, w, h);
      } else {
        const dataUrl = await QRCode.toDataURL(val, { width: 80, margin: 0 });
        pdf.addImage(dataUrl, "PNG", x, y, w, h);
      }
    } else if (el.type === "dynamicText") {
      const val = String(record[el.binding as keyof LabelRecord] ?? "");
      const fontSize = (el.fontSize ?? 10) * scale;
      pdf.setFontSize(fontSize);
      pdf.setFont("helvetica", el.bold ? "bold" : "normal");
      if (el.verticalText && val) {
        for (let i = 0; i < val.length; i++) {
          pdf.text(val[i], x, y + (i + 0.5) * fontSize * 0.5);
        }
      } else {
        pdf.text(val, x, y + fontSize * 0.35);
      }
    } else if (el.type === "staticText") {
      const fontSize = (el.fontSize ?? 8) * scale;
      pdf.setFontSize(fontSize);
      pdf.setFont("helvetica", el.bold ? "bold" : "normal");
      if (el.verticalText && el.text) {
        for (let i = 0; i < el.text.length; i++) {
          pdf.text(el.text[i], x, y + (i + 0.5) * fontSize * 0.5);
        }
      } else {
        pdf.text(el.text, x, y + fontSize * 0.35);
      }
    }
  }
}
