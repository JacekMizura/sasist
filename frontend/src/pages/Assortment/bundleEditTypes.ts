import type { LucideIcon } from "lucide-react";
import { Factory, History, ImageIcon, LayoutList, Link2, Package, Printer, ScrollText, Tag, Warehouse } from "lucide-react";

import type { BundleItemWrite } from "../../api/bundlesApi";

export type BundleEditTabId =
  | "basic"
  | "prices"
  | "products"
  | "warehouse"
  | "production"
  | "images"
  | "history"
  | "logs"
  | "relations"
  | "labelSheet";

const BUNDLE_TABS_BASE: { id: Exclude<BundleEditTabId, "production">; label: string; icon: LucideIcon }[] = [
  { id: "basic", label: "Podstawowe", icon: LayoutList },
  { id: "prices", label: "Ceny", icon: Tag },
  { id: "products", label: "Produkty", icon: Package },
  { id: "warehouse", label: "Magazyn", icon: Warehouse },
  { id: "images", label: "Zdjęcia", icon: ImageIcon },
  { id: "history", label: "Historia", icon: History },
  { id: "logs", label: "Logi", icon: ScrollText },
  { id: "relations", label: "Powiązania", icon: Link2 },
  { id: "labelSheet", label: "Etykieta", icon: Printer },
];

/** Zakładki edycji zestawu — Produkcja jak u produktu (tylko istniejący zestaw). */
export function buildBundleEditTabs(isNew: boolean): { id: BundleEditTabId; label: string; icon: LucideIcon }[] {
  if (isNew) return BUNDLE_TABS_BASE;
  const tabs: { id: BundleEditTabId; label: string; icon: LucideIcon }[] = [];
  for (const t of BUNDLE_TABS_BASE) {
    tabs.push(t);
    if (t.id === "warehouse") {
      tabs.push({ id: "production", label: "Produkcja", icon: Factory });
    }
  }
  return tabs;
}

/** @deprecated Użyj buildBundleEditTabs(isNew) */
export const BUNDLE_EDIT_TABS = buildBundleEditTabs(false);

export type CatalogProduct = {
  id: number;
  name?: string | null;
  ean?: string | null;
  symbol?: string | null;
  sku?: string | null;
  stock_quantity?: number;
  image_url?: string | null;
  purchase_price?: number | null;
};

export type ProductSummary = {
  name: string;
  sku: string;
  ean: string | null;
  stock: number;
  imageUrl: string | null;
  purchasePrice: number | null;
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
