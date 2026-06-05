import api from "./axios";

/** Zgodnie z ``GET /wms/packing/orders`` i sesją pakowania. */
export type WmsPackingModeParam = "no_cart" | "bulk" | "baskets";

export type WmsPackingTargetStatusApi = {
  target_status_id: number;
  status: string;
  color: string;
  main_group: string;
  order_count: number;
};

export type WmsPackingModesApi = {
  no_cart: number;
  bulk: number;
  baskets: number;
};

export type WmsPackingOrderUiStatusApi = {
  name: string;
  color: string;
  main_group: string;
};

export type WmsPackingRecommendedCartonApi = {
  id: string;
  name: string;
  dimensions: string;
  image_url?: string | null;
  is_best: boolean;
};

/** Eksport z ./packagingIntelligenceApi — duplikat typu unikamy importu cyklicznego. */
export type PackagingEngineSourceApi = "SMART_MATCHING" | "THREE_D_MATCHING" | "COMBINED";

export type PackagingSuggestionApi = {
  order_id: number;
  source_engine: PackagingEngineSourceApi;
  suggested_package_id: string;
  package_name: string;
  package_dimensions: string;
  image_url?: string | null;
  confidence_score: number;
  fill_percentage?: number | null;
  reason: string;
  auto_assigned: boolean;
  overridden_by_user: boolean;
  assigned_by?: string | null;
  assigned_at?: string | null;
};

export type WmsPackingOrderLineApi = {
  order_item_id: number;
  /** Brak w starszej odpowiedzi API — grupowanie po order_item_id. */
  product_id?: number;
  quantity: number;
  /** Ilość do spakowania po brakach OMS (≤ quantity). */
  quantity_required?: number;
  quantity_packed: number;
  /** Suma Pick dla linii (OMS / WMS). */
  picked_quantity?: number;
  /** Po domknięciu zbierania — wartość do badge „Zbieranie” (pełne a/b). */
  picked_quantity_final?: number;
  /** Zgłoszony brak na linii. */
  missing_quantity?: number;
  product_name: string;
  ean: string | null;
  sku: string | null;
  image_url: string | null;
  stock_quantity?: number | null;
  location_label?: string | null;
  /** ``locations.type`` → jak ``normalizeStorageType`` (primary | pick | reserve | …). */
  location_storage_type?: string | null;
  location_bin_qty?: number | null;
  /** Wszystkie lokalizacje z dodatnim stanem (np. przed zbieraniem). */
  available_location_labels?: string[];
  /** Jak wyżej + ilości i typ magazynowy (badge z qty). */
  available_stock_locations?: Array<{
    location_label: string;
    quantity: number;
    storage_type?: string | null;
  }>;
  /** Po zbieraniu: ilości per lokalizacja z historii PICK. */
  picked_locations?: Array<{
    location_label: string;
    quantity: number;
    batch_number?: string | null;
    expiry_date?: string | null;
  }>;
  color_name?: string | null;
  catalog_number?: string | null;
  product_symbol?: string | null;
  bundle_name?: string | null;
  /** shortage | waiting | resolved | none — z backendu ``WmsPackingOrderLine``. */
  shortage_display_kind?: string | null;
  replaced_from_order_item_id?: number | null;
  replaced_from_product_name?: string | null;
  /** REPLACED | TO_PICK | null — z backendu OMS/WMS */
  oms_line_status?: string | null;
  /** Audyt zamiany / zamiennika */
  oms_line_secondary_trace?: string | null;
  /** Linia REPLACED: nazwa produktu po zamianie (badge). */
  replacement_new_product_name?: string | null;
  /** ``order_items.wms_picking_line_status`` — np. ``to_pick`` | ``picked`` | ``missing``. */
  wms_picking_line_status?: string | null;
  /** Audyt WMS: kto ostatnio pobrał linię i skąd dokąd (tekst z ``wms_order_events``). */
  last_pick_audit_summary?: string | null;
  /** Audyt pakowania — operator i karton z ``PACKED_ITEM``. */
  last_pack_audit_summary?: string | null;
};

