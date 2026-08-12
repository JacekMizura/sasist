import type { ProductionBatchRead, ProductionOrderRead } from "@/api/productionApi";
import { BATCH_STATUS_LABEL, PRODUCTION_STATUS_LABEL, resolveProductionPriority } from "../../pages/Production/productionUi";

export type ProductionOrdersListFilters = {
  query: string;
  status: string;
  operator: string;
  product: string;
  plannedFrom: string;
  plannedTo: string;
  priority: string;
  shortagesOnly: boolean;
};

export const DEFAULT_PRODUCTION_ORDERS_FILTERS: ProductionOrdersListFilters = {
  query: "",
  status: "",
  operator: "",
  product: "",
  plannedFrom: "",
  plannedTo: "",
  priority: "",
  shortagesOnly: false,
};

export type ProductionOrderRow =
  | {
      kind: "batch";
      id: number;
      number: string;
      product: string;
      qty: number;
      status: string;
      date: string;
      operator: string;
      priority?: string | null;
      hasShortages: boolean;
      isReleasedToWms?: boolean;
      numericPriority?: number;
      /** Present when API returns progress; UI may hide the bar when null. */
      progressPercent?: number | null;
    }
  | {
      kind: "order";
      id: number;
      number: string;
      product: string;
      productImageUrl?: string | null;
      qty: number;
      producedQty: number;
      status: string;
      date: string;
      operator: string;
      priority?: string | null;
      hasShortages: boolean;
      isReleasedToWms?: boolean;
      numericPriority?: number;
      progressPercent?: number | null;
      sourceType?: "MANUAL" | "PLANNING" | "ORDERS" | null;
      sourceOrderCount?: number;
      sourceFulfilledOrderCount?: number;
      sourceShortageCount?: number;
      sourceReservedCount?: number;
      materialsReserved?: boolean;
      productionExecutionMethod?: "WMS" | "PRINT" | null;
      isPrintInterface?: boolean;
    };

export function productionBatchToRow(b: ProductionBatchRead): ProductionOrderRow {
  const label = b.lines?.map((l) => l.product_name).filter(Boolean).join(", ") || `${b.products_count ?? b.lines.length} prod.`;
  return {
    kind: "batch",
    id: b.id,
    number: b.number,
    product: label,
    qty: b.total_planned_units ?? 0,
    status: b.status,
    date: (b.created_at ?? "").slice(0, 10) || "—",
    operator: b.operator_name ?? "—",
    priority: b.has_shortages ? "blocked" : null,
    hasShortages: b.has_shortages ?? false,
    isReleasedToWms: b.is_released_to_wms ?? false,
    progressPercent: typeof b.progress_percent === "number" ? b.progress_percent : null,
  };
}

export function productionOrderToRow(o: ProductionOrderRead): ProductionOrderRow {
  return {
    kind: "order",
    id: o.id,
    number: o.number,
    product: o.product_name ?? `Produkt #${o.product_id}`,
    productImageUrl: o.product_image_url ?? null,
    qty: o.planned_quantity,
    producedQty: o.produced_quantity ?? 0,
    status: o.status,
    date: (o.created_at ?? "").slice(0, 10) || "—",
    operator: o.operator_name ?? "—",
    priority: o.has_shortages ? "blocked" : o.priority > 5 ? "high" : "normal",
    hasShortages: o.has_shortages ?? false,
    isReleasedToWms: o.is_released_to_wms ?? false,
    numericPriority: o.priority,
    progressPercent: typeof o.progress_percent === "number" ? o.progress_percent : null,
    sourceType: o.source_type ?? "MANUAL",
    sourceOrderCount: o.source_order_count ?? 0,
    sourceFulfilledOrderCount: o.source_fulfilled_order_count ?? 0,
    sourceShortageCount: o.source_shortage_count ?? 0,
    sourceReservedCount: o.source_reserved_count ?? 0,
    materialsReserved: Boolean(o.materials_reserved),
    productionExecutionMethod: o.production_execution_method ?? null,
    isPrintInterface: Boolean(o.is_print_interface),
  };
}

