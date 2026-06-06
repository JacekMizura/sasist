import type {
  DirectSaleCompletion,
  DirectSaleCompleteError,
  DirectSaleDocumentDetail,
  DirectSaleHistoryEntry,
  DirectSaleLineTrace,
  DirectSalePaymentDetail,
  DirectSaleStockDelta,
  DirectSaleTimelineEvent,
} from "../types/directSalesCompletion";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function normalizeCompletion(raw: unknown): DirectSaleCompletion | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines.map(normalizeLineTrace) : [];
  const stock_deltas = Array.isArray(r.stock_deltas) ? r.stock_deltas.map(normalizeStockDelta) : [];
  const timeline = Array.isArray(r.timeline) ? r.timeline.map(normalizeTimeline) : [];
  return {
    session_id: num(r.session_id),
    order_id: num(r.order_id),
    order_number: strOrNull(r.order_number),
    payment_id: numOrNull(r.payment_id),
    document_job_id: numOrNull(r.document_job_id),
    document_number: strOrNull(r.document_number),
    document_subtype: strOrNull(r.document_subtype),
    total_amount: num(r.total_amount),
    payment_status: strOrNull(r.payment_status),
    payment_method: strOrNull(r.payment_method),
    completed_at: strOrNull(r.completed_at),
    operator_label: strOrNull(r.operator_label),
    warehouse_id: numOrNull(r.warehouse_id),
    lines,
    stock_deltas,
    timeline,
    payment: r.payment ? normalizePayment(r.payment) : null,
    document: r.document ? normalizeDocument(r.document) : null,
  };
}

function normalizeLineTrace(raw: unknown): DirectSaleLineTrace {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    product_id: num(r.product_id),
    product_name: strOrNull(r.product_name),
    sku: strOrNull(r.sku),
    source_location_code: strOrNull(r.source_location_code),
    issued_qty: num(r.issued_qty),
    movement_id: numOrNull(r.movement_id),
    reservation_id: numOrNull(r.reservation_id),
    stock_before: numOrNull(r.stock_before),
    stock_after: numOrNull(r.stock_after),
    issued_at: strOrNull(r.issued_at),
  };
}

function normalizeStockDelta(raw: unknown): DirectSaleStockDelta {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    location_code: String(r.location_code ?? "—"),
    product_name: String(r.product_name ?? "Produkt"),
    qty_issued: num(r.qty_issued),
    stock_before: numOrNull(r.stock_before),
    stock_after: numOrNull(r.stock_after),
  };
}

function normalizeTimeline(raw: unknown): DirectSaleTimelineEvent {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    at: strOrNull(r.at),
    kind: String(r.kind ?? ""),
    label: String(r.label ?? ""),
    detail: strOrNull(r.detail),
  };
}

function normalizePayment(raw: unknown): DirectSalePaymentDetail {
  const r = (raw ?? {}) as Record<string, unknown>;
  const txns = Array.isArray(r.transactions) ? r.transactions : [];
  return {
    payment_id: numOrNull(r.payment_id),
    method: strOrNull(r.method),
    status: strOrNull(r.status),
    amount: numOrNull(r.amount),
    authorization_reference: strOrNull(r.authorization_reference),
    external_transaction_id: strOrNull(r.external_transaction_id),
    settlement_state: strOrNull(r.settlement_state),
    transactions: txns.map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      return {
        id: num(x.id),
        method: String(x.method ?? ""),
        amount: num(x.amount),
        status: String(x.status ?? ""),
        external_ref: strOrNull(x.external_ref),
      };
    }),
  };
}

function normalizeDocument(raw: unknown): DirectSaleDocumentDetail {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    job_id: numOrNull(r.job_id),
    document_number: strOrNull(r.document_number),
    document_subtype: strOrNull(r.document_subtype),
    status: strOrNull(r.status),
    status_label: strOrNull(r.status_label),
    fiscal_status: strOrNull(r.fiscal_status),
    sale_document_id: strOrNull(r.sale_document_id),
    error_message: strOrNull(r.error_message),
  };
}

