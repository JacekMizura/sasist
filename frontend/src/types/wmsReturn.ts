export type OrderLookupHit = {
  id: number;
  number?: string | null;
  status?: string | null;
  barcode?: string | null;
  external_id?: string | null;
  sales_document_number?: string | null;
  /** Trafienie przez numer RMZ — podświetlenie wiersza na liście zwrotów zamówienia. */
  matched_return_id?: number | null;
};

export type CustomerRiskTier = "normal" | "elevated" | "high";

export type CustomerInsightsRead = {
  matched_email: string;
  total_orders_count: number;
  total_returns_count: number;
  return_rate: number;
  risk_label: string;
  risk_tier: CustomerRiskTier;
};

export type ReturnStatusType = "in_progress" | "done_success" | "done_rejected";

/** RMZ document status from DB (`ReturnStatus`); UI shows `name` + `color` only. */
export type ReturnStatusBrief = {
  id: number;
  name: string;
  color: string;
  type: ReturnStatusType;
  transition_key?: string | null;
};

/** Świeży zwrot / przed pełnym przyjęciem — niebieska plakietka na liście WMS. */
const FRESH_RETURN_TRANSITION_KEYS = new Set([
  "start",
  "new",
  "awaiting_intake",
  "created",
  "pending_verification",
]);

export function wmsReturnShowsFreshIncomingBadge(status: ReturnStatusBrief): boolean {
  const k = (status.transition_key || "").trim().toLowerCase();
  return FRESH_RETURN_TRANSITION_KEYS.has(k);
}

/** Fixed panel buckets for sub-statuses (not editable as entities). */
export type ReturnUiMainGroup = "NEW" | "IN_PROGRESS" | "DONE";

export type ReturnUiPanelSubgroupRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  main_group: ReturnUiMainGroup;
  name: string;
  sort_order: number;
};

/** Panel/office triage: sub-status row — separate from RMZ workflow `ReturnStatus`. */
export type ReturnUiStatusBrief = {
  id: number;
  name: string;
  color: string;
  main_group: ReturnUiMainGroup;
  group_name?: string | null;
  subgroup_name?: string | null;
  badge_color?: string;
  background_color?: string;
  text_color?: string;
  image_url?: string | null;
  is_active?: boolean;
};

export type WmsReturnLineListPreview = {
  quantity: number;
  name?: string | null;
  ean?: string | null;
  sku?: string | null;
  image_url?: string | null;
};

export type WmsReturnListItem = {
  id: number;
  rmz_number: string;
  status: ReturnStatusBrief;
  order_id: number;
  order_number?: string | null;
  sales_document_number?: string | null;
  return_type?: "RMA" | "UNCLAIMED" | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  shipping_cost?: number | null;
  created_at?: string | null;
  lines?: WmsReturnLineRead[];
  lines_preview?: WmsReturnLineListPreview[];
  /** Optional API alias; list UI falls back when `lines` is missing. */
  items?: unknown[];
  refund?: WmsRefundRead | null;
  /** Panel list: server-computed total (refund + shipping or line-value estimate). */
  total_refund_amount?: number;
  /** Panel triage label (not workflow status). */
  ui_status?: ReturnUiStatusBrief | null;
  stock_document_ids?: number[];
  warehouse_document_id?: number | null;
  warehouse_document_type?: string | null;
  warehouse_document_number?: string | null;
};

/** Wpis uszkodzenia w odpowiedzi GET (split-process / odczyt linii). */
export type WmsReturnLineDamageEntryRead = {
  id: string;
  qty: number;
  condition: "B" | "C";
  damage_type?: string | null;
  photo_urls?: string[];
  note?: string | null;
  operator_name?: string | null;
  created_at?: string | null;
  final_disposition?: "RESTOCK" | "OUTLET" | "REPAIR" | "DISPOSE" | "RETURN_TO_CUSTOMER" | null;
  disposition?: string | null;
  stock_document_id?: number | null;
  stock_document_line_id?: number | null;
  location_id?: number | null;
  putaway_status?: string | null;
  putaway_completed_at?: string | null;
};

export type WmsReturnLineDamageEntryPayload = {
  id: string;
  qty: number;
  condition: "B" | "C";
  damage_type?: string | null;
  photo_urls: string[];
  note?: string | null;
  operator_name?: string | null;
  created_at?: string | null;
  final_disposition?: "RESTOCK" | "OUTLET" | "REPAIR" | "DISPOSE" | "RETURN_TO_CUSTOMER" | null;
};

export type WmsReturnLineRead = {
  /** DB id of `rmz_lines` row (for label print); missing when line is only from JSON draft. */
  id?: number | null;
  order_item_id: number;
  product_id: number;
  quantity: number;
  accepted_qty?: number | null;
  damaged_qty?: number | null;
  damaged_b_qty?: number | null;
  damaged_c_qty?: number | null;
  rejected_qty?: number | null;
  decision?: "OK" | "DAMAGED" | "REJECTED" | null;
  condition?: "A" | "B" | "C" | null;
  processed_at?: string | null;
  /** Comma-separated RMZ damage type codes */
  damage_type?: string | null;
  /** Zdjęcia uszkodzenia zapisane na linii RMZ (GET detail). */
  photo_urls?: string[] | null;
  /** Niezależne partie uszkodzone — źródło prawdy po stronie API (JSON na rmz_lines). */
  damage_entries?: WmsReturnLineDamageEntryRead[] | null;
};

