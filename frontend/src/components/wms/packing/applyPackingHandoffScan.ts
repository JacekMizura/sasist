import type { NavigateFunction } from "react-router-dom";

import { playScanBeep } from "../../../utils/playScanBeep";
import {
  loadWmsPackingSession,
  patchWmsPackingSession,
  saveWmsPackingSession,
  type WmsPackingSessionState,
} from "../../../pages/wms/wmsPackingSession";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import type { PackingHandoffScanOk } from "./resolvePackingHandoffScan";

/** Persist session from a successful handoff scan and navigate to packing UI. */
export function applyPackingHandoffScanResult(opts: {
  result: PackingHandoffScanOk;
  navigate: NavigateFunction;
  appendScanToHistory?: (code: string) => void;
  /** When session was just created (status auto-bind), pass full base state. */
  sessionBase?: WmsPackingSessionState | null;
}): void {
  const { result, navigate, appendScanToHistory, sessionBase } = opts;
  if (sessionBase) {
    saveWmsPackingSession(sessionBase);
  }
  const cur = loadWmsPackingSession();
  if (!cur) return;

  playScanBeep();
  if (result.scannedCode) appendScanToHistory?.(result.scannedCode);

  if (result.kind === "open_order") {
    patchWmsPackingSession({
      mode: "baskets",
      orderTypeFilter: "all",
      cartId: result.cartId,
      cartCode: result.cartCode,
      cartType: result.cartType,
    });
    navigate(WMS_ROUTES.packingOrder(result.orderId), { replace: true });
    return;
  }

  patchWmsPackingSession({
    mode: result.mode,
    orderTypeFilter: "all",
    cartId: result.cartId,
    cartCode: result.cartCode,
    cartType: result.cartType,
  });
  navigate(WMS_ROUTES.packingOrders, { replace: true });
}

/** Prefer status named „Pakowanie”, else first IN_PROGRESS, else first row. */
export function pickPreferredPackingStatus<
  T extends { status: string; main_group: string; target_status_id: number },
>(rows: T[]): T | null {
  if (!rows.length) return null;
  const byName = rows.find((r) => /pakowanie/i.test(String(r.status || "")));
  if (byName) return byName;
  const inProg = rows.find((r) => String(r.main_group || "").toUpperCase() === "IN_PROGRESS");
  return inProg ?? rows[0] ?? null;
}

export function isPackingNamedStatus(statusName: string): boolean {
  return /pakowanie/i.test(String(statusName || "").trim());
}
