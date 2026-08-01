import type { OrderCaseLineCondition } from "../caseCreate/orderCaseCreateTypes";

export type CustomerRefundMethod = "bank_transfer" | "store_credit" | "other";

export type CustomerReturnLineDraft = {
  orderItemId: number;
  productId: number;
  productName: string;
  sku: string | null;
  ean: string | null;
  imageUrl: string | null;
  purchasedQty: number;
  unitPrice: number;
  returnQty: number;
  reasonId: string;
  condition: OrderCaseLineCondition;
  comment: string;
  photoFiles: File[];
};

export type CustomerReturnBankDetails = {
  accountHolder: string;
  iban: string;
};

export type CustomerReturnMeta = {
  refundShipping: boolean;
  refundMethod: CustomerRefundMethod;
  bank: CustomerReturnBankDetails;
};

export type CustomerReturnOrderLite = {
  id: number;
  number?: string | null;
  tenant_id?: number;
  warehouse_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  customer?: { id: number; display_name: string } | null;
  addresses_json?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  wms_packed_at?: string | null;
  panel_shipping_cost?: number | null;
  shipping_revenue_net?: number | null;
  sales_document_number?: string | null;
  panel_document_type?: string | null;
  items?: Array<{
    id: number;
    quantity: number;
    unit_price_gross?: number | null;
    unit_price?: number | null;
    unit_price_net?: number | null;
    list_price?: number | null;
    product?: {
      id?: number;
      name?: string | null;
      sku?: string | null;
      symbol?: string | null;
      ean?: string | null;
      image_url?: string | null;
    } | null;
    is_bundle_parent?: boolean;
  }>;
};

export type CustomerReturnCatalogRow = {
  orderItemId: number;
  productId: number;
  name: string;
  sku: string | null;
  ean: string | null;
  imageUrl: string | null;
  purchasedQty: number;
  unitPrice: number;
  added: boolean;
};
