/**
 * CSV export/import for product–location mapping.
 * Export: all locations (including empty) with columns Location_Name, Location_UUID, Current_Product_SKU, Current_Product_Name, Quantity.
 * Import: match by Location_UUID or Location_Name; match products by SKU or EAN; fit-check and reserve handling.
 */

import { useState, useCallback } from "react";
import api from "../../api/axios";
import { useWarehouse } from "../../context/WarehouseContext";
import type { AssignedLocation, StorageType } from "../../types/warehouse";
import { positionFitsDimensions } from "../../components/warehouse/warehouseUtils";
import type { SelectablePosition } from "../../components/warehouse/warehouseUtils";
import { getPositionsFromLayoutRacks } from "../../components/warehouse/warehouseUtils";

const TENANT_ID = 1;

function escapeCsvCell(s: string): string {
  const str = String(s ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cells: (string | number)[]): string {
  return cells.map((c) => escapeCsvCell(String(c ?? ""))).join(",");
}

export type ProductForExport = {
  id: number;
  name?: string;
  symbol?: string;
  ean?: string;
  assignedLocations?: AssignedLocation[];
};

type BinInfo = {
  locationName: string;
  locationUUID: string;
};

/** Collect all bins from layout API response. */
function collectBinsFromLayout(racks: Array<{ bins?: Array<{ label?: string; location_id?: string; location_uuid?: string; locationUUID?: string }> }>): BinInfo[] {
  const out: BinInfo[] = [];
  for (const r of racks ?? []) {
    for (const b of r.bins ?? []) {
      const uuid = (b as { location_uuid?: string }).location_uuid ?? (b as { locationUUID?: string }).locationUUID ?? "";
      const name = (b as { label?: string }).label ?? (b as { location_id?: string }).location_id ?? uuid;
      if (uuid || name) out.push({ locationName: String(name).trim(), locationUUID: String(uuid).trim() });
    }
  }
  return out;
}

/** Build CSV rows: one row per (location, product) assignment; empty locations get one row with empty product columns. */
function buildExportRows(
  bins: BinInfo[],
  products: ProductForExport[]
): Array<{ locationName: string; locationUUID: string; sku: string; name: string; quantity: number }> {
  const byUuid = new Map<string, Array<{ sku: string; name: string; quantity: number }>>();
  for (const b of bins) {
    byUuid.set(b.locationUUID, []);
  }
  for (const p of products) {
    const locs = p.assignedLocations ?? [];
    const sku = (p.symbol ?? "").trim();
    const name = (p.name ?? "").trim();
    for (const a of locs) {
      const qty = typeof a.quantity === "number" ? a.quantity : Number(a.quantity) || 0;
      if (!byUuid.has(a.locationUUID)) byUuid.set(a.locationUUID, []);
      byUuid.get(a.locationUUID)!.push({ sku, name, quantity: qty });
    }
  }
  const rows: Array<{ locationName: string; locationUUID: string; sku: string; name: string; quantity: number }> = [];
  for (const b of bins) {
    const assignments = byUuid.get(b.locationUUID) ?? [];
    if (assignments.length === 0) {
      rows.push({ locationName: b.locationName, locationUUID: b.locationUUID, sku: "", name: "", quantity: 0 });
    } else {
      for (const a of assignments) {
        rows.push({ locationName: b.locationName, locationUUID: b.locationUUID, sku: a.sku, name: a.name, quantity: a.quantity });
      }
    }
  }
  return rows;
}

export type ExportImportProps = {
  onExportComplete?: () => void;
  onImportComplete?: () => void;
  products: ProductForExport[];
  fetchProducts: () => void;
};

export function LocationMappingExportImport({ onExportComplete, onImportComplete, products: _products, fetchProducts }: ExportImportProps) {
  const { warehouse } = useWarehouse();
  const [exporting, setExporting] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const handleExport = useCallback(async () => {
    if (!warehouse?.id) {
      alert("Wybierz magazyn w górnym pasku.");
      return;
    }
    setExporting(true);
    try {
      const [layoutRes, productsRes] = await Promise.all([
        api.get("/warehouse/layout", { params: { tenant_id: TENANT_ID, warehouse_id: warehouse.id } }),
        api.get("/products/", { params: { tenant_id: TENANT_ID, limit: 5000 } }),
      ]);
      const layoutData = layoutRes.data?.layout ?? layoutRes.data;
      const racks = layoutData?.racks ?? [];
      const bins = collectBinsFromLayout(racks);
      const rawProducts = productsRes.data?.items ?? (Array.isArray(productsRes.data) ? productsRes.data : []);
      const productList: ProductForExport[] = rawProducts.map((p: Record<string, unknown>) => ({
        id: Number(p.id),
        name: String(p.name ?? ""),
        symbol: String(p.symbol ?? p.sku ?? ""),
        ean: String(p.ean ?? ""),
        assignedLocations: (Array.isArray(p.assigned_locations) ? p.assigned_locations : Array.isArray(p.assignedLocations) ? p.assignedLocations : []) as AssignedLocation[],
      }));
      const rows = buildExportRows(bins, productList);
      const header = buildCsvRow(["Location_Name", "Location_UUID", "Current_Product_SKU", "Current_Product_Name", "Quantity"]);
      const body = rows.map((r) => buildCsvRow([r.locationName, r.locationUUID, r.sku, r.name, r.quantity])).join("\r\n");
      const csv = "\uFEFF" + header + "\r\n" + body;
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lokalizacje-${warehouse.id}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onExportComplete?.();
    } catch (e) {
      console.error(e);
      alert("Błąd eksportu. Sprawdź konsolę.");
    } finally {
      setExporting(false);
    }
  }, [warehouse?.id, onExportComplete]);

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting || !warehouse?.id}
        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {exporting ? "Eksportowanie…" : "Eksportuj CSV"}
      </button>
      <button
        type="button"
        onClick={() => setImportModalOpen(true)}
        disabled={!warehouse?.id}
        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        Importuj CSV
      </button>
      {importModalOpen && (
        <LocationMappingImportModal
          warehouseId={warehouse!.id}
          onClose={() => setImportModalOpen(false)}
          onSuccess={() => {
            setImportModalOpen(false);
            fetchProducts();
            onImportComplete?.();
          }}
        />
      )}
    </div>
  );
}

