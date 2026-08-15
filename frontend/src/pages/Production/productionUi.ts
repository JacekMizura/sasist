import {
  operationalBadgeDangerClass,
  operationalBadgeInfoClass,
  operationalBadgeNeutralClass,
  operationalBadgePrimaryClass,
  operationalBadgeSuccessClass,
  operationalBadgeWarningClass,
} from "../../components/operational/operationalSemanticBadges";
import type { StatusTone } from "@/design-system";
import type { ProductionBatchStatus, ProductionExecutionStatus, ProductionOrderStatus, StockShortageRead } from "../../api/productionApi";
import { formatApiError } from "../../utils/apiErrorMessage";

/** Single status label map — batch + MO share backend EXECUTION_STATUS_LABELS. */
export const EXECUTION_STATUS_LABEL: Record<ProductionExecutionStatus, string> = {
  draft: "Nowe",
  planned: "Zaplanowane",
  collecting: "Pobieranie komponentów",
  in_progress: "W produkcji",
  awaiting_putaway: "Do rozlokowania",
  putaway: "Rozlokowanie w toku",
  completed: "Zakończone",
  cancelled: "Anulowane",
};

/** @deprecated use EXECUTION_STATUS_LABEL */
export const BATCH_STATUS_LABEL: Record<ProductionBatchStatus, string> = EXECUTION_STATUS_LABEL;

/** @deprecated use EXECUTION_STATUS_LABEL */
export const PRODUCTION_STATUS_LABEL: Record<ProductionOrderStatus, string> = EXECUTION_STATUS_LABEL;

export function executionStatusLabel(status: string | null | undefined): string {
  const key = String(status || "").trim().toLowerCase() as ProductionExecutionStatus;
  return EXECUTION_STATUS_LABEL[key] ?? status ?? "—";
}

/**
 * Global execution status → StatusBadge tone.
 * Blue = rozlokowanie; orange (primary) = „W realizacji”; green = done; red = cancel; gray = new.
 * Shortages use a separate yellow badge — do not override status color.
 */
export function executionStatusTone(status: string | null | undefined): StatusTone {
  switch (String(status || "").trim().toLowerCase()) {
    case "completed":
      return "success";
    case "in_progress":
    case "collecting":
      return "primary";
    case "putaway":
    case "awaiting_putaway":
      return "info";
    case "cancelled":
      return "danger";
    case "planned":
    case "draft":
    default:
      return "neutral";
  }
}

/** Process progress bar / % — blue while running, green at 100%. Never red for shortages. */
export function productionProgressTone(pct: number, status?: string | null): StatusTone {
  if (pct >= 100 || String(status || "").toLowerCase() === "completed") return "success";
  return "info";
}

export const PRODUCTION_NUMBER_INPUT =
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

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

export function executionStatusBadgeClass(status: ProductionExecutionStatus | string): string {
  switch (String(status || "").trim().toLowerCase()) {
    case "in_progress":
    case "collecting":
      return operationalBadgePrimaryClass;
    case "putaway":
    case "awaiting_putaway":
      return operationalBadgeInfoClass;
    case "completed":
      return operationalBadgeSuccessClass;
    case "cancelled":
      return operationalBadgeDangerClass;
    case "planned":
    case "draft":
    default:
      return operationalBadgeNeutralClass;
  }
}

export function batchStatusBadgeClass(status: ProductionBatchStatus): string {
  return executionStatusBadgeClass(status);
}

