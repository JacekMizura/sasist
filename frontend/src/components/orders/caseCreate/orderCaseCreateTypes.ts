export type OrderCaseKind = "return" | "complaint";

export type OrderCaseLineCondition = "new" | "opened" | "damaged" | "incomplete";

export type OrderCaseLineDraft = {
  orderItemId: number;
  productId: number;
  productName: string;
  sku: string | null;
  imageUrl: string | null;
  purchasedQty: number;
  unitPrice: number;
  returnQty: number;
  reasonId: string;
  condition: OrderCaseLineCondition;
  comment: string;
};

export type OrderCaseSettlement = "refund" | "exchange" | "store_credit" | "repair";

export type OrderCaseDraftMeta = {
  refundShipping: boolean;
  settlement: OrderCaseSettlement;
  note: string;
};