export function countActiveProductionOrdersFilters(f: ProductionOrdersListFilters): number {
  let n = 0;
  if (f.query.trim()) n += 1;
  if (f.status) n += 1;
  if (f.operator.trim()) n += 1;
  if (f.product.trim()) n += 1;
  if (f.plannedFrom || f.plannedTo) n += 1;
  if (f.priority) n += 1;
  if (f.shortagesOnly) n += 1;
  return n;
}

export function productionOrdersFilterLabel(f: ProductionOrdersListFilters): string {
  const parts: string[] = [];
  if (f.shortagesOnly) parts.push("Braki materiałów");
  if (f.status) {
    parts.push(
      f.status in BATCH_STATUS_LABEL
        ? BATCH_STATUS_LABEL[f.status as keyof typeof BATCH_STATUS_LABEL]
        : PRODUCTION_STATUS_LABEL[f.status as keyof typeof PRODUCTION_STATUS_LABEL] ?? f.status,
    );
  }
  if (f.priority) parts.push(f.priority);
  if (f.query.trim()) parts.push(`„${f.query.trim()}”`);
  return parts.length ? parts.join(" · ") : "Wszystkie zlecenia";
}

export function filterProductionOrderRows(rows: ProductionOrderRow[], f: ProductionOrdersListFilters): ProductionOrderRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.shortagesOnly && !r.hasShortages) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.operator.trim() && !r.operator.toLowerCase().includes(f.operator.trim().toLowerCase())) return false;
    if (f.product.trim() && !r.product.toLowerCase().includes(f.product.trim().toLowerCase())) return false;
    if (f.priority) {
      const level = resolveProductionPriority(r.priority, r.hasShortages, r.numericPriority);
      if (level !== f.priority) return false;
    }
    if (f.plannedFrom && r.date !== "—" && r.date < f.plannedFrom) return false;
    if (f.plannedTo && r.date !== "—" && r.date > f.plannedTo) return false;
    if (q) {
      const hay = [r.number, r.product, r.status, r.operator].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const PRODUCTION_ORDER_STATUS_OPTIONS = [
  { value: "", label: "Wszystkie statusy" },
  { value: "draft", label: "Nowe" },
  { value: "planned", label: "Zaplanowane" },
  { value: "collecting", label: "Pobieranie komponentów" },
  { value: "in_progress", label: "W produkcji" },
  { value: "awaiting_putaway", label: "Do rozlokowania" },
  { value: "putaway", label: "Rozlokowanie w toku" },
  { value: "completed", label: "Zakończone" },
  { value: "cancelled", label: "Anulowane" },
] as const;

export const PRODUCTION_PRIORITY_OPTIONS = [
  { value: "", label: "Wszystkie" },
  { value: "low", label: "Niski" },
  { value: "normal", label: "Normalny" },
  { value: "high", label: "Wysoki" },
  { value: "critical", label: "Krytyczny" },
] as const;

export type ProductionHistoryFilters = {
  query: string;
  operator: string;
  product: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

export const DEFAULT_PRODUCTION_HISTORY_FILTERS: ProductionHistoryFilters = {
  query: "",
  operator: "",
  product: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

export type ProductionRecipeListFilters = {
  query: string;
  status: "" | "active" | "archived" | "shortages";
};

export const DEFAULT_PRODUCTION_RECIPE_FILTERS: ProductionRecipeListFilters = {
  query: "",
  status: "",
};

export type ProductionAnalyticsFilters = {
  query: string;
  status: "" | "active" | "shortages";
  sortKey: "product" | "cost" | "producible";
  sortDir: "asc" | "desc";
};

export const DEFAULT_PRODUCTION_ANALYTICS_FILTERS: ProductionAnalyticsFilters = {
  query: "",
  status: "",
  sortKey: "cost",
  sortDir: "desc",
};
