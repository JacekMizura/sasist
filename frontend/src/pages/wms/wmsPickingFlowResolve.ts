/**
 * Picking start flow navigation — STATUS → order type → cart (if needed) → products.
 * Driven by warehouse picking_config modes (single_mode / multi_mode / all_mode).
 */

import type { PickingFlowMode, WmsPickingFlowConfig } from "../../api/wmsPickingEntryApi";
import type { WmsPickingOrderTypeChoice, WmsPickingSessionState } from "./wmsPickingFlowTypes";
import { WMS_ROUTES } from "./wmsRoutes";

/** Skan wózka: tryby wymagające fizycznego przypisania wózka (lub koszyków). */
export function modeRequiresCartScan(mode: PickingFlowMode): boolean {
  return mode === "cart_scan" || mode === "baskets";
}

/** Hint ikony / copy na ekranie skanu — z trybu flow (nie z kafelka statusu). */
export function cartTypeHintForMode(mode: PickingFlowMode): "BULK" | "BASKETS" | null {
  if (mode === "baskets") return "BASKETS";
  if (mode === "cart_scan") return "BULK";
  return null;
}

export function modeForOrderTypeChoice(
  session: Pick<WmsPickingSessionState, "singleMode" | "multiMode" | "allMode">,
  choice: WmsPickingOrderTypeChoice,
): PickingFlowMode | null | undefined {
  if (choice === "single") return session.singleMode;
  if (choice === "multi") return session.multiMode;
  return session.allMode ?? null;
}

export function cartTypeHintForOrderTypeChoice(
  singleMode: PickingFlowMode,
  multiMode: PickingFlowMode,
  choice: WmsPickingOrderTypeChoice,
  allMode?: PickingFlowMode | null,
): "BULK" | "BASKETS" | null {
  if (choice === "single") return cartTypeHintForMode(singleMode);
  if (choice === "multi") return cartTypeHintForMode(multiMode);
  if (allMode != null) return cartTypeHintForMode(allMode);
  // Legacy fallback gdy brak all_mode w sesji
  const a = cartTypeHintForMode(singleMode);
  const b = cartTypeHintForMode(multiMode);
  if (a != null && a === b) return a;
  return null;
}

export function needsCartAfterOrderTypeChoice(
  singleMode: PickingFlowMode,
  multiMode: PickingFlowMode,
  choice: WmsPickingOrderTypeChoice,
  allMode?: PickingFlowMode | null,
): boolean {
  if (choice === "single") return modeRequiresCartScan(singleMode);
  if (choice === "multi") return modeRequiresCartScan(multiMode);
  if (allMode != null) return modeRequiresCartScan(allMode);
  return modeRequiresCartScan(singleMode) || modeRequiresCartScan(multiMode);
}

/**
 * @deprecated „Wszystkie” jest zawsze oferowane przy skonfigurowanych single+multi —
 * bramka cart pochodzi wyłącznie z ``all_mode``.
 */
export function canOfferAllOrderTypes(
  singleMode: PickingFlowMode | null | undefined,
  multiMode: PickingFlowMode | null | undefined,
  _allMode?: PickingFlowMode | null | undefined,
): boolean {
  return singleMode != null && multiMode != null;
}

/** Które kafelki pokazać na ekranie „Wybierz” — SSOT z konfiguracji trybów. */
export function visibleOrderTypeChoices(
  singleMode: PickingFlowMode | null | undefined,
  multiMode: PickingFlowMode | null | undefined,
  allMode?: PickingFlowMode | null | undefined,
): WmsPickingOrderTypeChoice[] {
  const out: WmsPickingOrderTypeChoice[] = [];
  if (singleMode != null) out.push("single");
  if (multiMode != null) out.push("multi");
  if (allMode != null || (singleMode != null && multiMode != null)) out.push("all");
  return out;
}

export type PickingFlowNavigateTarget = {
  path: string;
  state: { pickingSession: WmsPickingSessionState };
};

export function sessionWithPickingFlowConfig(
  base: Omit<
    WmsPickingSessionState,
    | "targetStatusId"
    | "strategy"
    | "pickUnit"
    | "orderSort"
    | "allOrderSort"
    | "singleMode"
    | "multiMode"
    | "allMode"
    | "limitsSingle"
    | "limitsMulti"
    | "limitsAll"
    | "orderTypeChoice"
    | "preCartBack"
    | "requireCart"
    | "cartType"
  >,
  cfg: WmsPickingFlowConfig,
): WmsPickingSessionState {
  return {
    ...base,
    targetStatusId: cfg.target_status_id,
    strategy: cfg.strategy,
    pickUnit: cfg.pick_unit,
    orderSort: cfg.order_sort,
    allOrderSort: cfg.all_order_sort,
    singleMode: cfg.single_mode,
    multiMode: cfg.multi_mode,
    allMode: cfg.all_mode,
    limitsSingle: cfg.limits.single ?? undefined,
    limitsMulti: cfg.limits.multi ?? undefined,
    limitsAll: cfg.limits.all ?? undefined,
  };
}

