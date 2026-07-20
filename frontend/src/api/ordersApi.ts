import api from "./axios";
import type { WmsPackingOrderCardApi, WmsPackingRecommendedCartonApi } from "./wmsPackingApi";

/** Exactly one of product_id or bundle_id must be set (matches backend OrderCreateLine). */
export type OrderCreateLinePayload =
  | { product_id: number; quantity: number; unit_price?: number | null }
  | { bundle_id: number; quantity: number; unit_price?: number | null };

export type OrderCreatePayload = {
  tenant_id: number;
  warehouse_id: number;
  login?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  note?: string | null;
  comment?: string | null;
  shipping_cost: number;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  company_name?: string | null;
  nip?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
  items: OrderCreateLinePayload[];
  check_bundle_stock?: boolean;
  origin?: string | null;
  complaint_id?: number | null;
  original_order_id?: number | null;
  complaint_order_type?: "EXCHANGE" | "REPLACEMENT" | null;
  shipping_method_id?: string | null;
  document_type?: "PARAGON" | "INVOICE" | null;
  payment_method?: string | null;
  payment_status?: string | null;
  sales_document_number?: string | null;
  /** Opcjonalne powiązanie z kartoteką klienta (ten sam tenant). */
  customer_id?: number | null;
};

export type OrderCreateResponse = {
  id: number;
  number?: string | null;
};

export async function createOrder(payload: OrderCreatePayload): Promise<OrderCreateResponse> {
  const res = await api.post<OrderCreateResponse>("/orders/", payload);
  return res.data;
}

export type OrderPatchPayload = {
  shipping_method_id?: string | null;
  /** Appends one entry to panel internal notes (import metadata). */
  internal_note_append?: string | null;
  /** Tworzy wpis ``order_notes`` type=customer. */
  customer_note_append?: string | null;
  /** Tworzy notatkę operacyjną widoczną w zbieraniu i pakowaniu. */
  operational_note_append?: string | null;
  document_type?: "" | "PARAGON" | "INVOICE" | null;
  /** `document_series.id` (UUID), stored as `panel_document_series_id` in order metadata. */
  document_series_id?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  sales_document_number?: string | null;
  shipping_name?: string | null;
  shipping_street?: string | null;
  shipping_city?: string | null;
  shipping_postal_code?: string | null;
  shipping_country?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  nip?: string | null;
  /** Set or clear (null) linked customer (same tenant). */
  customer_id?: number | null;
  priority_color?: "gray" | "blue" | "green" | "yellow" | "orange" | "red" | null;
  /** Persisted order-level discount. */
  discount_type?: "percent" | "amount" | null;
  discount_value?: number | null;
};

/** Dokładnie jedno z ``product_id`` lub ``bundle_id`` — zestaw jest eksplodowany na komponenty + nagłówek. */
export type OrderAddLinePayload =
  | {
      product_id: number;
      bundle_id?: undefined;
      quantity: number;
      unit_price?: number | null;
      unit?: string | null;
      vat_percent?: number | null;
    }
  | {
      bundle_id: number;
      product_id?: undefined;
      quantity: number;
      unit_price?: number | null;
      unit?: string | null;
      vat_percent?: number | null;
    };

export type OrderNoteDto = {
  id: number;
  type: string;
  content: string;
  created_at?: string | null;
};