type ImportRow = {
  locationName: string;
  locationUUID: string;
  productSku: string;
  productName: string;
  productEan: string;
  quantity: number;
};

/** Simple CSV line parse: split by comma, respect quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '"') {
      if (inQuotes && line[j + 1] === '"') {
        cell += '"';
        j++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

function parseCsvFileStrict(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        resolve([]);
        return;
      }
      const headerLine = lines[0];
      const headers = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());
      const idx = (name: string) => headers.findIndex((h) => h.includes(name) || name.includes(h));
      const iName = idx("location_name") >= 0 ? idx("location_name") : idx("location name");
      const iUuid = idx("location_uuid") >= 0 ? idx("location_uuid") : idx("location uuid");
      const iSku = idx("current_product_sku") >= 0 ? idx("current_product_sku") : idx("sku") >= 0 ? idx("sku") : idx("symbol");
      const iEan = idx("product_ean") >= 0 ? idx("product_ean") : idx("ean");
      const iNameCol = idx("current_product_name") >= 0 ? idx("current_product_name") : idx("name");
      const iQty = idx("quantity") >= 0 ? idx("quantity") : idx("qty");
      const rows: ImportRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        const locationName = (iName >= 0 ? cells[iName] ?? "" : "").trim();
        const locationUUID = (iUuid >= 0 ? cells[iUuid] ?? "" : "").trim();
        const sku = (iSku >= 0 ? cells[iSku] ?? "" : "").trim();
        const ean = (iEan >= 0 ? cells[iEan] ?? "" : "").trim();
        const name = (iNameCol >= 0 ? cells[iNameCol] ?? "" : "").trim();
        const qtyStr = (iQty >= 0 ? cells[iQty] ?? "0" : "0").trim().replace(",", ".");
        const quantity = Math.max(0, Math.floor(parseFloat(qtyStr) || 0));
        if (!locationName && !locationUUID) continue;
        rows.push({
          locationName,
          locationUUID,
          productSku: sku || ean,
          productName: name,
          productEan: ean,
          quantity,
        });
      }
      resolve(rows);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "UTF-8");
  });
}

function LocationMappingImportModal({
  warehouseId,
  onClose,
  onSuccess,
}: {
  warehouseId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [_file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"overwrite" | "append">("overwrite");
  const [step, setStep] = useState<"select" | "preview" | "importing">("select");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const loadFile = useCallback(async (f: File) => {
    setFile(f);
    try {
      const parsed = await parseCsvFileStrict(f);
      setRows(parsed);
      setStep("preview");
      setErrors([]);
    } catch (e) {
      setErrors(["Nie udało się odczytać pliku CSV."]);
    }
  }, []);

  type Assignment = { locationUUID: string; quantity: number; locationAddress?: string; storageType?: StorageType };

  const runImport = useCallback(async () => {
    setImporting(true);
    setErrors([]);
    try {
      const [layoutRes, productsRes] = await Promise.all([
        api.get("/warehouse/layout", { params: { tenant_id: TENANT_ID, warehouse_id: warehouseId } }),
        api.get("/products/", { params: { tenant_id: TENANT_ID, limit: 5000 } }),
      ]);
      const layoutData = layoutRes.data?.layout ?? layoutRes.data;
      const rawRacks = layoutData?.racks ?? [];
      const positions = getPositionsFromLayoutRacks(rawRacks);
      const raw = productsRes.data?.items ?? (Array.isArray(productsRes.data) ? productsRes.data : []);
      const allProducts: (ProductForExport & { length?: number; width?: number; height?: number; volume?: number; weight?: number })[] = raw.map((p: Record<string, unknown>) => ({
        id: Number(p.id),
        name: String(p.name ?? ""),
        symbol: String(p.symbol ?? p.sku ?? ""),
        ean: String(p.ean ?? ""),
        length: Number(p.length) ?? undefined,
        width: Number(p.width) ?? undefined,
        height: Number(p.height) ?? undefined,
        volume: Number(p.volume) ?? undefined,
        weight: Number(p.weight) ?? undefined,
        assignedLocations: (Array.isArray(p.assigned_locations) ? p.assigned_locations : []) as AssignedLocation[],
      }));

      const posByUuid = new Map<string, SelectablePosition>();
      const posByName = new Map<string, SelectablePosition>();
      for (const p of positions) {
        posByUuid.set(p.locationUUID, p);
        const key = (p.locationAddress ?? p.locationUUID).trim().toLowerCase();
        posByName.set(key, p);
      }
      const productBySku = new Map<string, (ProductForExport & { length?: number; width?: number; height?: number; volume?: number; weight?: number })>();
      const productByEan = new Map<string, (ProductForExport & { length?: number; width?: number; height?: number; volume?: number; weight?: number })>();
      for (const p of allProducts) {
        const sku = (p.symbol ?? "").trim().toLowerCase();
        const ean = (p.ean ?? "").trim().toLowerCase();
        if (sku) productBySku.set(sku, p);
        if (ean) productByEan.set(ean, p);
      }

      const productAssignments = new Map<number, Assignment[]>();
      if (mode === "append") {
        for (const p of allProducts) {
          const locs = (p.assignedLocations ?? []).map((a) => ({
            locationUUID: a.locationUUID,
            quantity: typeof a.quantity === "number" ? a.quantity : Number(a.quantity) || 0,
            locationAddress: (a as AssignedLocation & { locationAddress?: string }).locationAddress,
            storageType: (a as AssignedLocation & { storageType?: StorageType }).storageType,
          }));
          productAssignments.set(p.id, locs);
        }
      }

      const errs: string[] = [];
      for (const row of rows) {
        if (row.quantity <= 0 && !row.productSku.trim()) continue;
        const locKey = row.locationName.trim().toLowerCase();
        const pos = row.locationUUID
          ? posByUuid.get(row.locationUUID.trim())
          : posByName.get(locKey) ?? Array.from(posByName.entries()).find(([k]) => k === locKey || k.includes(locKey) || locKey.includes(k))?.[1];
        if (!pos) {
          errs.push(`Lokalizacja nie znaleziona: ${row.locationName || row.locationUUID}`);
          continue;
        }
        if (!row.productSku.trim() && row.quantity <= 0) continue;
        const skuOrEan = row.productSku.trim().toLowerCase();
        const product = productBySku.get(skuOrEan) ?? productByEan.get(skuOrEan) ?? null;
        if (!product) {
          errs.push(`Produkt nie znaleziony (SKU/EAN): ${row.productSku}`);
          continue;
        }
        const vol = product.volume ?? (product.length && product.width && product.height ? (product.length * product.width * product.height) / 1000 : 0);
        if (pos.capacityDm3 != null && vol > 0 && row.quantity * vol > pos.capacityDm3) {
          errs.push(`Objętość przekracza pojemność: ${product.symbol} w ${pos.locationAddress}`);
        }
        if (pos.maxDepthCm != null && pos.maxWidthCm != null && pos.maxHeightCm != null && product.length != null && product.width != null && product.height != null) {
          const fits = positionFitsDimensions(
            { maxDepthCm: pos.maxDepthCm, maxWidthCm: pos.maxWidthCm, maxHeightCm: pos.maxHeightCm },
            { depthCm: product.length, widthCm: product.width, heightCm: product.height }
          );
          if (!fits) errs.push(`Produkt nie mieści się w wymiarach: ${product.symbol} w ${pos.locationAddress}`);
        }
        const existing = productAssignments.get(product.id) ?? [];
        const idx = existing.findIndex((a) => a.locationUUID === pos.locationUUID);
        const assignment: Assignment = {
          locationUUID: pos.locationUUID,
          quantity: row.quantity,
          locationAddress: pos.locationAddress,
          storageType: pos.storageType,
        };
        if (idx >= 0) existing[idx] = assignment;
        else existing.push(assignment);
        productAssignments.set(product.id, existing);
      }
      if (errs.length > 0) {
        setErrors(errs.slice(0, 25));
        setImporting(false);
        return;
      }

      const productIdsToUpdate = new Set<number>(productAssignments.keys());
      if (mode === "overwrite") {
        for (const p of allProducts) {
          if ((p.assignedLocations?.length ?? 0) > 0) productIdsToUpdate.add(p.id);
        }
      }
      for (const productId of productIdsToUpdate) {
        const p = allProducts.find((x) => x.id === productId);
        if (!p) continue;
        const assignments = productAssignments.get(productId) ?? [];
        await api.put(
          `/products/${productId}/`,
          {
            name: p.name,
            ean: p.ean ?? "",
            symbol: p.symbol ?? "",
            length: p.length,
            width: p.width,
            height: p.height,
            weight: p.weight,
            volume: p.volume,
            assigned_locations: assignments,
            tenant_id: TENANT_ID,
          },
          { params: { tenant_id: TENANT_ID } }
        );
      }
      onSuccess();
    } catch (e) {
      console.error(e);
      setErrors((prev) => [...prev, "Błąd importu. Sprawdź konsolę."]);
    } finally {
      setImporting(false);
    }
  }, [mode, rows, warehouseId, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 px-6 py-4 border-b border-slate-100 shrink-0">Importuj CSV</h3>
        <div className="p-6 overflow-y-auto flex-1">
          {step === "select" && (
            <div>
              <p className="text-sm text-slate-600 mb-3">
                Wybierz plik CSV z kolumnami: Location_Name, Location_UUID, Current_Product_SKU, Current_Product_Name, Quantity.
                Produkty dopasowywane po SKU lub EAN. Lokalizacje po UUID lub nazwie.
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
              />
            </div>
          )}
          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Wierszy do importu: <strong>{rows.filter((r) => r.productSku.trim() && r.quantity > 0).length}</strong>. Puste lokalizacje są pomijane.
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={mode === "overwrite"} onChange={() => setMode("overwrite")} className="rounded" />
                  Nadpisz (wyczyść istniejące przypisania i załaduj z pliku)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} className="rounded" />
                  Dołącz (dodaj/aktualizuj tylko wiersze z pliku)
                </label>
              </div>
              {errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 max-h-32 overflow-y-auto">
                  {errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
            Anuluj
          </button>
          {step === "preview" && (
            <button
              type="button"
              onClick={runImport}
              disabled={importing}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {importing ? "Importowanie…" : "Importuj"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
