import axios from "axios";

import api from "./axios";
import { createRequestDeduper } from "../utils/wmsRequestDeduper";

const pickingProductLinesDeduper = createRequestDeduper();
const pickingProductDetailDeduper = createRequestDeduper();

/** Zgodne z ``WmsPickingOrderTypeChoice`` w flow WMS. */
export type WmsPickingOrderTypeQuery = "single" | "multi" | "all";

export type WmsPickingProductBundleBreakdownRowApi = {
  order_id: number;
  order_number: string;
  bundle_id?: number | null;
  bundle_name?: string | null;
  bundle_mode?: string | null;
  quantity: number;
};

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
  /** True gdy remaining≈0 — linia zostaje w snapshotcie sesji (nie znika z listy) */
  completed?: boolean;
  /**
   * SSOT stanu UI linii: ACTIVE | PARTIAL | COMPLETED_PICK | SHORTAGE.
   * SHORTAGE = remaining≈0 i missing>0 — NIE renderować jako „DO POBRANIA” ani zielone „ZEBRANO”.
   */
  resolution_status?: "ACTIVE" | "PARTIAL" | "COMPLETED_PICK" | "SHORTAGE";
  /** Skan EAN tylko gdy true — linie nie „picked”/„missing” z ilością do pobrania (przy braku cart_id: wg remaining) */
  scanner_active?: boolean;
  primary_location_id?: number | null;
  primary_location_code: string;
  /** Stan fizyczny (Inventory) w lokalizacji głównej — nie ilość do pobrania */
  primary_location_stock?: number;
  locations?: Array<{ location_id: number; location_code?: string | null }>;
  extra_locations_count?: number;
  route_sort_key: string;
  consolidation_pick?: boolean;
  consolidation_shelf_label?: string | null;
  /** Rozbicie multi-order / multi-bundle dla tego SKU (P4.15B) */
  bundle_breakdown?: WmsPickingProductBundleBreakdownRowApi[];
};

export type WmsPickingSessionStatsApi = {
  zebrane: number;
  do_zebrania: number;
  w_trakcie: number;
  braki?: number;
};

export type WmsBasketPutPendingListApi = {
  product_id: number;
  product_name?: string;
  ean?: string | null;
  sku?: string | null;
  quantity?: number;
  idempotency_key?: string;
  location_id?: number;
  eligible_baskets?: Array<{
    basket_id: number;
    basket_label: string;
    order_id: number;
    order_item_id?: number;
    line_remaining: number;
  }>;
  operator_user_id?: number | null;
};

export type WmsPickingProductLinesResponseApi = {
  products: WmsPickingProductLineApi[];
  cohort_order_count?: number;
  cohort_missing_lines?: WmsPickingCohortMissingLineApi[];
  pick_list: unknown[];
  shortfalls: unknown[];
  warnings: string[];
  allow_continue_other_lines_after_shortage?: boolean;
  picking_mode?: "normal" | "recovery" | string | null;
  recovery_order_id?: number | null;
  recovery_completed?: boolean;
  /** SSOT z backendu — nie licz lokalnie z wierszy React. */
  session_stats?: WmsPickingSessionStatsApi | null;
  /** MULTI: pending put (bez PICK) — banner na liście. Nie mylić z series. */
  basket_put_pending?: WmsBasketPutPendingListApi | null;
  basket_put_active_series?: {
    basket_label?: string;
    basket_id?: number;
    product_id?: number;
    order_item_id?: number;
    /** LIVE remaining for this series allocation (order_item + basket) — not product aggregate. */
    line_remaining?: number;
  } | null;
  requires_basket_put_confirm?: boolean;
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
  order_item_id?: number | null;
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
  consolidation_pick?: boolean;
  consolidation_shelf_label?: string | null;
  bundle_id?: number | null;
  bundle_name?: string | null;
  bundle_mode?: string | null;
  bundle_component_index?: number | null;
  bundle_component_count?: number | null;
  is_bundle_component?: boolean;
  parent_bundle_order_line_id?: number | null;
};

export type WmsPickingBundleComponentStatusApi = {
  order_item_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  picked_quantity: number;
  quantity_to_pick: number;
  bundle_component_index: number;
  is_current_product: boolean;
  pick_done: boolean;
};