export type OrderOperationalNoteDto = {
  id: number;
  order_id: number;
  author_user_id?: number | null;
  content: string;
  show_in_picking: boolean;
  show_in_packing: boolean;
  show_in_returns: boolean;
  show_in_complaints: boolean;
  priority?: number | null;
  color_tag?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function getOrderOperationalNotes(orderId: number): Promise<OrderOperationalNoteDto[]> {
  const res = await api.get<OrderOperationalNoteDto[]>(`/orders/${orderId}/operational-notes`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function postOrderOperationalNote(
  orderId: number,
  body: {
    content: string;
    show_in_picking: boolean;
    show_in_packing: boolean;
    show_in_returns: boolean;
    show_in_complaints: boolean;
    priority?: number | null;
    color_tag?: string | null;
  },
): Promise<OrderOperationalNoteDto> {
  const res = await api.post<OrderOperationalNoteDto>(`/orders/${orderId}/operational-notes`, body);
  return res.data;
}

export async function postOrderLine(orderId: number, payload: OrderAddLinePayload): Promise<unknown> {
  const res = await api.post(`/orders/${orderId}/items/`, payload);
  return res.data;
}

export async function patchOrder(orderId: number, payload: OrderPatchPayload): Promise<unknown> {
  const res = await api.patch(`/orders/${orderId}/`, payload);
  return res.data;
}

export async function getOrderNotes(orderId: number): Promise<OrderNoteDto[]> {
  const res = await api.get<OrderNoteDto[]>(`/orders/${orderId}/notes`);
  return Array.isArray(res.data) ? res.data : [];
}

/** PATCH /orders/{id}/priority — flaga wizualna (flame); ``priority_color: null`` czyści. */
export async function patchOrderPriority(
  orderId: number,
  payload: { priority_color: string | null },
): Promise<unknown> {
  const res = await api.patch(`/orders/${orderId}/priority`, payload);
  return res.data;
}

export type OrderSelectCartonResponseApi = {
  selected_carton_id: string | null;
  selected_carton: WmsPackingRecommendedCartonApi | null;
  recommended_carton_id?: string | null;
  was_overridden?: boolean;
  physical_fit_ok?: boolean;
  physical_fit_warning?: string | null;
  override_reason_code?: string | null;
  requires_override_confirmation?: boolean;
};

/** PATCH /orders/{id}/select-carton — wybór kartonu na pakowaniu WMS (wymaga packing scope). */
export async function patchOrderSelectCarton(
  orderId: number,
  tenantId: number,
  body: { carton_id: string; confirm_override?: boolean },
  scope: {
    warehouseId: number;
    statusId: number;
    mode: WmsPackingModeParam;
    cartId?: number | null;
  },
): Promise<OrderSelectCartonResponseApi> {
  const params: Record<string, string | number> = {
    tenant_id: tenantId,
    warehouse_id: scope.warehouseId,
    status: scope.statusId,
    mode: scope.mode,
  };
  if (scope.cartId != null && scope.cartId > 0) params.cart_id = scope.cartId;
  const res = await api.patch<OrderSelectCartonResponseApi>(`/orders/${orderId}/select-carton`, body, {
    params,
  });
  return res.data;
}

/** GET /orders/{id}/wms-fulfillment — linie z lokalizacją i statusem zbierania (OMS). */
export async function getOrderWmsFulfillment(orderId: number): Promise<WmsPackingOrderCardApi> {
  const res = await api.get<WmsPackingOrderCardApi>(`/orders/${orderId}/wms-fulfillment`);
  return res.data;
}

export async function deleteOrderItemLine(orderId: number, itemId: number): Promise<void> {
  await api.delete(`/orders/${orderId}/items/${itemId}`);
}

/** PATCH body: ``line_edit`` — edycja ilości / ceny / VAT / jednostki (bez mieszania z akcjami braków). */
export type OrderItemLineEditPatchBody = {
  quantity?: number;
  unit_price?: number;
  vat_percent?: number;
  unit?: string | null;
};

export async function patchOrderItemLine(
  orderId: number,
  itemId: number,
  body: {
    replace_product_id?: number;
    waiting_for_stock?: boolean;
    remove_missing?: boolean;
    line_edit?: OrderItemLineEditPatchBody;
  },
): Promise<void> {
  await api.patch(`/orders/${orderId}/items/${itemId}`, body);
}

/** Matches backend ``OrderDocumentType`` / upload form field ``document_type``. */
export type OrderPanelUploadDocumentType =
  | "PARAGON"
  | "PROFORMA"
  | "FAKTURA"
  | "RACHUNEK"
  | "KOREKTA"
  | "DOKUMENT_SPRZEDAZY"
  | "ZALACZNIK"
  | "LIST_PRZEWOZOWY";

/** Typy wybierane w zakładce „Dokumenty” (modal). */
export const ORDER_DOCUMENT_MODAL_TYPES = [
  "PARAGON",
  "PROFORMA",
  "FAKTURA",
  "RACHUNEK",
  "KOREKTA",
] as const satisfies readonly OrderPanelUploadDocumentType[];

/** POST multipart — zwraca zaktualizowane ``OrderRead``. */
export async function uploadOrderDocument(
  orderId: number,
  file: File,
  documentType: OrderPanelUploadDocumentType,
): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("document_type", documentType);
  const res = await api.post(`/orders/${orderId}/documents/upload`, fd);
  return res.data;
}

export async function deleteOrderDocument(orderId: number, documentId: number): Promise<unknown> {
  const res = await api.delete(`/orders/${orderId}/documents/${documentId}`);
  return res.data;
}