export type WmsOrderTimelineEventApi = {
  at: string;
  title: string;
  body?: string[];
  badge?: string | null;
  user_label?: string | null;
  event_type?: string | null;
};

export type WmsOperationalNoteBriefApi = {
  id: number;
  content: string;
  priority?: number | null;
  color_tag?: string | null;
  show_in_picking?: boolean;
  show_in_packing?: boolean;
  show_in_returns?: boolean;
  show_in_complaints?: boolean;
};

export type WmsOperationTimesApi = {
  picking_time?: number | null;
  packing_time?: number | null;
  total_time?: number | null;
  picking_seconds?: number | null;
  packing_seconds?: number | null;
  total_seconds?: number | null;
  picking_partial_label?: string | null;
  /** Ściana czasu magazynu: pierwszy pick → koniec automatyki pakowania (gdy znany). */
  warehouse_flow_seconds?: number | null;
};

export type WmsPackingOrderCardApi = {
  order_id: number;
  number: string;
  packed_quantity: number;
  total_quantity: number;
  /** Backend: wszystkie linie spakowane (jeśli brak w odpowiedzi — licz fallback po liniach). */
  is_completed?: boolean;
  order_ui_status: WmsPackingOrderUiStatusApi | null;
  shipping_method: string | null;
  shipping_method_id?: string | null;
  shipping_method_logo_url?: string | null;
  lines: WmsPackingOrderLineApi[];
  /** Tylko gdy backend zwraca (tryb baskets). */
  basket_code?: string | null;
  customer_comment?: string | null;
  staff_notes?: string | null;
  sales_document_label?: string | null;
  /** „Fa” | „Pa” — gdy brak jeszcze numeru dokumentu (szara plakietka). */
  document_prefix?: string | null;
  wms_timeline?: WmsOrderTimelineEventApi[];
  wms_operation_times?: WmsOperationTimesApi | null;
  timeline?: WmsOrderTimelineEventApi[];
  operation_times?: WmsOperationTimesApi | null;
  /** ``orders.fulfillment_state`` — status operacyjny WMS w nagłówku OMS. */
  wms_fulfillment_state?: string | null;
  /** Kod wózka lub koszyk (gdy przypisane). */
  wms_vehicle_label?: string | null;
  /** Linie operacyjne wózek/koszyk (OMS pod zbieraniem). */
  wms_operational_logistics_lines?: string[] | null;
  /** TO_PICK | PICKING | READY_TO_PACK | PACKING | PACKED | NEEDS_DECISION | MISSING — ze znaczników, nie z picków. */
  wms_workflow_phase?: string | null;
  wms_cart_id?: number | null;
  wms_picking_finished_at?: string | null;
  wms_packing_started_at?: string | null;
  wms_packing_finished_at?: string | null;
  /** Packaging Intelligence — PRIMARY + krótka lista alternatyw (nie „wszystkie kartony”). */
  packaging_suggestions?: PackagingSuggestionApi[];
  primary_packaging_suggestion?: PackagingSuggestionApi | null;
  packaging_alternatives?: PackagingSuggestionApi[];
  selected_carton_id?: string | null;
  selected_carton?: WmsPackingRecommendedCartonApi | null;
  operational_notes_packing?: WmsOperationalNoteBriefApi[];
  wms_operational_alert_title?: string | null;
};

export type WmsPackingCartOrdersOutApi = {
  cart_id: number;
  cart_code: string;
  cart_display_name?: string;
  cart_type: string;
  orders: WmsPackingOrderCardApi[];
};

export type WmsPackingBasketOrderOutApi = {
  order_id: number;
  basket_code: string;
};