export type WmsPickingOrderBundleTreeApi = {
  order_id: number;
  order_number: string;
  bundle_id: number;
  bundle_name: string;
  bundle_mode: string;
  parent_order_line_id: number;
  components_total: number;
  components_done: number;
  components: WmsPickingBundleComponentStatusApi[];
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
  resolution_status?: "ACTIVE" | "PARTIAL" | "COMPLETED_PICK" | "SHORTAGE";
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
  /** P5.4 — konsolidacja: odkładanie na półkę zamiast koszyka */
  consolidation_active?: boolean;
  consolidation_shelf_label?: string | null;
  consolidation_plan_id?: number | null;
  consolidation_plan_item_id?: number | null;
  pending_shelf_deposit?: boolean;
  /** Drzewo bundle w kohortcie dla bieżącego SKU (P4.15B) */
  order_bundle_trees?: WmsPickingOrderBundleTreeApi[];
  /** MULTI baskets — SSOT pending put / series from session */
  requires_basket_put_confirm?: boolean;
  basket_put_pending?: {
    expected_basket_label?: string;
    expected_basket_id?: number;
    quantity?: number;
    product_id?: number;
    order_id?: number;
    idempotency_key?: string;
    eligible_baskets?: Array<{
      basket_id: number;
      basket_label: string;
      order_id: number;
      order_item_id?: number;
      line_remaining: number;
    }>;
  } | null;
  basket_put_active_series?: {
    basket_label?: string;
    basket_id?: number;
    product_id?: number;
    order_item_id?: number;
    /** LIVE remaining for this series allocation (order_item + basket) — not product aggregate. */
    line_remaining?: number;
  } | null;
};

export async function getWmsPickingProductLines(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  cartId?: number | null,
  recoveryOrderId?: number | null,
  orderIds?: number[] | null,
  options?: { force?: boolean; pickingSessionId?: number | null },
): Promise<WmsPickingProductLinesResponseApi> {
  const params: Record<string, string | number | number[]> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    source_status_id: sourceStatusId,
    order_type: orderType,
  };
  const sid = options?.pickingSessionId;
  if (sid != null && sid > 0) {
    params.picking_session_id = sid;
  } else if (cartId != null && cartId > 0) {
    params.cart_id = cartId;
  }
  if (recoveryOrderId != null && recoveryOrderId > 0) {
    params.recovery_order_id = recoveryOrderId;
    params.mode = "recovery";
  }
  if (orderIds?.length) {
    params.order_ids_csv = orderIds.join(",");
  }
  const key = JSON.stringify(params);
  return pickingProductLinesDeduper(
    key,
    async () => {
      const res = await api.get<WmsPickingProductLinesResponseApi>("/wms/picking/product-lines", { params });
      return res.data;
    },
    { force: options?.force === true },
  );
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
  options?: { force?: boolean; pickingSessionId?: number | null },
): Promise<WmsPickingProductDetailApi> {
  const params: Record<string, string | number | number[]> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    source_status_id: sourceStatusId,
    order_type: orderType,
    product_id: productId,
  };
  const sid = options?.pickingSessionId;
  if (sid != null && sid > 0) {
    params.picking_session_id = sid;
  } else if (cartId != null && cartId > 0) {
    params.cart_id = cartId;
  }
  if (recoveryOrderId != null && recoveryOrderId > 0) {
    params.recovery_order_id = recoveryOrderId;
    params.mode = "recovery";
  }
  if (orderIds?.length) {
    params.order_ids_csv = orderIds.join(",");
  }
  const key = JSON.stringify(params);
  return pickingProductDetailDeduper(
    key,
    async () => {
      const res = await api.get<WmsPickingProductDetailApi>("/wms/picking/product-lines/detail", { params });
      return res.data;
    },
    { force: options?.force === true },
  );
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

/** AVAILABLE → ASSIGNED (wybór wózka bez zamówień). */
export async function postWmsPickingClaimCart(
  tenantId: number,
  warehouseId: number,
  cartId: number,
): Promise<{ cart_id: number; status: string; assigned_user_id: number | null }> {
  const res = await api.post("/wms/picking/claim-cart", null, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, cart_id: cartId },
  });
  return res.data;
}

