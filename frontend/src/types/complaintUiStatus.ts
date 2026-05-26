export type ComplaintUiMainGroup = "NEW" | "IN_PROGRESS" | "DONE";

export type ComplaintUiStatusBrief = {
  id: number;
  name: string;
  color: string;
  main_group: ComplaintUiMainGroup;
};

export type ComplaintUiStatusRead = ComplaintUiStatusBrief & {
  tenant_id: number;
  sort_order: number;
};

export type ComplaintUiStatusWithCount = ComplaintUiStatusRead & {
  count: number;
};

export type ComplaintUiPanelGroupBlock = {
  main_group: ComplaintUiMainGroup;
  total_count: number;
  sub_statuses: ComplaintUiStatusWithCount[];
};

export type ComplaintUiStatusPanelSummary = {
  groups: ComplaintUiPanelGroupBlock[];
  unassigned_count: number;
};

export type ComplaintUiStatusCreatePayload = {
  name: string;
  main_group: ComplaintUiMainGroup;
  color?: string;
  sort_order?: number;
};

export type ComplaintUiStatusUpdatePayload = {
  name?: string;
  main_group?: ComplaintUiMainGroup;
  color?: string;
  sort_order?: number;
};
