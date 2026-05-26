export type OrderUiMainGroup = "NEW" | "IN_PROGRESS" | "DONE";

export type OrderUiPanelSubgroupRead = {
  id: number;
  tenant_id: number;
  warehouse_id: number;
  main_group: OrderUiMainGroup;
  name: string;
  sort_order: number;
};

export type OrderUiStatusBrief = {
  id: number;
  name: string;
  color: string;
  main_group: OrderUiMainGroup;
  group_name?: string | null;
  subgroup_name?: string | null;
  badge_color?: string;
  background_color?: string;
  text_color?: string;
  image_url?: string | null;
  is_active?: boolean;
};

export type OrderUiStatusRead = OrderUiStatusBrief & {
  tenant_id: number;
  warehouse_id: number;
  sort_order: number;
  /** When true, row cannot be deleted, reordered, or have sort changed via PATCH. */
  is_system?: boolean;
  sort_group?: number;
  sort_subgroup?: number;
  sort_status?: number;
};

export type OrderUiStatusWmsRole = "picking_source" | "picking_target" | "both";

export type OrderUiStatusWithCount = OrderUiStatusRead & {
  count: number;
  /** Powiązanie z ``picking_config`` — oznaczenie roli WMS przy statusie panelu. */
  wms_workflow_role?: OrderUiStatusWmsRole | null;
};

export type OrderUiPanelGroupBlock = {
  main_group: OrderUiMainGroup;
  group_display_name?: string | null;
  total_count: number;
  sub_statuses: OrderUiStatusWithCount[];
};

export type OrderUiStatusPanelSummary = {
  groups: OrderUiPanelGroupBlock[];
  unassigned_count: number;
};

export type OrderUiStatusCreatePayload = {
  name: string;
  main_group: OrderUiMainGroup;
  color?: string;
  sort_order?: number;
  group_name?: string | null;
  subgroup_name?: string | null;
  sort_group?: number;
  sort_subgroup?: number;
  sort_status?: number | null;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  image_url?: string | null;
  is_active?: boolean;
};

export type OrderUiStatusUpdatePayload = {
  name?: string;
  main_group?: OrderUiMainGroup;
  color?: string;
  sort_order?: number;
  group_name?: string | null;
  subgroup_name?: string | null;
  sort_group?: number;
  sort_subgroup?: number;
  sort_status?: number | null;
  badge_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
};