export function normalizeHistoryEntry(raw: unknown): DirectSaleHistoryEntry {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    session_id: num(r.session_id),
    order_id: numOrNull(r.order_id),
    order_number: strOrNull(r.order_number),
    operator_label: strOrNull(r.operator_label),
    total_amount: num(r.total_amount),
    payment_method: strOrNull(r.payment_method),
    payment_status: strOrNull(r.payment_status),
    document_number: strOrNull(r.document_number),
    document_subtype: strOrNull(r.document_subtype),
    document_status: strOrNull(r.document_status),
    status: String(r.status ?? ""),
    completed_at: strOrNull(r.completed_at),
  };
}

export function parseCompleteError(err: unknown): DirectSaleCompleteError {
  let message = "Nie udało się zakończyć sprzedaży.";
  let code: string | null = null;
  let step: string | null = null;
  let detailObj: Record<string, unknown> | null = null;
  if (err && typeof err === "object" && "response" in err) {
    const ax = err as { response?: { data?: Record<string, unknown> } };
    const data = ax.response?.data;
    const detail = data?.detail;
    const flat =
      data && typeof data.error_type === "string" && typeof data.message === "string" ? data : null;
    if (flat) {
      detailObj = flat;
      message = String(flat.message);
      code = String(flat.error_type ?? flat.code ?? "");
      if (typeof flat.stage === "string") step = flat.stage;
    } else if (typeof detail === "string") message = detail;
    else if (detail && typeof detail === "object") {
      detailObj = detail as Record<string, unknown>;
      if (typeof detailObj.message === "string") message = detailObj.message;
      if (typeof detailObj.code === "string") code = detailObj.code;
      if (typeof detailObj.step === "string") step = detailObj.step;
      if (typeof detailObj.stage === "string" && !step) step = detailObj.stage;
      if (typeof detailObj.error_type === "string" && !code) code = detailObj.error_type;
    }
  }
  let phase: DirectSaleCompleteError["phase"] = "unknown";
  const stepKey = (step ?? "").toLowerCase();
  if (stepKey === "create_payment" || stepKey === "payment") phase = "payment";
  else if (stepKey === "generate_documents" || stepKey === "document") phase = "document";
  else if (
    stepKey === "plan_allocations" ||
    stepKey === "reserve_stock" ||
    stepKey === "issue_stock" ||
    stepKey === "inventory"
  ) {
    phase = "issue";
  }
  const c = (code ?? "").toUpperCase();
  if (phase === "unknown") {
    if (c === "PAYMENT_FAILED" || c.includes("PAYMENT")) phase = "payment";
    else if (c === "DOCUMENT_GENERATION_FAILED" || c.includes("DOCUMENT") || c.includes("JOB")) phase = "document";
    else if (
      c === "OUT_OF_STOCK" ||
      c === "ALLOCATION_FAILED" ||
      c === "ISSUE_FAILED" ||
      c.includes("STOCK") ||
      c.includes("ISSUE") ||
      c.includes("RESERVATION") ||
      c.includes("LOCATION")
    ) {
      phase = "issue";
    }
  }
  if (/internal server error/i.test(message) && detailObj) {
    const detailMsg = typeof detailObj.message === "string" ? detailObj.message : "";
    if (detailMsg) message = detailMsg;
    if (typeof detailObj.error_type === "string") code = detailObj.error_type;
    if (typeof detailObj.stage === "string" && !step) step = detailObj.stage;
  } else if (/internal server error/i.test(message)) {
    message = "Błąd serwera podczas zakończenia sprzedaży — szczegóły w logach operacyjnych.";
    if (!step) step = "commit";
    if (!code) code = "SERVER_ERROR";
  }
  return { message, code, step, phase };
}
