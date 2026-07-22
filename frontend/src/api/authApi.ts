import api from "./axios";

import type { CatModTreeNode } from "../components/admin/PermissionTreePanel";

export type WmsTopbarPinItem = {
  key: string;
  pinned: boolean;
  order: number;
};

export type WmsProfilePayload = {
  barcode_login_code?: string | null;
  language?: string;
  default_warehouse_id?: number | null;
  warehouse_ids?: number[];
  require_scan_every_product?: boolean;
  can_edit_products_preview?: boolean;
  picking_permissions?: string[] | null;
  packing_permissions?: string[] | null;
  picker_color?: string | null;
  packing_station_id?: number | null;
  default_printer_id?: number | null;
  timezone?: string;
  wms_operational_modes?: string[];
  workforce_supervisor_user_id?: number | null;
  workforce_employment_type?: string | null;
  workforce_shift_type?: string | null;
  workforce_active_warehouse_zone_ids?: number[];
  workforce_default_workstation?: string | null;
  workforce_color_tag?: string | null;
  login_code_label_template_id?: number | null;
};

export type WmsProfileResponse = {
  barcode_login_code?: string | null;
  language: string;
  default_warehouse_id?: number | null;
  active_warehouse_id?: number | null;
  warehouse_ids: number[];
  require_scan_every_product: boolean;
  can_edit_products_preview: boolean;
  picking_permissions?: string[] | null;
  packing_permissions?: string[] | null;
  picker_color?: string | null;
  packing_station_id?: number | null;
  default_printer_id?: number | null;
  timezone: string;
  wms_operational_modes?: string[];
  /** null = brak zapisu (FE stosuje default). */
  wms_topbar_pins?: WmsTopbarPinItem[] | null;
  workforce_supervisor_user_id?: number | null;
  workforce_employment_type?: string | null;
  workforce_shift_type?: string | null;
  workforce_active_warehouse_zone_ids?: number[];
  workforce_default_workstation?: string | null;
  workforce_color_tag?: string | null;
  login_code_label_template_id?: number | null;
};

export type PrimaryWorkforceGroupBadge = {
  id: number;
  name: string;
  color: string;
  icon_key: string;
};

export type MeResponse = {
  id: number;
  login: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_active: boolean;
  language: string;
  permissions: string[];
  /** Keys stored in user_permissions (for admin edit form). */
  explicit_permissions?: string[];
  last_login_at: string | null;
  password_must_change?: boolean;
  is_system_seed?: boolean;
  is_system_user?: boolean;
  is_owner?: boolean;
  is_deletable?: boolean;
  is_role_changeable?: boolean;
  show_dev_credentials_warning?: boolean;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  wms_profile: WmsProfileResponse;
  /** @deprecated mirrors — use wms_profile */
  wms_language?: string | null;
  barcode_login_code?: string | null;
  default_warehouse_id?: number | null;
  active_warehouse_id?: number | null;
  warehouse_ids?: number[];
  primary_workforce_group_id?: number | null;
  primary_workforce_group?: PrimaryWorkforceGroupBadge | null;
  /** Flat mirror of wms_profile.wms_operational_modes */
  wms_operational_modes?: string[];
  /** Flat mirror — null = brak zapisu (default FE). */
  wms_topbar_pins?: WmsTopbarPinItem[] | null;
};

export type AppUserListItem = {
  id: number;
  login: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_active: boolean;
  language: string;
  last_login_at: string | null;
  created_at?: string | null;
  phone?: string | null;
  warehouse_summary?: string | null;
  warehouse_names?: string[];
  default_warehouse_id?: number | null;
  is_system_seed?: boolean;
  is_system_user?: boolean;
  is_owner?: boolean;
  is_deletable?: boolean;
  is_role_changeable?: boolean;
  wms_language?: string | null;
  primary_workforce_group?: PrimaryWorkforceGroupBadge | null;
  wms_operational_modes?: string[];
  /** Non-expired refresh session present (presence — not account is_active). */
  has_active_session?: boolean;
};

export type PermissionCatalogResponse = {
  keys: string[];
  tree: CatModTreeNode[];
  presets: Record<string, string[]>;
};

export type AuditLogItem = {
  id: number;
  created_at: string;
  user_id: number | null;
  login: string | null;
  action: string;
  module: string | null;
  entity_type: string | null;
  entity_id: number | null;
  detail: Record<string, unknown> | null;
};

/** Same contract as Swagger: POST /api/auth/login, application/json, body { login, password }. */
export async function loginRequest(login: string, password: string) {
  const res = await api.post<{ access_token: string; refresh_token: string; token_type: string }>(
    "auth/login",
    { login, password },
  );
  return res.data;
}

export async function refreshRequest(refresh_token: string) {
  const res = await api.post<{ access_token: string; refresh_token: string; token_type: string }>("/auth/refresh", {
    refresh_token,
  });
  return res.data;
}

export async function logoutRequest(refresh_token: string) {
  await api.post("/auth/logout", { refresh_token });
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await api.get<MeResponse>("/auth/me");
  return res.data;
}

export async function putWmsTopbarPins(pins: WmsTopbarPinItem[]): Promise<WmsTopbarPinItem[]> {
  const res = await api.put<{ pins: WmsTopbarPinItem[] | null; saved: boolean }>(
    "/auth/me/wms-topbar-pins",
    { pins },
  );
  return res.data.pins ?? pins;
}