export function productionStatusBadgeClass(status: ProductionOrderStatus): string {
  return executionStatusBadgeClass(status);
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

/**
 * Presentation-only integer quantity for ERP Production.
 * Does not mutate API payloads — floor non-negative values for display.
 */
export function formatProductionQuantity(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (v >= 0) return String(Math.floor(v + 1e-9));
  return String(Math.ceil(v - 1e-9));
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

/** Business labels — never show raw ORDERS / PLANNING / MANUAL enums in UI. */
export type ProductionSourceType = "MANUAL" | "PLANNING" | "ORDERS";

/** Compact list badge — Partia for batches; business source label for MOs. */
export function productionSourceBadgeLabel(opts: {
  kind?: "batch" | "order";
  sourceType?: string | null;
}): string {
  if (opts.kind === "batch") return "Partia";
  return productionSourceTypeLabel(opts.sourceType);
}

export function productionSourceTypeLabel(sourceType?: string | null): string {
  switch (String(sourceType || "").toUpperCase()) {
    case "ORDERS":
      return "Do zamówień";
    case "PLANNING":
      return "Na magazyn";
    case "MANUAL":
      return "Ręczne";
    default:
      return "Zlecenie";
  }
}

export function productionSourceTypeTone(sourceType?: string | null): StatusTone {
  switch (String(sourceType || "").toUpperCase()) {
    case "ORDERS":
      return "warning";
    case "PLANNING":
      return "info";
    default:
      return "neutral";
  }
}

export function productionExecutionMethodLabel(method?: string | null): string {
  return String(method || "").toUpperCase() === "PRINT" ? "Wydruk" : "Terminal WMS";
}

/** Source-item status on ORDERS MO — business language only. */
export function productionSourceItemStatusLabel(status?: string | null): string {
  switch (String(status || "").trim().toLowerCase()) {
    case "fulfilled":
      return "Wyprodukowano";
    case "reserved":
    case "open":
    case "partial":
      return "Gotowe do produkcji";
    case "shortage":
      return "Brak komponentów";
    case "cancelled":
      return "Anulowane";
    default:
      return "W toku";
  }
}

export function productionSourceItemStatusTone(status?: string | null): StatusTone {
  switch (String(status || "").trim().toLowerCase()) {
    case "fulfilled":
      return "success";
    case "shortage":
      return "warning";
    case "cancelled":
      return "danger";
    case "reserved":
    case "open":
    case "partial":
      return "info";
    default:
      return "neutral";
  }
}

export type MaterialReadinessKind = "ok" | "partial" | "shortage" | "unknown";

export function materialReadinessLabel(
  kind: MaterialReadinessKind,
  opts?: { producible?: number; planned?: number },
): string {
  if (kind === "ok") return "Komponenty dostępne";
  if (kind === "shortage") return "Brakuje komponentów";
  if (kind === "partial") {
    const p = opts?.producible;
    const pl = opts?.planned;
    if (p != null && pl != null && pl > 0) {
      return `Można wyprodukować ${fmtQtyUi(p)} z ${fmtQtyUi(pl)} szt.`;
    }
    return "Częściowo dostępne";
  }
  return "Gotowość materiałów";
}

export function materialReadinessTone(kind: MaterialReadinessKind): StatusTone {
  if (kind === "ok") return "success";
  if (kind === "partial") return "warning";
  if (kind === "shortage") return "danger";
  return "neutral";
}

function fmtQtyUi(n: number): string {
  return formatProductionQuantity(n);
}

/** Infer material readiness from order list/detail fields (no extra API). */
export function resolveMaterialReadiness(input: {
  hasShortages?: boolean;
  materialsReserved?: boolean;
  sourceShortageCount?: number;
  sourceReservedCount?: number;
  producedQuantity?: number;
  plannedQuantity?: number;
}): MaterialReadinessKind {
  const planned = Number(input.plannedQuantity ?? 0);
  const shortageN = Number(input.sourceShortageCount ?? 0);
  const reservedN = Number(input.sourceReservedCount ?? 0);
  if (input.hasShortages || shortageN > 0) {
    if (reservedN > 0 || (input.materialsReserved && planned > 0)) return "partial";
    return "shortage";
  }
  if (input.materialsReserved) return "ok";
  if (planned > 0 && Number(input.producedQuantity ?? 0) >= planned - 1e-6) return "ok";
  return "unknown";
}

/**
 * Pieces producible now vs plan — never mix with source/order counts.
 * Prefer reserved qty total; fall back to planned when no ORDERS qty metrics.
 */
export function producibleQuantityHint(input: {
  sourceReservedQuantityTotal?: number | null;
  sourceRequestedQuantityTotal?: number | null;
  plannedQuantity?: number | null;
  readiness?: MaterialReadinessKind;
}): { producible: number; planned: number } | null {
  const planned =
    Number(input.sourceRequestedQuantityTotal ?? 0) > 0
      ? Number(input.sourceRequestedQuantityTotal)
      : Number(input.plannedQuantity ?? 0);
  const reservedQty = Number(input.sourceReservedQuantityTotal ?? 0);
  if (input.readiness === "partial" && planned > 0) {
    return { producible: Math.max(0, reservedQty), planned };
  }
  if (input.readiness === "ok" && planned > 0) {
    return { producible: planned, planned };
  }
  return null;
}

