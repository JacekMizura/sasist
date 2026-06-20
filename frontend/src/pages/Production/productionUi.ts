import type { ProductionBatchStatus, ProductionOrderStatus, StockShortageRead } from "../../api/productionApi";
import { formatApiError } from "../../utils/apiErrorMessage";
import {
  operationalBadgeBase,
  operationalBadgeDangerClass,
  operationalBadgeInfoClass,
  operationalBadgeNeutralClass,
  operationalBadgeSuccessClass,
  operationalBadgeWarningClass,
} from "../../components/operational/operationalSemanticBadges";

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
  in_progress: "W realizacji",
  putaway: "Odłożenie",
  completed: "Ukończona",
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

const PURPLE_BADGE = `${operationalBadgeBase} border-violet-200/90 bg-violet-50 text-violet-900`;

export function batchStatusBadgeClass(status: ProductionBatchStatus): string {
  switch (status) {
    case "planned":
      return PURPLE_BADGE;
    case "in_progress":
    case "collecting":
    case "putaway":
      return operationalBadgeInfoClass;
    case "completed":
      return operationalBadgeSuccessClass;
    case "cancelled":
      return operationalBadgeDangerClass;
    default:
      return operationalBadgeNeutralClass;
  }
}

export function productionStatusBadgeClass(status: ProductionOrderStatus): string {
  switch (status) {
    case "planned":
      return PURPLE_BADGE;
    case "in_progress":
      return operationalBadgeInfoClass;
    case "completed":
      return operationalBadgeSuccessClass;
    case "cancelled":
      return operationalBadgeDangerClass;
    default:
      return operationalBadgeNeutralClass;
  }
}

export type ProductionPriorityLevel = "low" | "normal" | "high" | "critical";

export function resolveProductionPriority(
  priority?: string | null,
  hasShortages?: boolean,
  numericPriority?: number,
): ProductionPriorityLevel {
  if (hasShortages || priority === "blocked") return "high";
  if (priority === "urgent" || priority === "critical") return "critical";
  if (priority === "high" || (numericPriority != null && numericPriority > 7)) return "high";
  if (priority === "low" || (numericPriority != null && numericPriority <= 2)) return "low";
  return "normal";
}

const PRIORITY_LABEL: Record<ProductionPriorityLevel, string> = {
  low: "Niski",
  normal: "Normalny",
  high: "Wysoki",
  critical: "Krytyczny",
};

export function productionPriorityLabel(
  priority?: string | null,
  hasShortages?: boolean,
  numericPriority?: number,
): string {
  return PRIORITY_LABEL[resolveProductionPriority(priority, hasShortages, numericPriority)];
}

export function productionPriorityBadgeClass(
  priority?: string | null,
  hasShortages?: boolean,
  numericPriority?: number,
): string {
  switch (resolveProductionPriority(priority, hasShortages, numericPriority)) {
    case "low":
      return operationalBadgeNeutralClass;
    case "normal":
      return operationalBadgeInfoClass;
    case "high":
      return operationalBadgeWarningClass;
    case "critical":
      return operationalBadgeDangerClass;
  }
}

export function recipeStatusBadgeClass(recipe: {
  is_active: boolean;
  has_low_stock?: boolean;
  status_badge?: string;
}): string {
  if (!recipe.is_active) return operationalBadgeNeutralClass;
  if (recipe.has_low_stock || recipe.status_badge === "LOW_STOCK") return operationalBadgeWarningClass;
  return operationalBadgeSuccessClass;
}

export function recipeStatusLabel(recipe: {
  is_active: boolean;
  has_low_stock?: boolean;
  status_badge?: string;
}): string {
  if (!recipe.is_active) return "Archiwum";
  if (recipe.has_low_stock || recipe.status_badge === "LOW_STOCK") return "Braki materiałów";
  return "Aktywna";
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

export const START_COLLECTING_BLOCKED_TOOLTIP =
  "Braki materiałów — uzupełnij stan magazynowy składników przed rozpoczęciem kompletacji.";

export function batchHasMaterialShortages(
  batch: { has_shortages?: boolean },
  pickPlan?: { has_shortages?: boolean } | null,
): boolean {
  return Boolean(batch.has_shortages || pickPlan?.has_shortages);
}

type InsufficientStockDetail = {
  message?: string;
  shortages?: StockShortageRead[];
};

export function parseInsufficientStockDetail(e: unknown): InsufficientStockDetail | null {
  if (!e || typeof e !== "object" || !("response" in e)) return null;
  const status = (e as { response?: { status?: number } }).response?.status;
  if (status !== 409) return null;
  const detail = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const shortages = Array.isArray(d.shortages)
    ? (d.shortages as StockShortageRead[]).filter(
        (s) => s && typeof s.product_name === "string" && typeof s.missing === "number",
      )
    : undefined;
  return {
    message: typeof d.message === "string" && d.message.trim() ? d.message.trim() : undefined,
    shortages: shortages?.length ? shortages : undefined,
  };
}

export function formatStockShortagesSummary(shortages: StockShortageRead[], maxItems = 4): string {
  const parts = shortages.slice(0, maxItems).map((s) => `${s.product_name} (brakuje ${s.missing})`);
  if (shortages.length > maxItems) parts.push(`+${shortages.length - maxItems} kolejnych`);
  return parts.join(", ");
}

/** Komunikat toast dla POST start-collecting (409 + lista braków). */
export function formatStartCollectingError(e: unknown): string {
  const detail = parseInsufficientStockDetail(e);
  if (detail) {
    const base = detail.message ?? "Niewystarczający stan magazynowy składników.";
    if (detail.shortages?.length) {
      return `${base} ${formatStockShortagesSummary(detail.shortages)}`;
    }
    return base;
  }
  return formatApiError(e);
}