/** Heartbeat PICKING — tylko last_activity_at; 409 SessionNotFound gdy brak sesji. */
export async function postWmsPickingHeartbeat(
  tenantId: number,
  warehouseId: number,
  cartId: number,
): Promise<{
  cart_id: number;
  session_id: number | null;
  last_activity_at: string | null;
  status: string;
}> {
  const res = await api.post("/wms/picking/heartbeat", null, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, cart_id: cartId },
  });
  return res.data;
}

/**
 * Skan wózka → startPicking (sesja + przypisanie zamówień + PICKING).
 * Capacity walidowana tutaj.
 */
export async function postWmsPickingStart(
  tenantId: number,
  warehouseId: number,
  cartId: number,
  sourceStatusId: number,
  orderType: string,
  orderIds?: number[],
): Promise<{
  cart_id: number;
  status: string | null;
  session_id: number | null;
  current_session_id: number | null;
  assigned_user_id: number | null;
  /** Komunikat operatora gdy brak FINAL assignment (np. gate) — bez kodów technicznych. */
  operator_message?: string | null;
}> {
  const res = await api.post("/wms/picking/start", null, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      cart_id: cartId,
      source_status_id: sourceStatusId,
      order_type: orderType,
      ...(orderIds?.length ? { order_ids: orderIds } : {}),
    },
  });
  return res.data;
}

/** Cartless start (bulk / cart_no_scan) — bez WarehouseCart. */
export async function postWmsPickingStartCartless(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: string,
  orderIds?: number[],
): Promise<{
  session_id: number | null;
  cart_id: null;
  status: string | null;
  operator_user_id: number | null;
  operator_message?: string | null;
  cartless: true;
}> {
  const res = await api.post("/wms/picking/start-cartless", null, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      source_status_id: sourceStatusId,
      order_type: orderType,
      ...(orderIds?.length ? { order_ids: orderIds } : {}),
    },
  });
  return res.data;
}

export async function postWmsPickingFinalizeCartless(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  pickingSessionId: number,
): Promise<WmsPickingFinalizeCartResponseApi & { cart_id: null; picking_session_id?: number }> {
  const res = await api.post("/wms/picking/finalize-cartless", null, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      source_status_id: sourceStatusId,
      order_type: orderType,
      picking_session_id: pickingSessionId,
    },
  });
  return res.data;
}

export async function postWmsPickingCancelCartlessSession(
  tenantId: number,
  warehouseId: number,
  pickingSessionId: number,
): Promise<{ session_id: number; orders_restored: number; cart_id: null }> {
  const res = await api.post("/wms/picking/cancel-cartless-session", null, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      picking_session_id: pickingSessionId,
    },
  });
  return res.data;
}

export async function postWmsPickingHeartbeatCartless(
  tenantId: number,
  warehouseId: number,
  pickingSessionId: number,
): Promise<{
  session_id: number;
  cart_id: null;
  last_activity_at: string | null;
  status: string;
}> {
  const res = await api.post("/wms/picking/heartbeat-cartless", null, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      picking_session_id: pickingSessionId,
    },
  });
  return res.data;
}

