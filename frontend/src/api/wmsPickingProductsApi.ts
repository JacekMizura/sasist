import axios from "axios";

import api from "./axios";

/** Zgodne z ``WmsPickingOrderTypeChoice`` w flow WMS. */
export type WmsPickingOrderTypeQuery = "single" | "multi" | "all";

export type WmsPickingProductPutHintApi = {
  label: string;
  quantity: number;
};

export type WmsPickingCohortMissingLineApi = {
  order_id: number;
  order_number: string;
  product_id: number;
  product_name: string;
  product_ean?: string | null;
  missing_quantity: number;
};

export type WmsPickingProductLineApi = {
  product_id: number;
  name: string;
  ean: string | null;
  image_url: string | null;
  total_quantity: number;
  picked_quantity: number;
  /** Suma zgłoszonych braków na liniach (w kohortcie) */
  missing_quantity?: number;
  /** max(0, wymagane − zebrano − brak) — jeszcze do pobrania z magazynu */
  remaining_to_pick?: number;
  /** Skan EAN tylko gdy true — linie nie „picked”/„missing” z ilością do pobrania (przy braku cart_id: wg remaining) */
  scanner_active?: boolean;
  primary_location_id?: number | null;
  primary_location_code: string;
  /** Stan fizyczny (Inventory) w lokalizacji głównej — nie ilość do pobrania */
  primary_location_stock?: number;
  locations?: Array<{ location_id: number; location_code?: string | null }>;
  extra_locations_count?: number;
  route_sort_key: string;
};

export type WmsPickingProductLinesResponseApi = {
  products: WmsPickingProductLineApi[];
  cohort_order_count?: number;
  cohort_missing_lines?: WmsPickingCohortMissingLineApi[];
  pick_list: unknown[];
  shortfalls: unknown[];
  warnings: string[];
  allow_continue_other_lines_after_shortage?: boolean;
};

export type WmsPickingProductLocationRowApi = {
  location_id: number;
  location_code: string;
  quantity: number;
  stock_quantity?: number;
  put_hints: WmsPickingProductPutHintApi[];
};

export type WmsPickingProductOrderRowApi = {
  order_id: number;
  order_number: string;
  quantity: number;
  picked_quantity: number;
  missing_quantity?: number;
  quantity_to_pick?: number;
  line_value: number | null;
  shipping_method_name?: string | null;
  shipping_method_logo_url?: string | null;
  /** Etykieta koszyka / slotu (MULTI), np. z nazwy koszyka */
  basket_slot: string | null;
  /** Ile szt. można jeszcze zgłosić jako brak sesji (zgodnie z backendem report-shortage). */
  shortage_declarable_qty?: number;
};

export type WmsPickingProductDetailApi = {
  product_id: number;
  name: string;
  ean: string | null;
  image_url: string | null;
  total_quantity: number;
  picked_quantity: number;
  missing_quantity?: number;
  remaining_to_pick?: number;
  locations: WmsPickingProductLocationRowApi[];
  orders: WmsPickingProductOrderRowApi[];
  /** Pierwsze zamówienie z niedoborem (FIFO) wśród orders — podświetlenie na UI */
  active_fifo_order_id: number | null;
  /** Wózek MULTI: gdzie odłożyć (etykieta koszyka) */
  put_to_basket_label: string | null;
  /** Indeks koszyka na wózku — spójny kolor z listą zamówień */
  put_to_basket_color_index: number;
  allow_continue_other_lines_after_shortage?: boolean;
  /** Suma shortage_declarable_qty po zamówieniach sesji — odblokowuje zgłoszenie gdy remaining_to_pick = 0. */
  shortage_declarable_total?: number;
};

export async function getWmsPickingProductLines(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  cartId?: number | null,
  recoveryOrderId?: number | null,
  orderIds?: number[] | null,
): Promise<WmsPickingProductLinesResponseApi> {
  const params: Record<string, string | number | number[]> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    source_status_id: sourceStatusId,
    order_type: orderType,
  };
  if (cartId != null && cartId > 0) {
    params.cart_id = cartId;
  }
  if (recoveryOrderId != null && recoveryOrderId > 0) {
    params.recovery_order_id = recoveryOrderId;
  }
  if (orderIds?.length) {
    params.order_ids_csv = orderIds.join(",");
  }
  const res = await api.get<WmsPickingProductLinesResponseApi>("/wms/picking/product-lines", { params });
  return res.data;
}

export async function getWmsPickingProductDetail(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  productId: number,
  cartId?: number | null,
  recoveryOrderId?: number | null,
  orderIds?: number[] | null,
): Promise<WmsPickingProductDetailApi> {
  const params: Record<string, string | number | number[]> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    source_status_id: sourceStatusId,
    order_type: orderType,
    product_id: productId,
  };
  if (cartId != null && cartId > 0) {
    params.cart_id = cartId;
  }
  if (recoveryOrderId != null && recoveryOrderId > 0) {
    params.recovery_order_id = recoveryOrderId;
  }
  if (orderIds?.length) {
    params.order_ids_csv = orderIds.join(",");
  }
  const res = await api.get<WmsPickingProductDetailApi>("/wms/picking/product-lines/detail", { params });
  return res.data;
}

export type WmsPickingFinalizeCartResponseApi = {
  ok: boolean;
  orders_updated: number;
  cart_id: number;
  target_status_id: number;
  cohort_shortage_product_count?: number;
  cohort_shortage_unit_total?: number;
  cohort_shortage_order_ids?: number[];
};

