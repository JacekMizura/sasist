/**
 * SSOT for Production UX: one primary “what next?” action + contextual message.
 * Backend statuses/enums stay unchanged — presentation only.
 */
import type { StatusTone } from "@/design-system";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { START_COLLECTING_BLOCKED_TOOLTIP } from "./productionUi";

export type ProductionNextActionKind =
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

export type ProductionSecondaryActionId =
  | "print_card"
  | "start_paper"
  | "open_erp"
  | "open_wms"
  | "cancel"
  | "preview_print";

export type ProductionExecutionKindUi = "order" | "batch";

export type ProductionNextActionInput = {
  executionKind: ProductionExecutionKindUi;
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
  sourceOrderCount?: number;
  sourceRequestedQuantityTotal?: number;
  sourceShortageQuantityTotal?: number;
  sourceShortageCount?: number;
  sourceFulfilledOrderCount?: number;
  /** First missing component name for richer shortage copy (optional). */
  shortageComponentHint?: string | null;
};

export type ProductionNextAction = {
  kind: ProductionNextActionKind;
  label: string;
  contextMessage: string;
  tone: StatusTone;
  disabled?: boolean;
  disabledReason?: string;
  /** Navigate href when action is a link (WMS / packing / shortages / detail). */
  href?: string;
  openInNewTab?: boolean;
};

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

function isPrintMethod(input: ProductionNextActionInput): boolean {
  return (
    String(input.sourceType || "").toUpperCase() === "ORDERS" &&
    String(input.productionExecutionMethod || "").toUpperCase() === "PRINT"
  );
}

function printStarted(input: ProductionNextActionInput): boolean {
  const s = statusKey(input.status);
  return Boolean(
    input.isPrintInterface ||
      ["collecting", "in_progress", "awaiting_putaway", "putaway", "completed"].includes(s),
  );
}

function wmsHref(input: ProductionNextActionInput, phase: "collecting" | "execute" | "putaway"): string {
  return wmsProductionPaths[phase](input.executionKind, input.id);
}

function detailHref(input: ProductionNextActionInput): string {
  return input.executionKind === "order"
    ? erpProductionPaths.order(input.id)
    : erpProductionPaths.batch(input.id);
}

function packingHref(): string {
  return "/wms/packing/orders";
}

function shortagesHref(): string {
  return erpProductionPaths.materialsShortages;
}

/**
 * Resolve the single primary “Co dalej?” action for a production order/batch.
 */