export function explicitOrderTypeChoice(
  raw: string | null | undefined,
): WmsPickingOrderTypeChoice | null {
  if (raw === "single" || raw === "multi" || raw === "all") return raw;
  return null;
}

/**
 * Resume only when the operator already started a tour with a concrete order_type
 * and a session identity (cart or cartless session id).
 */
export function canResumePickingSession(session: WmsPickingSessionState): boolean {
  if (explicitOrderTypeChoice(session.orderTypeChoice) == null) return false;
  const hasCart = session.cartId != null && session.cartId > 0;
  const hasCartless =
    session.cartless === true ||
    (session.pickingSessionId != null && session.pickingSessionId > 0);
  return hasCart || hasCartless;
}

/** Strip execution identity — used when starting a NEW tour at order-type. */
export function clearPickingSessionExecution(session: WmsPickingSessionState): WmsPickingSessionState {
  return {
    ...session,
    cartCode: null,
    cartName: null,
    cartId: null,
    physicalCartType: null,
    pickingSessionId: null,
    cartless: undefined,
    orderTypeChoice: undefined,
    assignEmptyMessage: null,
  };
}

/**
 * Po kafelku statusu:
 * - wznowienie aktywnej sesji (order_type + cart/cartless) → lista produktów,
 * - nowa tura → ZAWSZE ekran wyboru rodzaju (gdy tryby skonfigurowane).
 */
export function resolveAfterStatusWithConfig(session: WmsPickingSessionState): PickingFlowNavigateTarget {
  const sm = session.singleMode;
  const mm = session.multiMode;

  if (canResumePickingSession(session)) {
    const ot = explicitOrderTypeChoice(session.orderTypeChoice)!;
    const hasCart = session.cartId != null && session.cartId > 0;
    return {
      path: WMS_ROUTES.pickingProducts,
      state: {
        pickingSession: {
          ...session,
          orderTypeChoice: ot,
          requireCart: hasCart ? true : session.requireCart,
          preCartBack: "status",
        },
      },
    };
  }

  if (sm == null && mm == null) {
    return {
      path: WMS_ROUTES.pickingProducts,
      state: {
        pickingSession: {
          ...clearPickingSessionExecution(session),
          preCartBack: "status",
        },
      },
    };
  }

  return {
    path: WMS_ROUTES.pickingOrderType,
    state: {
      pickingSession: {
        ...clearPickingSessionExecution(session),
        singleMode: sm,
        multiMode: mm,
        allMode: session.allMode,
        allOrderSort: session.allOrderSort,
      },
    },
  };
}

/**
 * Po wyborze rodzaju:
 * - wymaga wózka → modal skanu (NIGDY nie pomijaj przez wolny/stary wózek),
 * - bez wózka → lista produktów.
 * Dla ``all`` używa wyłącznie ``allMode`` / ``allOrderSort``.
 */
export function resolveAfterOrderTypeChoice(
  session: WmsPickingSessionState,
  choice: WmsPickingOrderTypeChoice,
): PickingFlowNavigateTarget {
  const sm = session.singleMode;
  const mm = session.multiMode;
  const am = session.allMode;
  const needCart =
    sm != null && mm != null
      ? needsCartAfterOrderTypeChoice(sm, mm, choice, am)
      : (() => {
          const mode = modeForOrderTypeChoice(session, choice);
          return mode != null ? modeRequiresCartScan(mode) : false;
        })();
  const cartType =
    sm != null && mm != null
      ? cartTypeHintForOrderTypeChoice(sm, mm, choice, am)
      : (() => {
          const mode = modeForOrderTypeChoice(session, choice);
          return mode != null ? cartTypeHintForMode(mode) : null;
        })();

  const tourOrderSort =
    choice === "all" ? (session.allOrderSort ?? session.orderSort) : session.orderSort;

  const next: WmsPickingSessionState = {
    ...session,
    orderTypeChoice: choice,
    orderSort: tourOrderSort,
    requireCart: needCart,
    cartType,
    // Order-type choice always starts clean execution for this tour.
    cartCode: null,
    cartName: null,
    cartId: null,
    physicalCartType: null,
    pickingSessionId: null,
    cartless: needCart ? false : true,
  };

  if (needCart) {
    return {
      path: WMS_ROUTES.pickingCart,
      state: { pickingSession: { ...next, cartless: false, preCartBack: "order-type" } },
    };
  }

  return {
    path: WMS_ROUTES.pickingProducts,
    state: { pickingSession: { ...next, cartless: true } },
  };
}
