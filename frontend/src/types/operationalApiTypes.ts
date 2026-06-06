/** Shared operational API types — no runtime imports (breaks normalize ↔ api cycles). */

export type OperationalAlert = {
  id: number;
  alert_type: string;
  severity: string;
  status: string;
  title: string;
  message?: string | null;
  entity_type?: string | null;
  entity_id?: number | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type LiveEvent = {
  id: number;
  event_type: string;
  channel: string;
  revision?: string | null;
  payload: Record<string, unknown>;
  created_at?: string | null;
};

export type OperatorContext = {
  operator_user_id: number;
  context_type: string;
  cart_id?: number | null;
  zone_id?: number | null;
  active_task_id?: number | null;
  payload?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export type WmsOperationalTaskApi = {
  id: number;
  task_type: string;
  status: string;
  queue: string;
  product_id?: number | null;
  product_name: string;
  product_sku?: string | null;
  product_ean?: string | null;
  image_url?: string | null;
  order_id?: number | null;
  order_number?: string | null;
  order_item_id?: number | null;
  quantity_required: number;
  quantity_done: number;
  quantity_remaining: number;
  location_hint?: string | null;
  substitute_product_id?: number | null;
  substitute_for_product_name?: string | null;
  group_key: string;
  priority: number;
  summary_line: string;
  created_at?: string | null;
  updated_at?: string | null;
  picked_from_location?: string | null;
  relocation_order_count?: number;
  relocation_allocation_count?: number;
  relocation_mode?: "CARRIER" | "LOCATION" | null;
  target_zones?: string[];
  waiting_order_count?: number;
  waiting_oldest_at?: string | null;
  orchestration_state?: string | null;
  assigned_user_id?: number | null;
  sla_due_at?: string | null;
  blocked_reason?: string | null;
  task_payload?: Record<string, unknown>;
};
