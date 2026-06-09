import type { BundleItemWrite } from "../../api/bundlesApi";

export type BundleEditTabId = "basic" | "products" | "warehouse" | "history" | "logs" | "relations";

export const BUNDLE_EDIT_TABS: { id: BundleEditTabId; label: string }[] = [
  { id: "basic", label: "Podstawowe" },
  { id: "products", label: "Produkty" },
  { id: "warehouse", label: "Magazyn" },
  { id: "history", label: "Historia" },
  { id: "logs", label: "Logi" },
  { id: "relations", label: "Powiązania" },
];

export type CatalogProduct = {
  id: number;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  sku?: string | null;
  stock_quantity?: number;
};

export type ProductSummary = {
  name: string;
  sku: string;
  ean: string | null;
  stock: number;
};

export type BundleComponentRow = {
  rowKey: string;
  productId: number | null;
  quantity: number;
  searchText: string;
  listOpen: boolean;
  importMetaSummary?: string | null;
};

export function parseProductsResponse(data: unknown): CatalogProduct[] {
  if (Array.isArray(data)) return data as CatalogProduct[];
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: CatalogProduct[] }).items;
  }
  return [];
}

export function newRowKey(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyRow(): BundleComponentRow {
  return { rowKey: newRowKey(), productId: null, quantity: 1, searchText: "", listOpen: false, importMetaSummary: null };
}

export function formatBundleItemImportMeta(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== "object") return null;
    const bits = Object.entries(o).map(([k, v]) => `${k}: ${String(v)}`);
    return bits.length ? bits.join(" · ") : null;
  } catch {
    return raw.trim().slice(0, 160);
  }
}

/** Merge duplicate product_ids by sum qty; preserve first-seen order for sort_order. */
export function normalizeComponentsForSave(rows: BundleComponentRow[]): BundleItemWrite[] {
  const firstIndex = new Map<number, number>();
  const qtyByPid = new Map<number, number>();
  rows.forEach((r, idx) => {
    if (r.productId == null || r.quantity < 1) return;
    const pid = r.productId;
    if (!firstIndex.has(pid)) firstIndex.set(pid, idx);
    qtyByPid.set(pid, (qtyByPid.get(pid) ?? 0) + Math.floor(r.quantity));
  });
  return Array.from(qtyByPid.entries())
    .sort((a, b) => (firstIndex.get(a[0]) ?? 0) - (firstIndex.get(b[0]) ?? 0))
    .map(([product_id, quantity], sort_order) => ({ product_id, quantity, sort_order }));
}

export function formatMoneyZl(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}
