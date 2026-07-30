/**
 * OrderDetailPage domain types + presets.
 * Extracted from OrderDetailPage.tsx — no logic changes.
 */
import type { FulfillmentAssignmentPhase } from "../../api/orderFulfillmentApi";
import type { OrderNoteDto, OrderOperationalNoteDto } from "../../api/ordersApi";
import type { OrderUiStatusBrief } from "../../types/orderUiStatus";

export type SourceBundleBrief = { id: number; name: string; sku?: string | null };

export type OrderItemRow = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  unit_price_net?: number | null;
  unit_price_gross?: number | null;
  vat_percent?: number | null;
  unit?: string | null;
  list_price?: number | null;
  total_price?: number | null;
  line_net_total?: number | null;
  line_vat_amount?: number | null;
  line_gross_total?: number | null;
  line_purchase_total_net?: number | null;
  line_margin_amount?: number | null;
  line_margin_percent?: number | null;
  oms_replacement_original_quantity?: number | null;
  oms_replacement_transferred_quantity?: number | null;
  oms_waiting_for_stock?: boolean;
  oms_line_status?: string | null;
  replaced_from_order_item_id?: number | null;
  replaced_from_product_name?: string | null;
  product?: {
    id?: number;
    name?: string | null;
    ean?: string | null;
    symbol?: string | null;
    sku?: string | null;
    image_url?: string | null;
  };
  source_bundle_id?: number | null;
  bundle_instance_id?: string | null;
  bundle_qty?: number | null;
  from_bundle?: boolean;
  source_bundle?: SourceBundleBrief | null;
  is_bundle_parent?: boolean;
  parent_bundle_order_item_id?: number | null;
  bundle_display_unit_price?: number | null;
  bundle_display_line_total?: number | null;
};

export type OrderDetail = {
  id: number;
  tenant_id?: number;
  warehouse_id?: number;
  number?: string | null;
  status?: string | null;
  scan_code?: string | null;
  value?: number | null;
  discount_type?: "percent" | "amount" | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  total_products_value?: number | null;
  shipping_revenue_net?: number | null;
  total_revenue_net?: number | null;
  total_purchase_cost?: number | null;
  gross_profit?: number | null;
  margin?: number | null;
  currency?: string | null;
  shipping_method_id?: string | null;
  shipping_method?: string | null;
  shipping_method_logo_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  external_id?: string | null;
  source?: string | null;
  order_origin?: string | null;
  complaint_id?: number | null;
  original_order_id?: number | null;
  complaint_order_type?: string | null;
  items: OrderItemRow[];
  order_ui_status?: (OrderUiStatusBrief & {
    badge_color?: string;
    background_color?: string;
    text_color?: string;
    image_url?: string | null;
  }) | null;
  priority_color?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  addresses_json?: string | null;
  sales_document_number?: string | null;
  panel_document_type?: string | null;
  panel_document_series_id?: string | null;
  panel_payment_method?: string | null;
  panel_payment_status?: string | null;
  wms_packed_at?: string | null;
  wms_packed_by_label?: string | null;
  wms_workflow_phase?: string | null;
  fulfillment_assignment_phase?: FulfillmentAssignmentPhase | string | null;
  fulfillment_warehouse_name?: string | null;
  fulfillment_warehouse_change_locked?: boolean;
  fulfillment_assignment_strategy?: string | null;
  fulfillment_assigned_at?: string | null;
  fulfillment_assigned_by_label?: string | null;
  fulfillment_assignment_reason?: string | null;
  panel_amount_paid?: string | null;
  panel_shipping_cost?: number | null;
  panel_shipping_cost_display?: string | null;
  panel_tracking_numbers?: string | null;
  selected_carton_id?: string | null;
  selected_carton?: {
    id: string;
    name: string;
    dimensions?: string | null;
    image_url?: string | null;
  } | null;
  customer_id?: number | null;
  customer?: { id: number; display_name: string } | null;
  panel_fulfillment_history?: {
    at: string;
    lines: string[];
    kind?: string | null;
    product_name?: string | null;
    product_sku?: string | null;
    product_ean?: string | null;
    quantity_ordered?: number | null;
    quantity_before?: number | null;
    quantity_affected?: number | null;
    unit_price?: number | null;
    line_total?: number | null;
  }[];
  order_documents?: {
    id: number;
    document_type: string;
    original_filename: string;
    file_url: string;
    created_at?: string | null;
  }[];
  order_activity_logs?: {
    id: number;
    event_type: string;
    message: string;
    created_at?: string | null;
    operator_user_id?: number | null;
    operator_display?: string | null;
  }[];
  order_notes?: OrderNoteDto[];
  operational_notes?: OrderOperationalNoteDto[];
  has_internal_note?: boolean;
  has_customer_comment?: boolean;
  latest_internal_note_preview?: string | null;
  latest_customer_comment_preview?: string | null;
  order_channel?: string | null;
  fulfillment_mode?: string | null;
  linked_documents?: {
    id: string;
    kind: "sale" | "warehouse";
    document_type: string;
    document_subtype?: string | null;
    document_number: string;
    detail_path: string;
    print_kind?: string | null;
    sale_document_id?: string | null;
    stock_document_id?: number | null;
  }[];
};

export const PAYMENT_METHOD_PRESETS = ["przelew", "pobranie", "BLIK", "karta", "gotówka"] as const;
export const PAYMENT_STATUS_PRESETS = ["nieopłacone", "opłacone", "częściowo", "zwrot"] as const;

export type OrderDetailDocDraft = {
  document_type: "PARAGON" | "INVOICE";
  sales_document_number: string;
  company_name: string;
  nip: string;
  billing_email: string;
};

export type SummaryPanelLogRow = {
  id: string | number;
  at: string;
  user: string;
  /** Machine-readable code (search / dev only). */
  eventKey: string;
  /** Localized label for UI. */
  eventLabel: string;
  msg: string;
  severity: "info" | "warn" | "error";
  /** Sort key ms — newest first. */
  sortAt: number;
};
