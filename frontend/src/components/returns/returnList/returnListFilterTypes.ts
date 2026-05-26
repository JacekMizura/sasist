export type ReturnArchiveScope = "active" | "archived" | "all";

export type ReturnHasPanelLabel = "" | "yes" | "no";

export type AppliedReturnListFilters = {
  search: string;
  returnStatusId: string;
  panelStatusIds: number[];
  dateFrom: string;
  dateTo: string;
  orderNumber: string;
  customer: string;
  listWarehouseId: number | null;
  shippingMethodId: string;
  hasPanelLabel: ReturnHasPanelLabel;
  tracking: string;
  archiveScope: ReturnArchiveScope;
};

export const DEFAULT_APPLIED_RETURN_LIST_FILTERS: AppliedReturnListFilters = {
  search: "",
  returnStatusId: "",
  panelStatusIds: [],
  dateFrom: "",
  dateTo: "",
  orderNumber: "",
  customer: "",
  listWarehouseId: null,
  shippingMethodId: "",
  hasPanelLabel: "",
  tracking: "",
  archiveScope: "active",
};
