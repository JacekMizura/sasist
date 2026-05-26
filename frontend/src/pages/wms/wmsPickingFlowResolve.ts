import type { PickingFlowMode, WmsPickingFlowConfig } from "../../api/wmsPickingEntryApi";
import type { WmsPickingOrderTypeChoice, WmsPickingSessionState } from "./wmsPickingFlowTypes";
import { WMS_ROUTES } from "./wmsRoutes";

/** Skan wózka: tryby wymagające przypisania wózka (lub koszyków na wózku). */
export function modeRequiresCartScan(mode: PickingFlowMode): boolean {
  return mode === "cart_scan" || mode === "baskets";
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

/** Gdy single === multi: czy pokazać ekran skanu wózka. */
export function needsCartWhenModesEqual(mode: PickingFlowMode): boolean {
  return modeRequiresCartScan(mode);
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

export function resolveAfterStatusWithConfig(session: WmsPickingSessionState): PickingFlowNavigateTarget {
  const sm = session.singleMode;
  const mm = session.multiMode;
  if (sm == null || mm == null) {
    return {
      path: WMS_ROUTES.pickingProducts,
      state: {
        pickingSession: { ...session, cartCode: null, cartName: null, cartId: null, preCartBack: "status" },
      },
    };
  }
  if (sm !== mm) {
    return {
      path: WMS_ROUTES.pickingOrderType,
      state: { pickingSession: session },
    };
  }
  if (needsCartWhenModesEqual(sm)) {
    return {
      path: WMS_ROUTES.pickingCart,
      state: { pickingSession: { ...session, preCartBack: "status" } },
    };
  }
  return {
    path: WMS_ROUTES.pickingProducts,
    state: { pickingSession: { ...session, cartCode: null, cartName: null, cartId: null } },
  };
}

export function resolveAfterOrderTypeChoice(
  session: WmsPickingSessionState,
  choice: WmsPickingOrderTypeChoice,
): PickingFlowNavigateTarget {
  const sm = session.singleMode;
  const mm = session.multiMode;
  if (sm == null || mm == null) {
    return {
      path: WMS_ROUTES.pickingProducts,
      state: { pickingSession: { ...session, orderTypeChoice: choice } },
    };
  }
  const needCart = needsCartAfterOrderTypeChoice(sm, mm, choice);
  const next: WmsPickingSessionState = {
    ...session,
    orderTypeChoice: choice,
    cartCode: needCart ? session.cartCode : null,
    cartName: needCart ? session.cartName : null,
    cartId: needCart ? session.cartId : null,
  };
  if (needCart) {
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
