/**
 * Unified packing handoff scan: cart (BULK/MULTI) or basket → packing session.
 * Reuses resolve-cart, start-cart, baskets/{code}/order, packing/orders — no parallel assignment.
 */
import axios from "axios";

import {
  getWmsBasketPackingOrder,
  getWmsPackingOrders,
  wmsPackingApiErrorCode,
  wmsPackingApiErrorMessage,
} from "../../../api/wmsPackingApi";
import {
  getWmsPickingResolveCart,
  postWmsPackingStartCart,
  type WmsPickingResolveCartResponseApi,
} from "../../../api/wmsPickingProductsApi";
import { classifyWmsScanCode } from "../../../utils/wmsScanClassify";
import { normalizeScanEan } from "../../../utils/wmsScanNormalize";
import type { WmsPackingMode } from "../../../pages/wms/wmsPackingSession";
import { scanErrorMessage } from "./packingHelpers";

export type PackingHandoffScanOk =
  | {
      kind: "open_order";
      orderId: number;
      mode: "baskets";
      cartId?: number;
      cartCode?: string;
      cartType?: string;
      scannedCode: string;
    }
  | {
      kind: "open_orders_list";
      mode: "bulk" | "baskets";
      cartId: number;
      cartCode: string;
      cartType: string;
      orderCount: number;
      scannedCode: string;
    };

export type PackingHandoffScanResult =
  | PackingHandoffScanOk
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string };

function cartModeFromType(cartType: string | null | undefined): "bulk" | "baskets" | null {
  const t = (cartType || "").trim().toLowerCase();
  if (t === "bulk") return "bulk";
  if (t === "multi") return "baskets";
  return null;
}

async function tryBasket(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  scan: string,
): Promise<PackingHandoffScanResult | null> {
  try {
    const br = await getWmsBasketPackingOrder(tenantId, warehouseId, statusId, scan);
    if (!br?.order_id || !Number.isFinite(br.order_id) || br.order_id < 1) {
      return {
        kind: "empty",
        message: "Do tego koszyka nie przypisano żadnego zamówienia.",
      };
    }
    return {
      kind: "open_order",
      orderId: Math.floor(Number(br.order_id)),
      mode: "baskets",
      scannedCode: scan,
    };
  } catch (e) {
    const code = wmsPackingApiErrorCode(e);
    if (code === "BASKET_EMPTY") {
      return {
        kind: "empty",
        message: "Do tego koszyka nie przypisano żadnego zamówienia.",
      };
    }
    if (code === "BASKET_NOT_FOUND" || code === "AMBIGUOUS_BASKET_CODE") {
      return null; // fall through — may be a cart code
    }
    if (code === "BASKET_ORDER_NOT_IN_QUEUE") {
      return {
        kind: "error",
        message:
          wmsPackingApiErrorMessage(e) ||
          scanErrorMessage(code) ||
          "Zamówienie z tego koszyka nie jest w kolejce pakowania.",
      };
    }
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      return null;
    }
    return {
      kind: "error",
      message: wmsPackingApiErrorMessage(e) || scanErrorMessage(code) || "Nie rozpoznano koszyka.",
    };
  }
}

async function finishCart(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  scan: string,
  r: WmsPickingResolveCartResponseApi,
): Promise<PackingHandoffScanResult> {
  const mode = cartModeFromType(r.cart_type);
  if (mode == null) {
    return {
      kind: "error",
      message: "Ten wózek nie jest typu BULK ani MULTI — nie można rozpocząć pakowania ze skanu.",
    };
  }
  try {
    await postWmsPackingStartCart(tenantId, warehouseId, r.cart_id);
  } catch {
    /* already PACKING / READY — continue with existing state */
  }
  const code = (r.code && r.code.trim()) || r.barcode?.trim() || scan;
  const orders = await getWmsPackingOrders(tenantId, warehouseId, statusId, mode, r.cart_id, "all");
  if (!orders.length) {
    return {
      kind: "empty",
      message: "Do tego wózka nie przypisano żadnego zamówienia.",
    };
  }
  return {
    kind: "open_orders_list",
    mode,
    cartId: Math.floor(Number(r.cart_id)),
    cartCode: code,
    cartType: (r.cart_type ?? "").trim() || (mode === "bulk" ? "BULK" : "MULTI"),
    orderCount: orders.length,
    scannedCode: scan,
  };
}

async function tryCart(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  scan: string,
): Promise<PackingHandoffScanResult | null> {
  try {
    const r = await getWmsPickingResolveCart(tenantId, warehouseId, scan);
    return finishCart(tenantId, warehouseId, statusId, scan, r);
  } catch (e) {
    if (axios.isAxiosError(e) && e.response != null && e.response.status >= 500) {
      return { kind: "error", message: "Błąd serwera przy rozpoznawaniu wózka." };
    }
    return null;
  }
}

/**
 * Resolve a packing handoff scan without forcing the operator to pick bulk vs baskets first.
 */
export async function resolvePackingHandoffScan(opts: {
  tenantId: number;
  warehouseId: number;
  statusId: number;
  raw: string;
}): Promise<PackingHandoffScanResult> {
  const scan = normalizeScanEan(opts.raw);
  if (!scan) {
    return { kind: "error", message: "Pusty kod skanu." };
  }
  const kind = classifyWmsScanCode(scan);
  if (kind === "ean_gtin") {
    return {
      kind: "error",
      message: "Zeskanowano produkt — najpierw wejdź w wózek/koszyk albo listę zamówień.",
    };
  }

  const { tenantId, warehouseId, statusId } = opts;

  if (kind === "basket_like") {
    const basket = await tryBasket(tenantId, warehouseId, statusId, scan);
    if (basket) return basket;
    const cart = await tryCart(tenantId, warehouseId, statusId, scan);
    if (cart) return cart;
    return { kind: "error", message: "Nie rozpoznano koszyka ani wózka — sprawdź kod." };
  }

  if (kind === "cart_like") {
    const cart = await tryCart(tenantId, warehouseId, statusId, scan);
    if (cart) return cart;
    const basket = await tryBasket(tenantId, warehouseId, statusId, scan);
    if (basket) return basket;
    return { kind: "error", message: "Nie rozpoznano wózka — sprawdź kod." };
  }

  // generic / location-like: try cart then basket (cart codes without CART- prefix)
  const cart = await tryCart(tenantId, warehouseId, statusId, scan);
  if (cart) return cart;
  const basket = await tryBasket(tenantId, warehouseId, statusId, scan);
  if (basket) return basket;
  return {
    kind: "error",
    message: "Nie rozpoznano wózka ani koszyka — sprawdź kod.",
  };
}

export function packingModeFromHandoffResult(
  result: PackingHandoffScanOk,
): Extract<WmsPackingMode, "bulk" | "baskets"> {
  return result.mode;
}