/** Pakowacz skanuje wózek: READY_FOR_PACKING → PACKING. */
export async function postWmsPackingStartCart(
  tenantId: number,
  warehouseId: number,
  cartId: number,
): Promise<{
  cart_id: number;
  status: string;
  packing_user_id: number | null;
  assigned_user_id: number | null;
}> {
  const res = await api.post("/wms/packing/start-cart", null, {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, cart_id: cartId },
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

export async function postWmsPickingCancelSession(
  tenantId: number,
  warehouseId: number,
  cartId: number,
): Promise<{ cart_id: number; orders_restored: number; cart_status: string }> {
  const res = await api.post<{ cart_id: number; orders_restored: number; cart_status: string }>(
    "/wms/picking/cancel-session",
    null,
    {
      params: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        cart_id: cartId,
      },
    },
  );
  return res.data;
}

export type WmsPickingReportShortageResponseApi = {
  ok: boolean;
  orders_updated: number;
  target_status_id: number | null;
  order_ids: number[];
  order_issue_task_ids?: number[];
  allow_continue_other_lines_after_shortage?: boolean;
  /** Snapshot linii po zapisie — ten sam SSOT co product-lines. */
  product_line?: WmsPickingProductLineApi | null;
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
    cart_id?: number | null;
    picking_session_id?: number | null;
    /** Zamówienia z widoku szczegółu (opcjonalnie — przecięcie z sesją wózka po stronie API) */
    order_ids?: number[] | null;
    recovery_order_id?: number | null;
    order_item_id?: number | null;
    problem_kind?: "product_shortage" | "qty_mismatch" | null;
  },
): Promise<WmsPickingReportShortageResponseApi> {
  const payload: Record<string, unknown> = {
    product_id: body.product_id,
    missing_qty: body.missing_qty,
  };
  if (body.location_id != null) payload.location_id = body.location_id;
  if (body.picking_session_id != null && body.picking_session_id > 0) {
    payload.picking_session_id = body.picking_session_id;
  } else if (body.cart_id != null && body.cart_id > 0) {
    payload.cart_id = body.cart_id;
  }
  if (body.order_ids?.length) payload.order_ids = body.order_ids;
  const rid = body.recovery_order_id;
  if (rid != null && Number.isFinite(Number(rid)) && Number(rid) > 0) {
    payload.recovery_order_id = Math.floor(Number(rid));
  }
  const oiid = body.order_item_id;
  if (oiid != null && Number.isFinite(Number(oiid)) && Number(oiid) > 0) {
    payload.order_item_id = Math.floor(Number(oiid));
  }
  if (body.problem_kind) payload.problem_kind = body.problem_kind;
  const res = await api.post<WmsPickingReportShortageResponseApi>("/wms/picking/report-shortage", payload, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      source_status_id: sourceStatusId,
      order_type: orderType,
    },
  });
  return res.data;
}

export type WmsPickingUndoPickResponseApi = {
  ok: boolean;
  undone_qty: number;
  inventory_unchanged: boolean;
  order_ids: number[];
  location_id?: number | null;
};

export async function postWmsPickingUndoPick(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  body: {
    product_id: number;
    cart_id: number;
    quantity: number;
    location_id?: number | null;
    order_ids?: number[] | null;
    recovery_order_id?: number | null;
  },
): Promise<WmsPickingUndoPickResponseApi> {
  const res = await api.post<WmsPickingUndoPickResponseApi>("/wms/picking/undo-pick", body, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      source_status_id: sourceStatusId,
      order_type: orderType,
    },
  });
  return res.data;
}

export type WmsPickingEmptyLocationResponseApi = {
  ok: boolean;
  shortage_kind: string;
  location_id: number;
  location_code: string;
  product_id: number;
  product_ean?: string | null;
  previous_qty: number;
  new_qty: number;
  formal_stock_qty?: number | null;
  stock_effect?: string;
  routing_blocked?: boolean;
  undone_pick_qty: number;
  alternate_locations: Array<{ location_id: number; location_code: string; stock_quantity: number }>;
  stock_document_id?: number | null;
  inventory_document_id?: number | null;
  inventory_document_number?: string | null;
};