export type WmsPackingOrderDetailApi = WmsPackingOrderCardApi & {
  customer_name: string;
  shipping_address?: string;
  customer_phone?: string | null;
  shipping_method_name?: string | null;
  payment_label: string | null;
  current_line: WmsPackingOrderLineApi | null;
  queue_index?: number;
  queue_total?: number;
  order_value_display?: string | null;
  shipping_fee_display?: string | null;
  payment_method_text?: string | null;
  customer_comment?: string | null;
  staff_notes?: string | null;
  sales_document_label?: string | null;
  pickup_point?: boolean | null;
  waybill_count?: number;
  /** Alias serwerowy — ta sama wartość co ``waybill_count`` (listy przewozowe / etykiety). */
  labels_count?: number;
  cart_display_code?: string | null;
  recommended_cartons?: WmsPackingRecommendedCartonApi[];
  /** Pełna lista kartonów dla metody wysyłki — wybór obowiązkowy zanim domknięcie bez kartonu. */
  shipping_compatible_cartons?: WmsPackingRecommendedCartonApi[];
  selected_carton_id?: string | null;
  selected_carton?: WmsPackingRecommendedCartonApi | null;
};

export type WmsPackingResolveEanApi = { order_id: number };

export type WmsPackingPostPackStepApi = {
  step: string;
  ok: boolean;
  skipped?: boolean;
  message?: string | null;
};

export type WmsPackingScanOutApi = {
  detail: WmsPackingOrderDetailApi;
  fully_packed: boolean;
  /** Ustawiane na odpowiedzi POST …/finish — z konfiguracji pakowania. */
  packing_after_finish_action?: "STAY" | "GO_TO_LIST" | null;
  next_order_id: number | null;
  last_packed_order_item_id: number | null;
  post_pack_pipeline?: WmsPackingPostPackStepApi[] | null;
};

export async function getWmsPackingTargetStatuses(
  tenantId: number,
  warehouseId: number,
): Promise<WmsPackingTargetStatusApi[]> {
  const res = await api.get<WmsPackingTargetStatusApi[]>("/wms/packing/target-statuses", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId },
  });
  return res.data;
}

export async function getWmsPackingModes(
  tenantId: number,
  warehouseId: number,
  statusId: number,
): Promise<WmsPackingModesApi> {
  const res = await api.get<WmsPackingModesApi>("/wms/packing/modes", {
    params: { tenant_id: tenantId, warehouse_id: warehouseId, status: statusId },
  });
  return res.data;
}

export type WmsPackingEntryOutApi = {
  success: boolean;
  order_id: number;
  packing_session_id?: number | null;
  packing_session_created?: boolean;
  status_id: number;
  status_name: string;
  status_color: string;
  main_group: string;
  mode: WmsPackingModeParam;
  cart_id?: number | null;
  cart_code?: string | null;
  cart_type?: string | null;
  source_workflow?: string;
};

export async function postWmsPackingOrderEnter(
  tenantId: number,
  warehouseId: number,
  orderId: number,
  opts?: { sourceWorkflow?: string; redirectedFrom?: string },
): Promise<WmsPackingEntryOutApi> {
  const res = await api.post<WmsPackingEntryOutApi>(`/wms/packing/orders/${orderId}/enter`, null, {
    params: {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      source_workflow: opts?.sourceWorkflow ?? "shortage",
      redirected_from: opts?.redirectedFrom,
    },
  });
  return res.data;
}

/** Lista pakowania dla wózka po kodzie skanu (CART-…); ścieżka ``/carts/by-code/{code}/orders``. */
export async function getWmsCartPackingOrdersByCode(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: "bulk" | "baskets",
  cartCode: string,
): Promise<WmsPackingCartOrdersOutApi> {
  const res = await api.get<WmsPackingCartOrdersOutApi>(
    `/carts/by-code/${encodeURIComponent(cartCode.trim())}/orders`,
    {
      params: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        status: statusId,
        mode,
      },
    },
  );
  return res.data;
}