export type WmsReturnRead = {
  id: number;
  rmz_number: string;
  status: ReturnStatusBrief;
  order_id: number;
  tenant_id: number;
  warehouse_id: number;
  return_type?: "RMA" | "UNCLAIMED";
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  shipping_cost?: number | null;
  sales_document_number?: string | null;
  phone?: string | null;
  email?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  lines: WmsReturnLineRead[];
  created_at?: string | null;
  external_id?: string | null;
  refund?: WmsRefundRead | null;
  ui_status?: ReturnUiStatusBrief | null;
  /** Z API — preferuj zamiast heurystyki po `status.type` (spójność z blokadą zapisu). */
  workflow_finished?: boolean;
  workflow_editable?: boolean;
  /** Dokumenty Z-PZ powiązane z RMZ (PZ zwrotna). */
  stock_document_ids?: number[];
  warehouse_document_id?: number | null;
  warehouse_document_type?: string | null;
  warehouse_document_number?: string | null;
};

export type WmsReturnCreate = {
  tenant_id: number;
  warehouse_id?: number;
  order_id: number;
  return_type?: "RMA" | "UNCLAIMED";
  lines: { order_item_id: number; product_id: number; quantity: number }[];
};

export type ReturnStatusRead = ReturnStatusBrief & {
  tenant_id: number;
  warehouse_id: number;
};

export type ReturnStatusCreatePayload = {
  name: string;
  color: string;
  type: ReturnStatusType;
  transition_key?: string | null;
};

export type ReturnStatusUpdatePayload = {
  name?: string;
  color?: string;
  type?: ReturnStatusType;
  transition_key?: string | null;
};

export type ReturnUiStatusRead = ReturnUiStatusBrief & {
  tenant_id: number;
  warehouse_id: number;
  sort_order: number;
  sort_group?: number;
  sort_subgroup?: number;
  sort_status?: number;
};

export type ReturnUiStatusWithCount = ReturnUiStatusRead & {
  count: number;
};

export type ReturnUiPanelGroupBlock = {
  main_group: ReturnUiMainGroup;
  group_display_name?: string | null;
  total_count: number;
  sub_statuses: ReturnUiStatusWithCount[];
};

export type ReturnUiStatusPanelSummary = {
  groups: ReturnUiPanelGroupBlock[];
  unassigned_count: number;
};

export type ReturnUiStatusCreatePayload = {
  name: string;
  main_group: ReturnUiMainGroup;
  color?: string;
  sort_order?: number;
  group_name?: string | null;
  subgroup_name?: string | null;
  sort_group?: number;
  sort_subgroup?: number;
  sort_status?: number | null;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  image_url?: string | null;
  is_active?: boolean;
};

export type ReturnUiStatusUpdatePayload = {
  name?: string;
  main_group?: ReturnUiMainGroup;
  color?: string;
  sort_order?: number;
  group_name?: string | null;
  subgroup_name?: string | null;
  sort_group?: number;
  sort_subgroup?: number;
  sort_status?: number | null;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
};

export type ReturnsMode = "simple" | "two_step" | "advanced";

export type WmsSettingsRead = {
  tenant_id: number;
  warehouse_id: number;
  returns_mode: ReturnsMode;
  require_photos: boolean;
  require_condition: boolean;
  enable_refund: boolean;
};

/** POST /wms/settings body — warehouse_id optional (server uses tenant default). */
export type WmsSettingsSave = Omit<WmsSettingsRead, "warehouse_id"> & { warehouse_id?: number };

export type WmsReturnLineProcess = {
  decision: "OK" | "DAMAGED" | "REJECTED";
  condition?: "A" | "B" | "C" | null;
  photo_urls?: string[];
  damage_type?: string | null;
  /** Notatka operacyjna; dla „Inny powód” odrzucenia — treść uzasadnienia. */
  note?: string | null;
};

export type WmsReturnLineSplitProcess = {
  product_id: number;
  accepted_qty: number;
  damaged_qty: number;
  damaged_b_qty: number;
  damaged_c_qty: number;
  rejected_qty: number;
  condition?: "A" | "B" | "C" | null;
  photo_urls?: string[];
  damage_type?: string | null;
  /** Gdy niepusta przy uszkodzeniach — serwer zapisuje jako niezależne wpisy (priorytet nad zagregowanym damaged_*). */
  damage_entries?: WmsReturnLineDamageEntryPayload[];
};

export type WmsReturnFinalizeLineIn = WmsReturnLineSplitProcess & {
  order_item_id: number;
};

export type WmsReturnFinalizeBody = {
  lines: WmsReturnFinalizeLineIn[];
  process_refund?: boolean;
  refund?: WmsRefundCreate | null;
};

export type WmsRefundRead = {
  id: number;
  rmz_id: number;
  refund_type: "FULL" | "PARTIAL" | "NONE";
  refund_amount?: number | null;
  refund_shipping: boolean;
  refund_shipping_amount?: number | null;
  decided_by?: string | null;
  decided_at?: string | null;
};

export type WmsRefundCreate = {
  refund_type: "FULL" | "PARTIAL" | "NONE";
  refund_amount?: number | null;
  refund_shipping: boolean;
  refund_shipping_amount?: number | null;
  decided_by?: string | null;
};