export type WarehouseBrief = {
  id: number;
  name: string;
  requires_putaway?: boolean;
};

export type WarehouseContextResponse = {
  active_warehouse_id: number | null;
  warehouses: WarehouseBrief[];
  show_warehouse_selector: boolean;
  assignments: Array<{ warehouse_id: number; is_default: boolean; can_operate: boolean }>;
  uses_legacy_all_warehouses: boolean;
  active_warehouse_requires_putaway?: boolean;
};

export async function fetchWarehouseContext(): Promise<WarehouseContextResponse> {
  const res = await api.get<WarehouseContextResponse>("/auth/me/warehouse-context");
  return res.data;
}

export async function setActiveWarehouse(warehouseId: number): Promise<WarehouseContextResponse> {
  const res = await api.put<WarehouseContextResponse>("/auth/me/active-warehouse", {
    warehouse_id: warehouseId,
  });
  return res.data;
}

export async function fetchUsers(): Promise<AppUserListItem[]> {
  const res = await api.get<AppUserListItem[]>("/auth/users");
  return res.data;
}

export async function fetchUser(userId: number): Promise<MeResponse> {
  const res = await api.get<MeResponse>(`/auth/users/${userId}`);
  return res.data;
}

export type CreateUserPayload = {
  login: string;
  email: string;
  password: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string;
  is_active?: boolean;
  language?: string;
  /** Denormalized WMS UI language (must match backend ``app_users.wms_language``). */
  wms_language?: string;
  wms_currency?: string;
  permissions: string[];
  wms_profile?: WmsProfilePayload;
  primary_workforce_group_id?: number | null;
};

/** Persists via ``POST /api/auth/users`` (mirrored by ``/api/admin/users``). */
export async function createUser(payload: CreateUserPayload) {
  const res = await api.post<AppUserListItem>("/auth/users", payload);
  return res.data;
}

let permissionCatalogPromise: Promise<PermissionCatalogResponse> | null = null;

/** Clear cached permission catalog (call on logout so next session refetches). */
export function clearPermissionCatalogCache(): void {
  permissionCatalogPromise = null;
}

export async function updateUser(
  userId: number,
  payload: {
    email?: string | null;
    password?: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    role?: string | null;
    is_active?: boolean | null;
    language?: string | null;
    wms_language?: string | null;
    wms_currency?: string | null;
    permissions?: string[] | null;
    wms_profile?: Partial<WmsProfilePayload> | null;
    primary_workforce_group_id?: number | null;
  },
) {
  const res = await api.patch<AppUserListItem>(`/auth/users/${userId}`, payload);
  return res.data;
}

export async function deleteUser(userId: number) {
  await api.delete(`/auth/users/${userId}`);
}

export async function resetUserPassword(userId: number, password: string) {
  await api.post(`/auth/users/${userId}/reset-password`, { password });
}

export type PermissionPresetDto = {
  id: number;
  name: string;
  description: string | null;
  visibility: "personal" | "organization";
  permission_keys: string[];
  created_by_user_id: number | null;
  created_at: string;
};

export async function fetchCustomPermissionPresets(): Promise<PermissionPresetDto[]> {
  const res = await api.get<PermissionPresetDto[]>("/auth/permissions/custom-presets");
  return res.data;
}

export async function createCustomPermissionPreset(payload: {
  name: string;
  description?: string | null;
  visibility: "personal" | "organization";
  permission_keys: string[];
}): Promise<PermissionPresetDto> {
  const res = await api.post<PermissionPresetDto>("/auth/permissions/custom-presets", payload);
  return res.data;
}

export async function updateCustomPermissionPreset(
  presetId: number,
  payload: Partial<{
    name: string;
    description: string | null;
    visibility: "personal" | "organization";
    permission_keys: string[];
  }>,
): Promise<PermissionPresetDto> {
  const res = await api.patch<PermissionPresetDto>(`/auth/permissions/custom-presets/${presetId}`, payload);
  return res.data;
}

export async function deleteCustomPermissionPreset(presetId: number): Promise<void> {
  await api.delete(`/auth/permissions/custom-presets/${presetId}`);
}

/** Upload avatar image; returns public ``/uploads/avatars/...`` path. */
export async function uploadUserAvatar(userId: number, file: File): Promise<{ avatar_url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<{ avatar_url: string }>(`/auth/users/${userId}/avatar`, fd);
  return res.data;
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalogResponse> {
  if (!permissionCatalogPromise) {
    permissionCatalogPromise = api
      .get<PermissionCatalogResponse>("/auth/permissions/catalog")
      .then((res) => res.data)
      .catch((e) => {
        permissionCatalogPromise = null;
        throw e;
      });
  }
  return permissionCatalogPromise;
}

export async function fetchAuditLogs(params?: { skip?: number; limit?: number; q?: string }) {
  const res = await api.get<AuditLogItem[]>("/auth/audit-logs", {
    params: {
      skip: params?.skip ?? 0,
      limit: params?.limit ?? 50,
      q: params?.q,
    },
  });
  return res.data;
}

export async function changePassword(current_password: string, new_password: string) {
  await api.post("/auth/change-password", { current_password, new_password });
}

export type { ApiOperationalErrorDetail } from "./apiErrorMessage";
export {
  extractApiErrorMessage,
  extractApiOperationalErrorDetail,
} from "./apiErrorMessage";
