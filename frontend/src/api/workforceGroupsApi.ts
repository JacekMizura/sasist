import api from "./axios";

export type WorkforceUserGroupDto = {
  id: number;
  name: string;
  color: string;
  icon_key: string;
  archived_at: string | null;
  default_permission_keys: string[];
  default_wms_modes: string[];
  created_at: string | null;
  updated_at: string | null;
};

export async function fetchWorkforceUserGroups(includeArchived = false): Promise<WorkforceUserGroupDto[]> {
  const res = await api.get<WorkforceUserGroupDto[]>("/auth/workforce-user-groups", {
    params: { include_archived: includeArchived },
  });
  return res.data;
}

export async function createWorkforceUserGroup(body: {
  name: string;
  color?: string;
  icon_key?: string;
  default_permission_keys?: string[];
  default_wms_modes?: string[];
}): Promise<WorkforceUserGroupDto> {
  const res = await api.post<WorkforceUserGroupDto>("/auth/workforce-user-groups", body);
  return res.data;
}

export async function updateWorkforceUserGroup(
  id: number,
  body: Partial<{
    name: string;
    color: string;
    icon_key: string;
    archived_at: string | null;
    default_permission_keys: string[];
    default_wms_modes: string[];
  }>,
): Promise<WorkforceUserGroupDto> {
  const res = await api.patch<WorkforceUserGroupDto>(`/auth/workforce-user-groups/${id}`, body);
  return res.data;
}
