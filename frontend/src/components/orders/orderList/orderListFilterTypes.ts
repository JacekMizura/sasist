/** Applied filters sent to GET /orders/ (draft is edited until „Zastosuj”). */
export type AppliedOrderListFilters = {
  search: string;
  panelStatusIds: number[];
  paymentStatus: string;
  shippingMethodId: string;
  dateFrom: string;
  dateTo: string;
  /** When set, overrides header warehouse for this list request. */
  warehouseIdOverride: number | null;
  sourceContains: string;
  valueMin: string;
  valueMax: string;
  /** `single` | `multi` | "" */
  orderType: string;
  paidOnly: boolean;
  unpaidOnly: boolean;
  withDocument: boolean;
  withoutDocument: boolean;
  /** Lista GET /orders — pokaż zamówienia zarchiwizowane (orders.deleted_at). */
  includeArchived: boolean;
};

export const DEFAULT_APPLIED_ORDER_LIST_FILTERS: AppliedOrderListFilters = {
  search: "",
  panelStatusIds: [],
  paymentStatus: "",
  shippingMethodId: "",
  dateFrom: "",
  dateTo: "",
  warehouseIdOverride: null,
  sourceContains: "",
  valueMin: "",
  valueMax: "",
  orderType: "",
  paidOnly: false,
  unpaidOnly: false,
  withDocument: false,
  withoutDocument: false,
  includeArchived: false,
};