export function resolveProductionNextAction(input: ProductionNextActionInput): ProductionNextAction {
  const status = statusKey(input.status);
  const produced = Number(input.producedQuantity ?? 0);
  const planned = Number(input.plannedQuantity ?? 0);
  const isOrders = String(input.sourceType || "").toUpperCase() === "ORDERS";
  const shortageQty = Number(input.sourceShortageQuantityTotal ?? 0);
  const shortageCount = Number(input.sourceShortageCount ?? 0);
  const fulfilledOrders = Number(input.sourceFulfilledOrderCount ?? 0);
  const print = isPrintMethod(input);
  const erp = Boolean(input.isErpInterface);

  if (status === "cancelled") {
    return {
      kind: "view_details",
      label: "Zobacz szczegóły",
      contextMessage: "Zlecenie zostało anulowane.",
      tone: "danger",
      href: detailHref(input),
    };
  }

  if (status === "completed") {
    if (isOrders && fulfilledOrders > 0) {
      return {
        kind: "go_packing",
        label: "Przejdź do pakowania",
        contextMessage: "Produkcja zakończona — zamówienia są gotowe do pakowania.",
        tone: "success",
        href: packingHref(),
        openInNewTab: true,
      };
    }
    return {
      kind: "view_details",
      label: "Zobacz szczegóły",
      contextMessage: "Zlecenie produkcyjne jest zakończone.",
      tone: "success",
      href: detailHref(input),
    };
  }

  if (status === "awaiting_putaway" || status === "putaway") {
    return {
      kind: "putaway",
      label: "Rozlokuj",
      contextMessage:
        status === "putaway"
          ? "Rozlokowanie w toku — dokończ odłożenie produktu."
          : "Produkcja zakończona — produkt czeka na rozlokowanie.",
      tone: "info",
      href: erp ? undefined : wmsHref(input, "putaway"),
      openInNewTab: !erp,
    };
  }

  if (status === "collecting") {
    return {
      kind: "continue_collecting",
      label: "Kontynuuj zbieranie",
      contextMessage: "Najpierw należy pobrać komponenty.",
      tone: "primary",
      href: erp ? undefined : wmsHref(input, "collecting"),
      openInNewTab: !erp,
    };
  }

  if (status === "in_progress") {
    const progress =
      planned > 0
        ? `Produkcja trwa — wyprodukowano ${fmtQty(produced)} z ${fmtQty(planned)} szt.`
        : "Produkcja trwa.";
    return {
      kind: "continue_production",
      label: "Kontynuuj produkcję",
      contextMessage: progress,
      tone: "primary",
      href: erp ? undefined : wmsHref(input, "execute"),
      openInNewTab: !erp,
    };
  }

  // draft / planned (and any unexpected pre-start status)
  const blockedByShortage = Boolean(input.hasShortages) || shortageCount > 0 || shortageQty > 0;
  if (blockedByShortage) {
    const hint = input.shortageComponentHint?.trim();
    const qtyPart =
      shortageQty > 0
        ? hint
          ? `Brakuje ${fmtQty(shortageQty)} szt. komponentu ${hint}.`
          : `Brakuje ${fmtQty(shortageQty)} szt. komponentów.`
        : hint
          ? `Brakuje komponentu ${hint}.`
          : "Brakuje komponentów do rozpoczęcia produkcji.";
    return {
      kind: "view_shortages",
      label: "Zobacz braki",
      contextMessage: qtyPart,
      tone: "warning",
      href: shortagesHref(),
    };
  }

  if (print && !printStarted(input)) {
    const canStart = Boolean(input.materialsReserved) && !input.hasShortages;
    return {
      kind: "start_print_execution",
      label: "Wydrukuj i rozpocznij",
      contextMessage: canStart
        ? "Zlecenie jest gotowe do realizacji — wydrukuj kartę i rozpocznij produkcję."
        : "Zarezerwuj komponenty przed rozpoczęciem produkcji z wydruku.",
      tone: canStart ? "primary" : "warning",
      disabled: !canStart,
      disabledReason: "Brak komponentów",
    };
  }

  if (print && printStarted(input)) {
    return {
      kind: "continue_production",
      label: "Kontynuuj produkcję",
      contextMessage:
        planned > 0
          ? `Produkcja trwa — wyprodukowano ${fmtQty(produced)} z ${fmtQty(planned)} szt.`
          : "Produkcja w toku (wydruk).",
      tone: "primary",
    };
  }

  if (erp) {
    return {
      kind: "continue_production",
      label: "Przejdź do realizacji",
      contextMessage: "Zlecenie jest w trybie papierowym — kontynuuj realizację.",
      tone: "primary",
    };
  }

  if (input.isReleasedToWms) {
    return {
      kind: "start_collecting",
      label: "Rozpocznij zbieranie",
      contextMessage: "Zlecenie jest gotowe do realizacji — rozpocznij pobieranie komponentów.",
      tone: "primary",
      href: wmsHref(input, "collecting"),
      openInNewTab: true,
    };
  }

  // Default planned/draft: one main path — send to WMS terminal
  return {
    kind: "send_to_execution",
    label: "Wyślij do realizacji",
    contextMessage: "Zlecenie jest gotowe do realizacji.",
    tone: "primary",
    disabled: Boolean(input.hasShortages),
    disabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
  };
}

/**
 * Secondary / overflow actions — never compete with the primary CTA.
 */
export function resolveProductionSecondaryActions(
  input: ProductionNextActionInput,
  primary: ProductionNextAction,
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
    primary.kind === "send_to_execution"
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
    primary.kind !== "start_collecting" &&
    primary.kind !== "continue_collecting" &&
    primary.kind !== "continue_production" &&
    primary.kind !== "putaway"
  ) {
    out.push({ id: "open_wms", label: "Otwórz terminal WMS" });
  }

  if (!terminal && !["awaiting_putaway", "putaway"].includes(status)) {
    out.push({ id: "cancel", label: "Anuluj zlecenie", danger: true });
  }

  return out;
}

/** Short stage label for lists / dashboard cards. */
export function productionStageLabel(status: string | null | undefined): string {
  switch (statusKey(status)) {
    case "draft":
    case "planned":
      return "Zaplanowane";
    case "collecting":
      return "Zbieranie";
    case "in_progress":
      return "Produkcja";
    case "awaiting_putaway":
      return "Do rozlokowania";
    case "putaway":
      return "Rozlokowanie";
    case "completed":
      return "Zakończone";
    case "cancelled":
      return "Anulowane";
    default:
      return status || "—";
  }
}

/** ORDERS summary line: „6 zamówień · 18 szt.” */
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
