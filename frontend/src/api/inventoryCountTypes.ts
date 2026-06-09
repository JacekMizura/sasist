/** Shared inventory count API types — import from `@/api/inventoryCountApi` barrel. */

export type InventorySubmitReadiness = {
  can_submit: boolean;
  block_code?: string | null;
  block_message?: string | null;
  details?: Record<string, unknown>;
};

export type InventoryDocumentRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  number: string;
  title?: string | null;
  inventory_type: string;
  status: string;
  count_mode: string;
  lock_mode: string;
  movement_policy?: string;
  result_policy?: string;
  recount_required: boolean;
  scan_mode: string;
  filters: Record<string, unknown>;
  strategy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  notes: string | null;
  total_lines: number;
  counted_lines: number;
  difference_lines: number;
  coverage_percent: number;
  snapshot_created_at: string | null;
  started_at: string | null;
  updated_at: string | null;
  submit_readiness?: InventorySubmitReadiness | null;
};

export type WmsActiveInventoryDocumentRead = InventoryDocumentRead & {
  scope_summary: string;
  operator_count: number;
  conflict_count: number;
  last_activity_at: string | null;
  can_count: boolean;
};

export type InventoryPostingPreviewLine = {
  line_id: number;
  product_id: number | null;
  sku: string | null;
  location_id: number;
  location_name: string | null;
  carrier_code: string | null;
  quantity: number;
  unit_cost_net?: number;
  value_net?: number;
  stock_source?: string;
};

export type InventoryPostingPreview = {
  document_id: number;
  document_number: string;
  result_policy: string;
  updates_stock: boolean;
  valuation_method: string;
  valuation_label: string;
  shortage_lines: number;
  surplus_lines: number;
  unknown_products_count: number;
  affected_locations_count: number;
  total_shortage_value_net: number;
  total_surplus_value_net: number;
  net_correction_value: number;
  operator_count: number;
  unresolved_conflicts: number;
  rw_preview: InventoryPostingPreviewLine[];
  pw_preview: InventoryPostingPreviewLine[];
  summary: Record<string, unknown>;
};

export type InventoryConflictOperator = {
  user_id: number | null;
  operator_name: string;
  quantity: number;
  counted_at: string | null;
};

export type InventoryConflictCount = {
  count_id: number;
  user_id: number | null;
  operator_name: string;
  counted_qty: number;
  created_at: string | null;
  rejected?: boolean;
};

export type InventoryConflictStatus =
  | "conflict_open"
  | "conflict_resolved_manual"
  | "recount_requested"
  | "recount_completed"
  | "required"
  | "resolved"
  | "none";

export type InventoryConflictItem = {
  line_id: number;
  location_id: number;
  location_name: string | null;
  product_id: number;
  sku: string | null;
  ean?: string | null;
  product_name: string | null;
  product_image_url?: string | null;
  carrier_id: number | null;
  carrier_code: string | null;
  stock_source: string;
  expected_quantity: number | null;
  counted_quantity: number | null;
  operators: InventoryConflictOperator[];
  counts: InventoryConflictCount[];
  conflict_status: InventoryConflictStatus | string;
  quantity_diff_label: string | null;
  recount_state: string;
  recount_id: number | null;
  recount_status: string | null;
};

export type InventoryConflictsRead = {
  document_id: number;
  total_conflicts: number;
  unresolved_conflicts: number;
  items: InventoryConflictItem[];
};

export type InventoryUnknownProductRead = {
  id: number;
  inventory_document_id: number;
  inventory_task_id: number | null;
  warehouse_id: number;
  location_id: number;
  temporary_name: string;
  barcode_value: string | null;
  quantity: number;
  notes: string | null;
  photo_url: string | null;
  status: string;
  mapped_product_id: number | null;
  reported_by_user_id: number | null;
  created_at: string | null;
};

export type InventoryDashboardPayload = {
  kpis: {
    active_inventories: number;
    awaiting_approval: number;
    open_differences: number;
    completed_last_7_days: number;
    warehouse_coverage_percent: number;
    active_operator_sessions: number;
  };
  active_inventories: InventoryDocumentRead[];
  awaiting_approval: InventoryDocumentRead[];
  recent_completed: InventoryDocumentRead[];
  difference_stats?: Record<string, number>;
  heatmap_preview?: Array<Record<string, unknown>>;
  operator_activity?: Array<Record<string, unknown>>;
  dashboard_status?: string;
  failed_sections?: string[];
  section_errors?: Array<{
    section: string;
    error_type: string;
    message: string;
    traceback?: string | null;
  }>;
  schema_audit?: Record<string, unknown> | null;
};

export type InventoryTaskRead = {
  id: number;
  inventory_document_id: number;
  warehouse_id: number;
  location_id: number;
  location_code: string | null;
  location_name: string | null;
  task_number: string;
  status: string;
  priority: number;
  progress_percent: number;
  sequence_no: number;
  zone_code?: string | null;
  aisle_code?: string | null;
  line_count?: number;
  counted_line_count?: number;
  inventory_type?: string | null;
};

export type WmsTaskLineRead = {
  id: number;
  product_id: number | null;
  sku: string | null;
  ean: string | null;
  product_name: string | null;
  image_url?: string | null;
  counted_quantity: number | null;
  my_counted_quantity?: number | null;
  status: string;
  carrier_id?: number | null;
  carrier_code?: string | null;
};

export type InventoryTaskCompact = InventoryTaskRead & {
  assigned_user_id?: number | null;
  assigned_operator_name?: string | null;
  has_variance?: boolean;
  recount_flag?: boolean;
  unresolved?: boolean;
  last_activity_at?: string | null;
  aisle_code?: string | null;
};

