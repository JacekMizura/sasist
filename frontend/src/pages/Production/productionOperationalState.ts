/**
 * SSOT prezentacyjny etapu operacyjnego Produkcji.
 * Nie zmienia lifecycle backendu — tylko mapuje istniejące statusy/flagi na język operatora.
 */
import type { StatusTone } from "@/design-system";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { START_COLLECTING_BLOCKED_TOOLTIP } from "./productionUi";

export type ProductionOperationalStep =
  | "WAITING_MATERIALS"
  | "READY_TO_START"
  | "COLLECTING"
  | "PRODUCING"
  | "WAITING_PUTAWAY"
  | "READY_TO_PACK"
  | "COMPLETED"
  | "CANCELLED";

/** Gdzie pozycja ląduje na Pulpicie — wzajemnie wykluczające się. */
export type ProductionDashboardBucket = "reaction" | "todo" | "in_progress" | "done" | "hidden";

export type ProductionOperationalSeverity = "danger" | "warning" | "info" | "primary" | "success" | "neutral";

export type ProductionPrimaryActionKind =
  | "view_shortages"
  | "send_to_execution"
  | "start_print_execution"
  | "start_collecting"
  | "continue_collecting"
  | "continue_production"
  | "putaway"
  | "go_packing"
  | "view_details"
  | "none";

export type ProductionProgressMeaning = {
  /** Np. „Produkcja”, „Zbieranie”. */
  label: string;
  current: number;
  total: number;
  percent: number;
  /** Gdy % = 100, ale proces jeszcze trwa (np. rozlokowanie). */
  nextStepHint?: string | null;
  /** Pełna linia do UI, np. „Produkcja: 10/10 · 100%”. */
  displayLine: string;
};

export type ProductionOperationalStateInput = {
  executionKind: "order" | "batch";
  id: number;
  status: string;
  sourceType?: string | null;
  hasShortages?: boolean;
  materialsReserved?: boolean;
  isReleasedToWms?: boolean;
  isErpInterface?: boolean;
  isPrintInterface?: boolean;
  productionExecutionMethod?: "WMS" | "PRINT" | null;
  producedQuantity?: number;
  plannedQuantity?: number;
  collectionProgressPercent?: number | null;
  progressPercent?: number | null;
  sourceOrderCount?: number;
  sourceRequestedQuantityTotal?: number;
  sourceShortageQuantityTotal?: number;
  sourceShortageCount?: number;
  sourceFulfilledOrderCount?: number;
  /**
   * Distinct source orders still awaiting packing after ORDERS FG fulfillment.
   * Do not use sourceFulfilledOrderCount alone — that is production allocation, not packing.
   */
  sourceAwaitingPackingOrderCount?: number;
  /** Nazwa najważniejszego brakującego komponentu (z lines[].product_name_snapshot). */
  shortageComponentHint?: string | null;
  /** Ilość braków dla tego komponentu (lines[].missing). */
  shortagePrimaryMissingQty?: number | null;
  /** Ile innych pozycji komponentów ma braki (>0). */
  shortageAdditionalCount?: number | null;
  plannedDate?: string | null;
  /**
   * True on entity detail pages (BAT/MO detail).
   * Suppresses dead „Zobacz szczegóły” when there is no deeper screen.
   */
  isOnEntityDetailPage?: boolean;
};

export type ShortageLineLike = {
  product_name_snapshot?: string | null;
  missing?: number | null;
};

/** Pierwszy (największy) brak komponentu + liczba pozostałych — z lines API. */
export function shortageHintFromOrderLines(lines?: ShortageLineLike[] | null): {
  hint: string | null;
  primaryMissingQty: number;
  additionalCount: number;
} {
  const rows = (lines ?? [])
    .map((ln) => ({
      name: String(ln.product_name_snapshot || "").trim(),
      missing: Number(ln.missing ?? 0),
    }))
    .filter((r) => Number.isFinite(r.missing) && r.missing > 0)
    .sort((a, b) => b.missing - a.missing);
  if (rows.length === 0) {
    return { hint: null, primaryMissingQty: 0, additionalCount: 0 };
  }
  return {
    hint: rows[0].name || null,
    primaryMissingQty: rows[0].missing,
    additionalCount: Math.max(0, rows.length - 1),
  };
}

/**
 * Aktywna lista Zleceń: ukryj cancelled oraz completed MANUAL/PLANNING.
 * completed ORDERS zostaje tylko gdy nadal są źródła czekające na pakowanie.
 */
