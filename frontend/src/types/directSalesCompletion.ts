export type DirectSalePaymentTransaction = {
  id: number;
  method: string;
  amount: number;
  status: string;
  external_ref: string | null;
};

export type DirectSalePaymentDetail = {
  payment_id: number | null;
  method: string | null;
  status: string | null;
  amount: number | null;
  authorization_reference: string | null;
  external_transaction_id: string | null;
  settlement_state: string | null;
  transactions: DirectSalePaymentTransaction[];
};

export type DirectSaleDocumentDetail = {
  job_id: number | null;
  document_number: string | null;
  document_subtype: string | null;
  status: string | null;
  status_label: string | null;
  fiscal_status: string | null;
  sale_document_id: string | null;
  error_message: string | null;
};

export type DirectSaleLineTrace = {
  product_id: number;
  product_name: string | null;
  sku: string | null;
  source_location_code: string | null;
  issued_qty: number;
  movement_id: number | null;
  reservation_id: number | null;
  stock_before: number | null;
  stock_after: number | null;
  issued_at: string | null;
};

export type DirectSaleStockDelta = {
  location_code: string;
  product_name: string;
  qty_issued: number;
  stock_before: number | null;
  stock_after: number | null;
};

export type DirectSaleTimelineEvent = {
  at: string | null;
  kind: string;
  label: string;
  detail: string | null;
};

export type DirectSaleCompletion = {
  session_id: number;
  order_id: number;
  order_number: string | null;
  payment_id: number | null;
  document_job_id: number | null;
  document_number: string | null;
  document_subtype: string | null;
  total_amount: number;
  payment_status: string | null;
  payment_method: string | null;
  completed_at: string | null;
  operator_label: string | null;
  warehouse_id: number | null;
  lines: DirectSaleLineTrace[];
  stock_deltas: DirectSaleStockDelta[];
  timeline: DirectSaleTimelineEvent[];
  payment: DirectSalePaymentDetail | null;
  document: DirectSaleDocumentDetail | null;
};

export type DirectSaleHistoryEntry = {
  session_id: number;
  order_id: number | null;
  order_number: string | null;
  operator_label: string | null;
  total_amount: number;
  payment_method: string | null;
  payment_status: string | null;
  document_number: string | null;
  document_subtype: string | null;
  document_status: string | null;
  status: string;
  completed_at: string | null;
};

export type DirectSaleCompleteError = {
  message: string;
  code: string | null;
  step: string | null;
  phase: "payment" | "document" | "issue" | "unknown";
};