export type WmsPickingResolveCartResponseApi = {
  cart_id: number;
  name: string;
  code: string;
  barcode: string | null;
  /** Etykieta UI (nazwa wózka lub fallback id + wymiary). */
  display_name?: string;
  cart_type?: string | null;
};

export async function getWmsPickingResolveCart(
  tenantId: number,
  warehouseId: number,
  cartCode: string,
): Promise<WmsPickingResolveCartResponseApi> {
  const res = await api.get<WmsPickingResolveCartResponseApi>("/wms/picking/resolve-cart", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      cart_code: cartCode.trim(),
    },
  });
  return res.data;
}

export async function getWmsPickingDefaultCart(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPickingResolveCartResponseApi> {
  const res = await api.get<WmsPickingResolveCartResponseApi>("/wms/picking/default-cart", {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
    },
  });
  return res.data;
}

export type WmsPickingRecoveryFinalizeResponseApi = {
  ok: boolean;
  order_id: number;
  cart_id: number;
};

export async function postWmsPickingRecoveryFinalize(
  tenantId: number,
  warehouseId: number,
  orderId: number,
  cartId: number,
): Promise<WmsPickingRecoveryFinalizeResponseApi> {
  const res = await api.post<WmsPickingRecoveryFinalizeResponseApi>(
    "/wms/picking/recovery/finalize",
    { order_id: orderId, cart_id: cartId },
    { params: { tenant_id: tenantId, warehouse_id: warehouseId } },
  );
  return res.data;
}

export async function postWmsPickingFinalizeCart(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  cartId: number,
): Promise<WmsPickingFinalizeCartResponseApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    source_status_id: sourceStatusId,
    order_type: orderType,
    cart_id: cartId,
  };
  const res = await api.post<WmsPickingFinalizeCartResponseApi>("/wms/picking/finalize-cart", null, { params });
  return res.data;
}

export type WmsPickingReportShortageResponseApi = {
  ok: boolean;
  orders_updated: number;
  target_status_id: number | null;
  order_ids: number[];
  order_issue_task_ids?: number[];
  allow_continue_other_lines_after_shortage?: boolean;
};

export async function postWmsPickingReportShortage(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  body: {
    product_id: number;
    location_id?: number | null;
    missing_qty: number;
    cart_id: number;
    /** Zamówienia z widoku szczegółu (opcjonalnie — przecięcie z sesją wózka po stronie API) */
    order_ids?: number[] | null;
  },
): Promise<WmsPickingReportShortageResponseApi> {
  const res = await api.post<WmsPickingReportShortageResponseApi>("/wms/picking/report-shortage", body, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      source_status_id: sourceStatusId,
      order_type: orderType,
    },
  });
  return res.data;
}

/** Body for ``POST /wms/picking/quick-pick`` (JSON). Query: tenant_id, source_status_id, order_type; ``warehouse_id`` opcjonalne (backend wybiera z ``tenant_warehouses``). */
export type WmsPickingQuickPickBodyApi = {
  product_id: number;
  location_id: number;
  quantity: number;
  cart_id: number;
  recovery_order_id?: number | null;
};

function assertPositiveInt(name: string, v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error(`${name}: wymagana liczba całkowita ≥ 1`);
  }
  return n;
}

function assertPositiveQty(name: string, v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name}: wymagana liczba > 0`);
  }
  return n;
}

/** Czytelny komunikat z odpowiedzi FastAPI (``detail`` string | tablica walidacji). */
export function formatFastApiErrorDetail(data: unknown): string {
  if (data == null || typeof data !== "object") {
    return "Błąd walidacji.";
  }
  const detail = (data as { detail?: unknown }).detail;
  if (detail == null) {
    return "Błąd walidacji.";
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join(" ");
  }
  return String(detail);
}

export async function postWmsPickingQuickPick(
  tenantId: number,
  warehouseId: number | null | undefined,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  body: WmsPickingQuickPickBodyApi,
): Promise<{ ok: boolean; order_id: number; order_item_id: number }> {
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    throw new Error("tenant_id: wymagane ≥ 1");
  }
  if (
    warehouseId != null &&
    (!Number.isFinite(warehouseId) || warehouseId < 1 || !Number.isInteger(warehouseId))
  ) {
    throw new Error("warehouse_id: wymagana liczba całkowita ≥ 1 lub pominięte (auto)");
  }
  if (!Number.isFinite(sourceStatusId) || sourceStatusId < 1) {
    throw new Error("source_status_id: wymagane ≥ 1");
  }
  const product_id = assertPositiveInt("product_id", body.product_id);
  const location_id = assertPositiveInt("location_id", body.location_id);
  const quantity = assertPositiveQty("quantity", body.quantity);
  const cart_id = assertPositiveInt("cart_id", body.cart_id);

  const payload: WmsPickingQuickPickBodyApi = {
    product_id,
    location_id,
    quantity,
    cart_id,
  };
  const rid = body.recovery_order_id;
  if (rid != null && Number.isFinite(Number(rid)) && Number(rid) > 0) {
    payload.recovery_order_id = Math.floor(Number(rid));
  }

  try {
    const params: Record<string, string | number> = {
      tenant_id: tenantId,
      source_status_id: sourceStatusId,
      order_type: orderType,
    };
    if (warehouseId != null && Number.isFinite(warehouseId) && warehouseId >= 1) {
      params.warehouse_id = warehouseId;
    }
    const res = await api.post<{ ok: boolean; order_id: number; order_item_id: number }>(
      "/wms/picking/quick-pick",
      payload,
      {
        params,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
    return res.data;
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response?.status === 422) {
      console.error("[WMS quick-pick] 422:", e.response.data?.detail);
    }
    throw e;
  }
}
