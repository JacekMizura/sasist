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
    }
  | {
      kind: "order";
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
  };
}

export function productionOrderToRow(o: ProductionOrderRead): ProductionOrderRow {
  return {
    kind: "order",
    id: o.id,
    number: o.number,
    product: o.product_name ?? `Produkt #${o.product_id}`,
    qty: o.planned_quantity,
    status: o.status,
    date: (o.created_at ?? "").slice(0, 10) || "—",
    operator: o.operator_name ?? "—",
    priority: o.has_shortages ? "blocked" : o.priority > 5 ? "high" : "normal",
    hasShortages: o.has_shortages ?? false,
    isReleasedToWms: o.is_released_to_wms ?? false,
    numericPriority: o.priority,
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
  { value: "draft", label: "Robocza" },
  { value: "planned", label: "Zaplanowana" },
  { value: "collecting", label: "Zbieranie" },
  { value: "in_progress", label: "W realizacji" },
  { value: "putaway", label: "Odłożenie" },
  { value: "completed", label: "Ukończona" },
  { value: "cancelled", label: "Anulowana" },
] as const;

export const PRODUCTION_PRIORITY_OPTIONS = [
  { value: "", label: "Wszystkie priorytety" },
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
