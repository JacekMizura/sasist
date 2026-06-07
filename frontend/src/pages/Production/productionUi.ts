import type { ProductionBatchStatus, ProductionOrderStatus } from "../../api/productionApi";

export const PRODUCTION_STATUS_LABEL: Record<ProductionOrderStatus, string> = {
  draft: "Robocze",
  planned: "Zaplanowane",
  in_progress: "W produkcji",
  completed: "Zakończone",
  cancelled: "Anulowane",
};

export const BATCH_STATUS_LABEL: Record<ProductionBatchStatus, string> = {
  draft: "Robocza",
  planned: "Zaplanowana",
  collecting: "Zbieranie",
  in_progress: "W produkcji",
  putaway: "Odłożenie",
  completed: "Zakończona",
  cancelled: "Anulowana",
};

export function stockTone(required: number, available: number): "ok" | "partial" | "short" {
  if (available >= required - 1e-6) return "ok";
  if (available > 0) return "partial";
  return "short";
}

export const STOCK_TONE_CLASS = {
  ok: "border-emerald-200 bg-emerald-50",
  partial: "border-amber-200 bg-amber-50",
  short: "border-red-200 bg-red-50",
} as const;

export function batchStatusBadgeClass(status: ProductionBatchStatus): string {
  const base = "inline-flex rounded px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "collecting":
      return `${base} bg-amber-100 text-amber-900`;
    case "putaway":
      return `${base} bg-emerald-100 text-emerald-800`;
    case "in_progress":
      return `${base} bg-blue-100 text-blue-800`;
    case "completed":
      return `${base} bg-emerald-100 text-emerald-800`;
    case "cancelled":
      return `${base} bg-slate-200 text-slate-700`;
    case "planned":
      return `${base} bg-violet-100 text-violet-800`;
    default:
      return `${base} bg-slate-100 text-slate-700`;
  }
}

export function productionStatusBadgeClass(status: ProductionOrderStatus): string {
  const base = "inline-flex rounded px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "in_progress":
      return `${base} bg-amber-100 text-amber-900`;
    case "completed":
      return `${base} bg-emerald-100 text-emerald-800`;
    case "cancelled":
      return `${base} bg-slate-200 text-slate-700`;
    case "planned":
      return `${base} bg-blue-100 text-blue-800`;
    default:
      return `${base} bg-slate-100 text-slate-700`;
  }
}

export function formatProductionMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(2)} zł`;
}

const RECENT_LOC_KEY = "production.recentTargetLocations";

export function loadRecentTargetLocations(warehouseId: number): number[] {
  try {
    const raw = localStorage.getItem(`${RECENT_LOC_KEY}.${warehouseId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0).slice(0, 8);
  } catch {
    return [];
  }
}

export function rememberTargetLocation(warehouseId: number, locationId: number): void {
  const prev = loadRecentTargetLocations(warehouseId).filter((id) => id !== locationId);
  const next = [locationId, ...prev].slice(0, 8);
  try {
    localStorage.setItem(`${RECENT_LOC_KEY}.${warehouseId}`, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