export function shouldShowProductionOrderOnActiveList(order: {
  status?: string | null;
  source_type?: string | null;
  source_fulfilled_order_count?: number | null;
  source_awaiting_packing_order_count?: number | null;
}): boolean {
  const s = statusKey(order.status);
  if (s === "cancelled") return false;
  if (s === "completed") {
    if (!isOrders(order.source_type)) return false;
    return Number(order.source_awaiting_packing_order_count ?? 0) > 0;
  }
  return true;
}

export function formatShortageDescription(input: {
  shortageComponentHint?: string | null;
  shortagePrimaryMissingQty?: number | null;
  shortageAdditionalCount?: number | null;
  sourceShortageQuantityTotal?: number | null;
}): string {
  const hint = input.shortageComponentHint?.trim() || null;
  const primaryQty = Number(input.shortagePrimaryMissingQty ?? 0);
  const sourceQty = Number(input.sourceShortageQuantityTotal ?? 0);
  const qty = primaryQty > 0 ? primaryQty : sourceQty;
  const extra = Math.max(0, Math.floor(Number(input.shortageAdditionalCount ?? 0)));
  const more = extra > 0 ? ` + ${extra} kolejnych` : "";
  if (qty > 0 && hint) return `Brakuje ${fmtQty(qty)} szt. — ${hint}${more}`;
  if (qty > 0) return `Brakuje ${fmtQty(qty)} szt. komponentów${more}`;
  if (hint) return `Brakuje — ${hint}${more}`;
  return "Brakuje komponentów potrzebnych do startu";
}

export type ProductionOperationalState = {
  currentStep: ProductionOperationalStep;
  businessLabel: string;
  description: string;
  primaryAction: {
    kind: ProductionPrimaryActionKind;
    label: string;
    disabled?: boolean;
    disabledReason?: string;
    href?: string;
    openInNewTab?: boolean;
  };
  severity: ProductionOperationalSeverity;
  tone: StatusTone;
  progressMeaning: ProductionProgressMeaning;
  dashboardBucket: ProductionDashboardBucket;
  /** Czy ORDERS pomija rozlokowanie (informacja prezentacyjna). */
  skipsPutaway: boolean;
  isDelayed: boolean;
};

export type ProductionSecondaryActionId =
  | "print_card"
  | "start_paper"
  | "open_erp"
  | "open_wms"
  | "cancel"
  | "preview_print";

export type ProductionSecondaryAction = {
  id: ProductionSecondaryActionId;
  label: string;
  disabled?: boolean;
  danger?: boolean;
};

function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function statusKey(status: string | null | undefined): string {
  return String(status || "").trim().toLowerCase();
}

function isOrders(sourceType?: string | null): boolean {
  return String(sourceType || "").toUpperCase() === "ORDERS";
}

function isPrintMethod(input: ProductionOperationalStateInput): boolean {
  return isOrders(input.sourceType) && String(input.productionExecutionMethod || "").toUpperCase() === "PRINT";
}

function printStarted(input: ProductionOperationalStateInput): boolean {
  const s = statusKey(input.status);
  return Boolean(
    input.isPrintInterface ||
      ["collecting", "in_progress", "awaiting_putaway", "putaway", "completed"].includes(s),
  );
}

function wmsHref(
  input: ProductionOperationalStateInput,
  phase: "collecting" | "execute" | "putaway",
): string {
  return wmsProductionPaths[phase](input.executionKind, input.id);
}

/** Canonical ERP detail path for BAT vs MO (never cross-link). */
export function productionEntityDetailHref(input: Pick<ProductionOperationalStateInput, "executionKind" | "id">): string {
  return input.executionKind === "order"
    ? erpProductionPaths.order(input.id)
    : erpProductionPaths.batch(input.id);
}

function detailHref(input: ProductionOperationalStateInput): string {
  return productionEntityDetailHref(input);
}

/** „Zobacz szczegóły” only when not already on that entity's detail page. */
function viewDetailsAction(input: ProductionOperationalStateInput): {
  kind: ProductionPrimaryActionKind;
  label: string;
  href?: string;
} {
  if (input.isOnEntityDetailPage) {
    return { kind: "none", label: "" };
  }
  return {
    kind: "view_details",
    label: "Zobacz szczegóły",
    href: detailHref(input),
  };
}

