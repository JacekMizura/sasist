/** Unified sale document DTO — same shape from list, detail, and Direct Sales summary. */

export type SaleDocumentVatRow = {
  vat_percent: number;
  net: number;
  vat: number;
  gross: number;
};

export type SaleDocumentLine = {
  order_item_id: number;
  product_id: number;
  name: string;
  sku: string | null;
  quantity: number;
  unit_net: number | null;
  unit_gross: number | null;
  vat_percent: number;
  line_net: number;
  line_vat: number;
  line_gross: number;
};

export type SaleDocumentPayment = {
  payment_id: number | null;
  method: string | null;
  status: string | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_label_pl: string;
  paid: boolean;
  amount: number;
  currency: string;
  captured_at: string | null;
  external_transaction_id: string | null;
  authorization_reference?: string | null;
  transactions: Array<{
    id: number;
    method: string;
    amount: number;
    status: string;
    external_ref?: string | null;
    created_at?: string | null;
  }>;
};

export type SaleDocumentFinancials = {
  total_net: number;
  total_gross: number;
  total_vat: number;
  lines: SaleDocumentLine[];
  vat_rows: SaleDocumentVatRow[];
};

export type SaleDocumentParty = {
  id?: number | null;
  name: string;
  nip?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  bank?: string | null;
  iban?: string | null;
};

export type SaleDocumentBase = {
  id: string;
  order_id: number;
  order_number: string;
  document_series_id: string;
  document_type_id: string;
  document_subtype: string;
  panel_document_type: string;
  doc_type: string;
  series: string;
  client: string;
  document_number: string;
  document_number_raw: string;
  numbering_status: "valid" | "legacy" | string;
  numbering_legacy: boolean;
  date: string | null;
  created_at: string | null;
  currency: string;
  financials: SaleDocumentFinancials;
  total_net: number;
  total_gross: number;
  total_vat: number;
  net: number;
  gross: number;
  vat: number;
  payment: SaleDocumentPayment;
  payment_method: string | null;
  payment_status: string | null;
  payment_label_pl: string;
  paid: boolean;
  external_status: string;
  detail_path: string;
};

export type SaleDocumentListRow = SaleDocumentBase;

export type SaleDocumentDetail = SaleDocumentBase & {
  warehouse_name: string | null;
  lines: SaleDocumentLine[];
  vat_rows: SaleDocumentVatRow[];
  buyer: SaleDocumentParty;
  seller: SaleDocumentParty;
  series_meta: {
    id: string | null;
    name: string | null;
    prefix: string | null;
    subtype: string | null;
    warehouse_effect: boolean;
  };
  warehouse_effects: {
    enabled: boolean;
    order_fulfillment_mode: string | null;
    movements: Array<{
      id: number;
      movement_type: string;
      quantity: number;
      product_id: number | null;
      location_id: number | null;
      created_at: string | null;
    }>;
  };
  related: {
    order_id: number;
    order_number: string;
    order_path: string;
    sale_document_id?: string;
    warehouse_documents: Array<{
      id: number;
      document_type: string;
      document_number: string;
      link_type: string;
      status?: string;
      created_at?: string | null;
      detail_path: string;
    }>;
  };
  history: Array<{
    at: string | null;
    action: string;
    source: string;
    detail: string;
  }>;
  print: { available: boolean; template_id: number | null };
  export: { available: boolean };
  status_badges: {
    doc_type: string;
    payment_status: string | null;
    paid: boolean;
    numbering_status: string;
    external_status: string;
  };
};