export async function postWmsPickingConfirmEmptyLocation(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  body: {
    product_id: number;
    location_id: number;
    cart_id: number;
    observed_stock_qty?: number | null;
    order_ids?: number[] | null;
    recovery_order_id?: number | null;
  },
): Promise<WmsPickingEmptyLocationResponseApi> {
  const res = await api.post<WmsPickingEmptyLocationResponseApi>("/wms/picking/confirm-empty-location", body, {
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
  cart_id?: number | null;
  picking_session_id?: number | null;
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

/** Czytelny komunikat z odpowiedzi FastAPI (``detail`` string | obiekt | tablica walidacji). */
export function formatFastApiErrorDetail(data: unknown): string {
  if (data == null) {
    return "Błąd walidacji.";
  }
  if (typeof data === "string" && data.trim()) {
    return data.trim();
  }
  if (typeof data !== "object") {
    return "Błąd walidacji.";
  }
  const top = data as { message?: unknown; error?: unknown; detail?: unknown };
  if (typeof top.message === "string" && top.message.trim()) {
    return top.message.trim();
  }
  if (typeof top.error === "string" && top.error.trim()) {
    return top.error.trim();
  }
  const detail = top.detail;
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
  if (typeof detail === "object") {
    const d = detail as { message?: unknown; error?: unknown };
    if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
    if (typeof d.error === "string" && d.error.trim()) return d.error.trim();
  }
  return String(detail);
}

export type WmsPickingQuickPickResultApi = {
  ok: boolean;
  order_id?: number | null;
  order_item_id?: number | null;
  phase?: string;
  picked?: boolean;
  pending?: WmsPickingProductDetailApi["basket_put_pending"];
  expected_basket_label?: string | null;
  eligible_baskets?: NonNullable<WmsPickingProductDetailApi["basket_put_pending"]>["eligible_baskets"];
  message?: string | null;
  active_series?: WmsPickingProductDetailApi["basket_put_active_series"];
  quantity_put?: number;
};

export async function postWmsPickingQuickPick(
  tenantId: number,
  warehouseId: number | null | undefined,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  body: WmsPickingQuickPickBodyApi,
): Promise<WmsPickingQuickPickResultApi> {
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
  const payload: WmsPickingQuickPickBodyApi = {
    product_id,
    location_id,
    quantity,
  };
  if (body.picking_session_id != null && Number(body.picking_session_id) > 0) {
    payload.picking_session_id = Math.floor(Number(body.picking_session_id));
  } else {
    payload.cart_id = assertPositiveInt("cart_id", body.cart_id);
  }
  const rid = body.recovery_order_id;
  if (rid != null && Number.isFinite(Number(rid)) && Number(rid) > 0) {
    payload.recovery_order_id = Math.floor(Number(rid));
  }
  const params: Record<string, number | string> = {
    tenant_id: tenantId,
    source_status_id: sourceStatusId,
    order_type: orderType,
  };
  if (warehouseId != null && warehouseId > 0) {
    params.warehouse_id = warehouseId;
  }
  const res = await api.post<WmsPickingQuickPickResultApi>("/wms/picking/quick-pick", payload, { params });
  return res.data;
}

export async function postWmsPickingConfirmBasketPut(
  tenantId: number,
  warehouseId: number,
  sourceStatusId: number,
  orderType: WmsPickingOrderTypeQuery,
  body: {
    cart_id: number;
    basket_scan: string;
    manual?: boolean;
    recovery_order_id?: number | null;
    product_id?: number | null;
    location_id?: number | null;
    quantity?: number | null;
  },
): Promise<WmsPickingQuickPickResultApi> {
  const params = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    source_status_id: sourceStatusId,
    order_type: orderType,
  };
  const res = await api.post<WmsPickingQuickPickResultApi>(
    "/wms/picking/confirm-basket-put",
    {
      cart_id: assertPositiveInt("cart_id", body.cart_id),
      basket_scan: String(body.basket_scan || "").trim(),
      manual: Boolean(body.manual),
      ...(body.recovery_order_id != null && body.recovery_order_id > 0
        ? { recovery_order_id: body.recovery_order_id }
        : {}),
      ...(body.product_id != null && body.product_id > 0 ? { product_id: body.product_id } : {}),
      ...(body.location_id != null && body.location_id > 0 ? { location_id: body.location_id } : {}),
      ...(body.quantity != null && Number(body.quantity) > 0 ? { quantity: Number(body.quantity) } : {}),
    },
    { params },
  );
  return res.data;
}

export async function postWmsPickingCancelPendingBasketPut(
  tenantId: number,
  warehouseId: number,
  body: { cart_id: number },
): Promise<{ ok: boolean; cleared?: boolean; product_id?: number | null; quantity?: number }> {
  const params = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
  };
  const res = await api.post(
    "/wms/picking/cancel-pending-basket-put",
    { cart_id: assertPositiveInt("cart_id", body.cart_id) },
    { params },
  );
  return res.data;
}