function completedDescription(input: ProductionOperationalStateInput): string {
  return input.executionKind === "batch"
    ? "Partia produkcyjna jest zakończona."
    : "Zlecenie produkcyjne jest zakończone.";
}

function packingHref(): string {
  return "/wms/packing/orders";
}

function shortagesHref(): string {
  return erpProductionPaths.materialsShortages;
}

function isPastPlannedDate(plannedDate?: string | null): boolean {
  if (!plannedDate) return false;
  const d = plannedDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return d < todayKey;
}

function buildProgress(
  label: string,
  current: number,
  total: number,
  nextStepHint?: string | null,
): ProductionProgressMeaning {
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.max(0, current);
  const percent =
    safeTotal > 0 ? Math.min(100, Math.round((safeCurrent / safeTotal) * 100)) : 0;
  return {
    label,
    current: safeCurrent,
    total: safeTotal,
    percent,
    nextStepHint: nextStepHint ?? null,
    displayLine: `${label}: ${fmtQty(safeCurrent)}/${fmtQty(safeTotal)} · ${percent}%`,
  };
}

function severityTone(severity: ProductionOperationalSeverity): StatusTone {
  return severity;
}

/**
 * Jedyny resolver etapu operacyjnego Produkcji (FE presentation SSOT).
 */
