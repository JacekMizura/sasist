/**
 * Picking start flow navigation — STATUS → order type → cart (if needed) → products.
 * Driven by warehouse picking_config modes (single_mode / multi_mode).
 */

import type { PickingFlowMode, WmsPickingFlowConfig } from "../../api/wmsPickingEntryApi";
import type { WmsPickingOrderTypeChoice, WmsPickingSessionState } from "./wmsPickingFlowTypes";
import { cartTypeMatchesPickingTile } from "./wmsPickingCartTypeMatch";
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

export function cartTypeHintForOrderTypeChoice(
  singleMode: PickingFlowMode,
  multiMode: PickingFlowMode,
  choice: WmsPickingOrderTypeChoice,
): "BULK" | "BASKETS" | null {
  if (choice === "single") return cartTypeHintForMode(singleMode);
  if (choice === "multi") return cartTypeHintForMode(multiMode);
  const a = cartTypeHintForMode(singleMode);
  const b = cartTypeHintForMode(multiMode);
  if (a === "BASKETS" || b === "BASKETS") return "BASKETS";
  if (a === "BULK" || b === "BULK") return "BULK";
  return null;
}

export function needsCartAfterOrderTypeChoice(
  singleMode: PickingFlowMode,
  multiMode: PickingFlowMode,
  choice: WmsPickingOrderTypeChoice,
): boolean {
  if (choice === "single") return modeRequiresCartScan(singleMode);
  if (choice === "multi") return modeRequiresCartScan(multiMode);
  return modeRequiresCartScan(singleMode) || modeRequiresCartScan(multiMode);
}

/**
 * „Wszystkie” tylko gdy obie ścieżki mają ten sam rodzaj bramki startu
 * (obie wymagają skanu wózka albo obie go nie wymagają) — wspólna tura.
 */
export function canOfferAllOrderTypes(
  singleMode: PickingFlowMode | null | undefined,
  multiMode: PickingFlowMode | null | undefined,
): boolean {
  if (singleMode == null || multiMode == null) return false;
  return modeRequiresCartScan(singleMode) === modeRequiresCartScan(multiMode);
}

/** Które kafelki pokazać na ekranie „Wybierz” — SSOT z konfiguracji trybów. */
export function visibleOrderTypeChoices(
  singleMode: PickingFlowMode | null | undefined,
  multiMode: PickingFlowMode | null | undefined,
): WmsPickingOrderTypeChoice[] {
  const out: WmsPickingOrderTypeChoice[] = [];
  if (singleMode != null) out.push("single");
  if (multiMode != null) out.push("multi");
  if (canOfferAllOrderTypes(singleMode, multiMode)) out.push("all");
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
    | "singleMode"
    | "multiMode"
    | "limitsSingle"
    | "limitsMulti"
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
    singleMode: cfg.single_mode,
    multiMode: cfg.multi_mode,
    limitsSingle: cfg.limits.single ?? undefined,
    limitsMulti: cfg.limits.multi ?? undefined,
  };
}

/** Po kafelku statusu — zawsze ekran wyboru typu (konfiguracja decyduje o dostępnych opcjach). */
export function resolveAfterStatusWithConfig(session: WmsPickingSessionState): PickingFlowNavigateTarget {
  const sm = session.singleMode;
  const mm = session.multiMode;
  if (sm == null && mm == null) {
    return {
      path: WMS_ROUTES.pickingProducts,
      state: {
        pickingSession: {
          ...session,
          cartCode: null,
          cartName: null,
          cartId: null,
          orderTypeChoice: "all",
          preCartBack: "status",
        },
      },
    };
  }
  return {
    path: WMS_ROUTES.pickingOrderType,
    state: { pickingSession: session },
  };
}

function sessionHasMatchingCart(
  session: WmsPickingSessionState,
  tileType: "BULK" | "BASKETS" | null,
): boolean {
  if (session.cartId == null || session.cartId <= 0) return false;
  if (!tileType) return true;
  return cartTypeMatchesPickingTile(tileType, session.physicalCartType);
}

export function resolveAfterOrderTypeChoice(
  session: WmsPickingSessionState,
  choice: WmsPickingOrderTypeChoice,
): PickingFlowNavigateTarget {
  const sm = session.singleMode;
  const mm = session.multiMode;
  const modeForCartHint =
    choice === "single" ? sm : choice === "multi" ? mm : sm ?? mm;
  const needCart =
    sm != null && mm != null
      ? needsCartAfterOrderTypeChoice(sm, mm, choice)
      : modeForCartHint != null
        ? modeRequiresCartScan(modeForCartHint)
        : false;
  const cartType =
    sm != null && mm != null
      ? cartTypeHintForOrderTypeChoice(sm, mm, choice)
      : modeForCartHint != null
        ? cartTypeHintForMode(modeForCartHint)
        : null;
  const next: WmsPickingSessionState = {
    ...session,
    orderTypeChoice: choice,
    requireCart: needCart,
    cartType,
    cartCode: needCart ? session.cartCode : null,
    cartName: needCart ? session.cartName : null,
    cartId: needCart ? session.cartId : null,
    physicalCartType: needCart ? session.physicalCartType : null,
  };
  if (needCart) {
    // Już przypisany wózek zgodny z trybem — bez ponownego skanu.
    if (sessionHasMatchingCart(next, cartType)) {
      return {
        path: WMS_ROUTES.pickingProducts,
        state: { pickingSession: { ...next, preCartBack: "order-type" } },
      };
    }
    return {
      path: WMS_ROUTES.pickingCart,
      state: { pickingSession: { ...next, preCartBack: "order-type" } },
    };
  }
  return {
    path: WMS_ROUTES.pickingProducts,
    state: { pickingSession: next },
  };
}
