import { useState, useEffect, useCallback, useRef } from "react";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import api from "../api/axios";

type BarcodeFormat = "Code128" | "QR" | "DataMatrix";

type BinLocation = { label: string; barcode_data: string; location_id?: string; rackName: string };

const TENANT_ID = 1;

export default function BarcodeManagement() {
  const [warehouses, setWarehouses] = useState<{ id: number; name: string }[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [layout, setLayout] = useState<{ name: string; warehouse_name?: string; racks?: { aisle_letter: string; rack_index: number; bins: { label: string; barcode_data?: string; location_id?: string }[] }[] } | null>(null);
  const [format, setFormat] = useState<BarcodeFormat>("Code128");
  const [customText, setCustomText] = useState("");
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(null);
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
      const d = res.data;
      setLayout({
        name: d?.name ?? "Layout",
        warehouse_name: d?.warehouse_name,
        racks: Array.isArray(d?.racks) ? d.racks : [],
      });
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

  const allLocations: BinLocation[] = layout?.racks?.flatMap((r) =>
    (r.bins ?? []).map((b) => ({
      label: b.label,
      barcode_data: b.barcode_data ?? b.location_id ?? b.label,
      location_id: b.location_id,
      rackName: `${r.aisle_letter}${String(r.rack_index).padStart(2, "0")}`,
    }))
  ) ?? [];

  const rackOptions = layout?.racks?.map((r, i) => ({ index: i, label: `${r.aisle_letter}${String(r.rack_index).padStart(2, "0")}` })) ?? [];
  const selectedLocations =
    selectedRackIndex != null && layout?.racks?.[selectedRackIndex]
      ? ((layout.racks ?? [])[selectedRackIndex]?.bins ?? []).map((b) => ({
          label: b.label,
          barcode_data: b.barcode_data ?? b.location_id ?? b.label,
          location_id: b.location_id,
          rackName: `${(layout.racks ?? [])[selectedRackIndex]?.aisle_letter ?? ""}${String((layout.racks ?? [])[selectedRackIndex]?.rack_index ?? 0).padStart(2, "0")}`,
        }))
      : allLocations;

  const generateAllPdf = async () => {
    const warehouseName = layout?.warehouse_name ?? layout?.name ?? "Magazyn";
    const headerText = customText || `Własność: ${warehouseName}`;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const labelW = 65;
    const labelH = 40;
    const cols = Math.floor(pageW / labelW);
    let x = 5;
    let y = 10;
    let count = 0;

    for (const loc of selectedLocations) {
      const text = loc.barcode_data || loc.label;
      if (format === "Code128") {
        const canvas = document.createElement("canvas");
        JsBarcode(canvas, text, { format: "CODE128", width: 1.2, height: 28, displayValue: false });
        const img = canvas.toDataURL("image/png");
        pdf.addImage(img, "PNG", x, y, 55, 18);
      } else {
        const dataUrl = await QRCode.toDataURL(text, { width: 80, margin: 0 });
        pdf.addImage(dataUrl, "PNG", x, y, 22, 22);
      }
      pdf.setFontSize(8);
      pdf.text(loc.label, x, y + 32);
      pdf.text(headerText.slice(0, 30), x, y + 37);

      count++;
      x += labelW;
      if (count % cols === 0) {
        x = 5;
        y += labelH;
      }
      if (y + labelH > pageH - 15) {
        pdf.addPage();
        y = 10;
        x = 5;
      }
    }

    pdf.setFontSize(9);
    pdf.text(`Magazyn: ${warehouseName}  |  Data: ${new Date().toLocaleString("pl-PL")}  |  Format: ${format}`, 10, pageH - 8);
    pdf.save(`etykiety-${(warehouseName || "export").replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Zarządzanie kodami kreskowymi</h1>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Magazyn</label>
          <select
            value={selectedWarehouseId ?? ""}
            onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-800"
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
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white disabled:opacity-50"
        >
          {loading ? "Ładowanie…" : "Załaduj układ"}
        </button>

        {layout && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Format kodu</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as BarcodeFormat)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-800"
              >
                <option value="Code128">Code128</option>
                <option value="QR">QR</option>
                <option value="DataMatrix">DataMatrix (QR)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Tekst na etykiecie (np. Własność: …)</label>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={`Własność: ${layout.warehouse_name || layout.name}`}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Generuj dla</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRackIndex(null)}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${selectedRackIndex === null ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-700"}`}
                >
                  Wszystkie lokacje
                </button>
                {rackOptions.map((opt) => (
                  <button
                    key={opt.index}
                    type="button"
                    onClick={() => setSelectedRackIndex(opt.index)}
                    className={`px-3 py-1.5 rounded text-sm font-medium ${selectedRackIndex === opt.index ? "bg-cyan-600 text-white" : "bg-slate-200 text-slate-700"}`}
                  >
                    Regał {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Lokacji: {selectedLocations.length}
            </p>
            <button
              type="button"
              onClick={generateAllPdf}
              disabled={selectedLocations.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50"
            >
              Generuj PDF dla {selectedRackIndex != null ? "wybranego regału" : "wszystkich lokacji"}
            </button>
          </>
        )}
      </div>

      {layout && selectedLocations.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <h2 className="text-sm font-semibold text-slate-700 bg-slate-100 px-4 py-2">Podgląd lokacji</h2>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
            {selectedLocations.slice(0, 24).map((loc, i) => (
              <div key={i} className="border border-slate-200 rounded p-2 bg-white">
                <BarcodePreview format={format} value={loc.barcode_data || loc.label} />
                <p className="text-xs text-slate-600 mt-1 truncate">{loc.label}</p>
                <p className="text-[10px] text-slate-400">{loc.rackName}</p>
              </div>
            ))}
          </div>
          {selectedLocations.length > 24 && (
            <p className="text-xs text-slate-500 px-4 py-2">+ {selectedLocations.length - 24} kolejnych (w PDF wszystkie)</p>
          )}
        </div>
      )}

      {layout && layout.racks?.length === 0 && (
        <p className="text-slate-500">Brak regałów w układzie. Dodaj regały w Projektancie magazynu.</p>
      )}
    </div>
  );
}

function BarcodePreview({ format, value }: { format: BarcodeFormat; value: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!value || !canvasRef.current) return;
    if (format === "Code128") {
      try {
        JsBarcode(canvasRef.current, value, { format: "CODE128", width: 1, height: 32, displayValue: false });
      } catch {}
    }
  }, [format, value]);

  if (format === "QR" || format === "DataMatrix") {
    return <QRPreview value={value} />;
  }
  return <canvas ref={canvasRef} className="w-full max-h-12 object-contain" />;
}

function QRPreview({ value }: { value: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { width: 80, margin: 0 }).then(setUrl).catch(() => setUrl(""));
  }, [value]);
  if (!url) return <div className="w-20 h-20 bg-slate-200" />;
  return <img src={url} alt="" className="w-20 h-20 object-contain" />;
}