export function getProductionOperationalState(
  input: ProductionOperationalStateInput,
): ProductionOperationalState {
  const status = statusKey(input.status);
  const produced = Number(input.producedQuantity ?? 0);
  const planned = Number(input.plannedQuantity ?? 0);
  const orders = isOrders(input.sourceType);
  const skipsPutaway = orders;
  const shortageQty = Number(input.sourceShortageQuantityTotal ?? 0);
  const shortageCount = Number(input.sourceShortageCount ?? 0);
  const awaitingPackingOrders = Number(input.sourceAwaitingPackingOrderCount ?? 0);
  const print = isPrintMethod(input);
  const erp = Boolean(input.isErpInterface);
  const delayed = isPastPlannedDate(input.plannedDate) && !["completed", "cancelled"].includes(status);
  const blocked =
    Boolean(input.hasShortages) || shortageCount > 0 || shortageQty > 0;

  const productionProgress = buildProgress("Produkcja", produced, planned);
  const collectingProgress = buildProgress(
    "Zbieranie",
    input.collectionProgressPercent != null
      ? Number(input.collectionProgressPercent)
      : 0,
    100,
  );

  if (status === "cancelled") {
    return {
      currentStep: "CANCELLED",
      businessLabel: "Anulowane",
      description: "Zlecenie zostało anulowane.",
      primaryAction: viewDetailsAction(input),
      severity: "danger",
      tone: "danger",
      progressMeaning: productionProgress,
      dashboardBucket: "hidden",
      skipsPutaway,
      isDelayed: false,
    };
  }

  if (status === "completed") {
    if (orders && awaitingPackingOrders > 0) {
      return {
        currentStep: "READY_TO_PACK",
        businessLabel: "Gotowe do pakowania",
        description: "Produkcja zakończona. Produkt jest na lokalizacji buforowej — zamówienia gotowe do pakowania.",
        primaryAction: {
          kind: "go_packing",
          label: "Przejdź do pakowania",
          href: packingHref(),
          openInNewTab: true,
        },
        severity: "success",
        tone: "success",
        progressMeaning: buildProgress("Produkcja", planned || produced, planned || produced),
        dashboardBucket: "todo",
        skipsPutaway: true,
        isDelayed: false,
      };
    }
    return {
      currentStep: "COMPLETED",
      businessLabel: "Zakończone",
      description: completedDescription(input),
      primaryAction: viewDetailsAction(input),
      severity: "success",
      tone: "success",
      progressMeaning: buildProgress("Produkcja", planned || produced, planned || produced),
      dashboardBucket: "done",
      skipsPutaway,
      isDelayed: false,
    };
  }

  if (status === "awaiting_putaway" || status === "putaway") {
    const inFlight = status === "putaway";
    return {
      currentStep: "WAITING_PUTAWAY",
      businessLabel: "Rozlokuj produkt",
      description: inFlight
        ? "Rozlokowanie w toku — dokończ odłożenie produktu."
        : "Produkcja zakończona. Produkt czeka na umieszczenie w magazynie.",
      primaryAction: {
        kind: "putaway",
        label: "Rozlokuj",
        href: erp ? undefined : wmsHref(input, "putaway"),
        openInNewTab: !erp,
      },
      severity: "info",
      tone: "info",
      progressMeaning: buildProgress("Produkcja", planned || produced, planned || produced, "Następny krok: Rozlokowanie"),
      dashboardBucket: inFlight ? "in_progress" : "todo",
      skipsPutaway: false,
      isDelayed: delayed,
    };
  }

  if (status === "collecting") {
    return {
      currentStep: "COLLECTING",
      businessLabel: "Pobierz komponenty",
      description: "Zbieranie komponentów rozpoczęte",
      primaryAction: {
        kind: "continue_collecting",
        label: "Kontynuuj zbieranie",
        href: erp ? undefined : wmsHref(input, "collecting"),
        openInNewTab: !erp,
      },
      severity: "primary",
      tone: "primary",
      progressMeaning:
        input.collectionProgressPercent != null
          ? collectingProgress
          : buildProgress("Zbieranie", 0, 100, "Następny krok: Produkcja"),
      dashboardBucket: "in_progress",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  if (status === "in_progress") {
    return {
      currentStep: "PRODUCING",
      businessLabel: "Produkuj",
      description:
        planned > 0 ? `Wyprodukowano ${fmtQty(produced)}/${fmtQty(planned)} szt.` : "Produkcja w toku.",
      primaryAction: {
        kind: "continue_production",
        label: "Kontynuuj produkcję",
        href: erp ? undefined : wmsHref(input, "execute"),
        openInNewTab: !erp,
      },
      severity: "primary",
      tone: "primary",
      progressMeaning: buildProgress(
        "Produkcja",
        produced,
        planned,
        skipsPutaway ? "Po zakończeniu: pakowanie" : "Następny krok: Rozlokowanie",
      ),
      dashboardBucket: "in_progress",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  // draft / planned
  if (blocked) {
    return {
      currentStep: "WAITING_MATERIALS",
      businessLabel: "Brakuje materiałów",
      description: formatShortageDescription({
        shortageComponentHint: input.shortageComponentHint,
        shortagePrimaryMissingQty: input.shortagePrimaryMissingQty,
        shortageAdditionalCount: input.shortageAdditionalCount,
        sourceShortageQuantityTotal: shortageQty,
      }),
      primaryAction: {
        kind: "view_shortages",
        label: "Zobacz braki",
        href: shortagesHref(),
      },
      severity: "danger",
      tone: "danger",
      progressMeaning: buildProgress("Produkcja", produced, planned),
      dashboardBucket: "reaction",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  if (print && !printStarted(input)) {
    const canStart = Boolean(input.materialsReserved) && !input.hasShortages;
    return {
      currentStep: "READY_TO_START",
      businessLabel: "Pobierz komponenty",
      description: canStart
        ? "Wydrukuj kartę i rozpocznij produkcję."
        : "Zarezerwuj komponenty przed startem.",
      primaryAction: {
        kind: "start_print_execution",
        label: "Wydrukuj i rozpocznij",
        disabled: !canStart,
        disabledReason: "Brak komponentów",
      },
      severity: canStart ? "primary" : "warning",
      tone: canStart ? "primary" : "warning",
      progressMeaning: buildProgress("Produkcja", produced, planned),
      dashboardBucket: "todo",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  if (print && printStarted(input)) {
    return {
      currentStep: "PRODUCING",
      businessLabel: "Produkuj",
      description:
        planned > 0 ? `Wyprodukowano ${fmtQty(produced)}/${fmtQty(planned)} szt.` : "Produkcja w toku.",
      primaryAction: {
        kind: "continue_production",
        label: "Kontynuuj produkcję",
      },
      severity: "primary",
      tone: "primary",
      progressMeaning: productionProgress,
      dashboardBucket: "in_progress",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  if (erp) {
    return {
      currentStep: "READY_TO_START",
      businessLabel: "Pobierz komponenty",
      description: "Przejdź do realizacji papierowej.",
      primaryAction: {
        kind: "continue_production",
        label: "Przejdź do realizacji",
      },
      severity: "primary",
      tone: "primary",
      progressMeaning: productionProgress,
      dashboardBucket: "todo",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  if (input.isReleasedToWms) {
    return {
      currentStep: "READY_TO_START",
      businessLabel: "Pobierz komponenty",
      description: "Zlecenie czeka na pobranie komponentów.",
      primaryAction: {
        kind: "start_collecting",
        label: "Rozpocznij zbieranie",
        href: wmsHref(input, "collecting"),
        openInNewTab: true,
      },
      severity: "primary",
      tone: "primary",
      progressMeaning: buildProgress("Produkcja", produced, planned),
      dashboardBucket: "todo",
      skipsPutaway,
      isDelayed: delayed,
    };
  }

  // Opóźnione zaplanowane bez braków → REACTION, ale etap pozostaje „Przekaż do realizacji”
  if (delayed) {
    return {
      currentStep: "READY_TO_START",
      businessLabel: "Przekaż do realizacji",
      description: "Termin minął — wyślij do realizacji.",
      primaryAction: {
        kind: "send_to_execution",
        label: "Wyślij do realizacji",
        disabled: Boolean(input.hasShortages),
        disabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
      },
      severity: "warning",
      tone: "warning",
      progressMeaning: productionProgress,
      dashboardBucket: "reaction",
      skipsPutaway,
      isDelayed: true,
    };
  }

  // planned / draft — jeszcze niewydane do WMS
  return {
    currentStep: "READY_TO_START",
    businessLabel: "Przekaż do realizacji",
    description: "Materiały są dostępne. Zlecenie może zostać przekazane do realizacji.",
    primaryAction: {
      kind: "send_to_execution",
      label: "Wyślij do realizacji",
      disabled: Boolean(input.hasShortages),
      disabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
    },
    severity: "primary",
    tone: severityTone("primary"),
    progressMeaning: productionProgress,
    dashboardBucket: "todo",
    skipsPutaway,
    isDelayed: false,
  };
}

export function resolveProductionSecondaryActions(
  input: ProductionOperationalStateInput,
  state: ProductionOperationalState,
): ProductionSecondaryAction[] {
  const status = statusKey(input.status);
  const terminal = status === "completed" || status === "cancelled";
  const print = isPrintMethod(input);
  const erp = Boolean(input.isErpInterface);
  const out: ProductionSecondaryAction[] = [];

  if (!terminal) {
    out.push({ id: "print_card", label: print ? "Podgląd karty" : "Drukuj kartę" });
  }

  if (
    !terminal &&
    !print &&
    !erp &&
    !input.isReleasedToWms &&
    (status === "draft" || status === "planned") &&
    state.primaryAction.kind === "send_to_execution"
  ) {
    out.push({
      id: "start_paper",
      label: "Realizacja papierowa",
      disabled: Boolean(input.hasShortages),
    });
  }

  if (
    !terminal &&
    (erp || print) &&
    ["collecting", "in_progress", "awaiting_putaway", "putaway"].includes(status)
  ) {
    out.push({ id: "open_erp", label: "Otwórz realizację papierową" });
  }

  if (
    !terminal &&
    !erp &&
    !print &&
    input.isReleasedToWms &&
    !["start_collecting", "continue_collecting", "continue_production", "putaway"].includes(
      state.primaryAction.kind,
    )
  ) {
    out.push({ id: "open_wms", label: "Otwórz terminal WMS" });
  }

  if (!terminal && !["awaiting_putaway", "putaway"].includes(status)) {
    out.push({ id: "cancel", label: "Anuluj zlecenie", danger: true });
  }

  return out;
}

/** ORDERS summary: „6 zamówień · 18 szt.” */
export function productionOrdersSourceSummary(input: {
  sourceOrderCount?: number;
  sourceRequestedQuantityTotal?: number;
  plannedQuantity?: number;
}): string | null {
  const orders = Number(input.sourceOrderCount ?? 0);
  if (orders <= 0) return null;
  const qty =
    Number(input.sourceRequestedQuantityTotal ?? 0) > 0
      ? Number(input.sourceRequestedQuantityTotal)
      : Number(input.plannedQuantity ?? 0);
  const orderWord =
    orders === 1 ? "zamówienie" : orders >= 2 && orders <= 4 ? "zamówienia" : "zamówień";
  return `${orders} ${orderWord}${qty > 0 ? ` · ${fmtQty(qty)} szt.` : ""}`;
}

export function productionSourceTypeLabel(sourceType?: string | null): string {
  switch (String(sourceType || "").toUpperCase()) {
    case "ORDERS":
      return "Na zamówienia";
    case "PLANNING":
      return "Na magazyn";
    case "MANUAL":
      return "Ręczne";
    default:
      return "Zlecenie";
  }
}