/** Jedno zamówienie dla koszyka na bieżącym wózku MULTI; ``GET /baskets/{code}/order``. */
export async function getWmsBasketPackingOrder(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  cartId: number,
  basketCode: string,
): Promise<WmsPackingBasketOrderOutApi> {
  const res = await api.get<WmsPackingBasketOrderOutApi>(
    `/baskets/${encodeURIComponent(basketCode.trim())}/order`,
    {
      params: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        cart_id: cartId,
        status: statusId,
        mode: "baskets",
      },
    },
  );
  return res.data;
}

export async function getWmsPackingOrders(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  cartId?: number | null,
): Promise<WmsPackingOrderCardApi[]> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.get<WmsPackingOrderCardApi[]>("/wms/packing/orders", { params });
  return res.data;
}

export async function getWmsPackingResolveEan(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  ean: string,
  cartId?: number | null,
): Promise<WmsPackingResolveEanApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
    ean,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.get<WmsPackingResolveEanApi>("/wms/packing/resolve-ean", { params });
  return res.data;
}

export async function getWmsPackingOrderDetail(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  orderId: number,
  cartId?: number | null,
): Promise<WmsPackingOrderDetailApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.get<WmsPackingOrderDetailApi>(`/wms/packing/orders/${orderId}/detail`, { params });
  return res.data;
}

export async function postWmsPackingOrderScan(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  orderId: number,
  ean: string,
  cartId?: number | null,
): Promise<WmsPackingScanOutApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.post<WmsPackingScanOutApi>(`/wms/packing/orders/${orderId}/scan`, { ean }, { params });
  return res.data;
}

export async function postWmsPackingLinePack(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  orderId: number,
  orderItemId: number,
  quantity: number,
  cartId?: number | null,
): Promise<WmsPackingScanOutApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.post<WmsPackingScanOutApi>(
    `/wms/packing/orders/${orderId}/line-pack`,
    { order_item_id: orderItemId, quantity },
    { params },
  );
  return res.data;
}

export async function postWmsPackingPackAll(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  orderId: number,
  cartId?: number | null,
): Promise<WmsPackingScanOutApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.post<WmsPackingScanOutApi>(`/wms/packing/orders/${orderId}/pack-all`, {}, { params });
  return res.data;
}

/** Po pełnym spakowaniu — potok post-pack (dokument, status, …). Nie wywołuj przed ``fully_packed``. */
export async function postWmsPackingOrderFinish(
  tenantId: number,
  warehouseId: number,
  statusId: number,
  mode: WmsPackingModeParam,
  orderId: number,
  cartId?: number | null,
  options?: { allow_without_carton?: boolean },
): Promise<WmsPackingScanOutApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: warehouseId,
    status: statusId,
    mode,
  };
  if (cartId != null) params.cart_id = cartId;
  const res = await api.post<WmsPackingScanOutApi>(
    `/wms/packing/orders/${orderId}/finish`,
    { allow_without_carton: options?.allow_without_carton === true },
    { params },
  );
  return res.data;
}

/** Kod błędu z ``detail`` odpowiedzi FastAPI (np. skan pakowania). */
export function wmsPackingApiErrorCode(err: unknown): string | null {
  const ax = err as { response?: { data?: { detail?: unknown } } };
  const d = ax.response?.data?.detail;
  if (d && typeof d === "object" && d !== null && "code" in d) {
    return String((d as { code: string }).code);
  }
  return null;
}

/** Komunikat z API (pole ``error`` lub ``message``) — do toasta przy finish / skanie. */
export function wmsPackingApiErrorMessage(err: unknown): string | null {
  const ax = err as { response?: { data?: { detail?: unknown } } };
  const d = ax.response?.data?.detail;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (d && typeof d === "object" && d !== null) {
    const o = d as { error?: string; message?: string };
    const msg = (o.error ?? o.message ?? "").trim();
    if (msg) return msg;
  }
  return null;
}