export type InventoryTaskPage = {
  items: InventoryTaskCompact[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
};

export type InventoryUniversalSearchResult = {
  query: string;
  locations: Array<{
    location_id: number;
    location_code: string;
    zone?: string | null;
    aisle?: string | null;
    carrier_id?: number;
  }>;
  products: Array<{
    product_id: number;
    sku?: string | null;
    ean?: string | null;
    name?: string | null;
    catalog_number?: string | null;
    image_url?: string | null;
    locations?: string[];
    stock_hint?: string | null;
  }>;
  tasks: Array<{
    task_id: number;
    task_number: string;
    location_id: number;
    location_code?: string | null;
    status: string;
    progress_percent: number;
  }>;
};

export type ResolveLocationScanResult = {
  found: boolean;
  reason?: string;
  task_id?: number;
  location_id?: number;
  location_code?: string;
  inventory_document_id?: number;
  progress_percent?: number;
};

export type InventoryExecutionLine = {
  line_id?: number;
  product_id?: number;
  unknown_id?: number;
  sku?: string | null;
  ean?: string | null;
  product_name?: string | null;
  temporary_name?: string;
  counted_quantity?: number | null;
  expected_quantity?: number | null;
  difference_quantity?: number | null;
  quantity?: number;
  status?: string;
  category?: string;
  variance_severity?: string;
  variance_message?: string;
};

export type InventoryExecutionSummary = {
  task_id: number;
  location_id: number;
  location_code: string | null;
  blind_mode: boolean;
  progress_percent: number;
  line_count: number;
  counted_line_count: number;
  pending: InventoryExecutionLine[];
  counted: InventoryExecutionLine[];
  variance: InventoryExecutionLine[];
  unexpected: InventoryExecutionLine[];
};

export type TaskQueueQuery = {
  documentId?: number;
  zone?: string;
  status?: string;
  recountOnly?: boolean;
  unresolvedOnly?: boolean;
  varianceOnly?: boolean;
  completedOnly?: boolean;
  search?: string;
  offset?: number;
  limit?: number;
};

export type InventoryLineRead = {
  id: number;
  location_id: number;
  location_name: string | null;
  product_id: number;
  sku: string | null;
  ean: string | null;
  product_name: string | null;
  product_image_url?: string | null;
  expected_quantity: number | null;
  counted_quantity: number | null;
  difference_quantity: number | null;
  difference_class?: string | null;
  recount_state?: string | null;
  status: string;
  batch_number: string | null;
  serial_number: string | null;
  recount_count: number;
  carrier_id?: number | null;
  carrier_code?: string | null;
  last_counted_at?: string | null;
  last_counted_by_user_id?: number | null;
  last_counted_by_name?: string | null;
};

export type InventoryLineFocus = "operational" | "all" | "differences" | "uncounted";

export type InventoryAuditLineContext = {
  line_id?: number;
  product_id?: number | null;
  product_name?: string | null;
  sku?: string | null;
  ean?: string | null;
  product_image_url?: string | null;
  location_id?: number | null;
  location_name?: string | null;
};

export type InventoryAuditEventRead = {
  id: number;
  action: string;
  user_id: number | null;
  user_name?: string | null;
  inventory_document_line_id?: number | null;
  session_id?: number | null;
  device_id?: string | null;
  detail?: unknown;
  previous_state?: unknown;
  next_state?: unknown;
  line_context?: InventoryAuditLineContext | null;
  location_name?: string | null;
  created_at: string | null;
};

export type InventoryDocumentTimelines = {
  document_id: number;
  approval_timeline: Array<{
    id: number;
    action: string;
    user_id: number | null;
    user_name?: string | null;
    notes: string | null;
    created_at: string | null;
  }>;
  recount_timeline: Array<{
    id: number;
    status: string;
    line_id: number;
    assigned_user_id: number | null;
    assigned_user_name?: string | null;
    completed_by_user_name?: string | null;
    reason: string | null;
    created_at: string | null;
    completed_at: string | null;
    line_context?: InventoryAuditLineContext | null;
  }>;
  posting_timeline: InventoryAuditEventRead[];
};

export type InventoryApprovalActionResult = {
  status: string;
  analysis?: unknown;
  recounts_created?: number;
  approved_at?: string | null;
};

export type WmsDiscrepancyClass =
  | "EXPECTED"
  | "EXTRA_PRODUCT"
  | "UNPLANNED_PRODUCT"
  | "WRONG_LOCATION"
  | "UNKNOWN_PRODUCT";

export type WmsBarcodeResolveResult = {
  line_id: number;
  product_id: number;
  product_name: string | null;
  sku: string | null;
  ean: string | null;
  barcode: string;
  image_url?: string | null;
  expected_quantity: number;
  counted_quantity: number;
  my_counted_quantity?: number | null;
  operator_count_conflict?: boolean;
  operator_quantities?: Record<number, number>;
  difference_quantity?: number | null;
  discrepancy_class: WmsDiscrepancyClass;
  discrepancy_label: string;
  location_id: number;
  location_code?: string | null;
  carrier_id?: number | null;
  line_created?: boolean;
};

export type WmsCarrierResolveResult = {
  carrier_id: number;
  code: string;
  barcode?: string | null;
  name?: string | null;
  current_location_id?: number | null;
};

export type WmsRecentScanEntry = WmsBarcodeResolveResult & {
  scanned_at: string;
  scan_delta?: number;
};

export type WmsBarcodeResolveErrorCode =
  | "barcode_not_found"
  | "line_not_found_for_barcode"
  | "barcode_ambiguous"
  | "task_not_found"
  | "unknown";

export const tenantParams = (tenantId: number, warehouseId?: number | null) => ({
  tenant_id: tenantId,
  ...(warehouseId != null ? { warehouse_id: warehouseId } : {}),
});
