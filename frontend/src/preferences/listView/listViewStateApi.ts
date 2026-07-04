import api from "../../api/axios";
import type {
  ListViewAutosaveRecord,
  ListViewPresetRecord,
  ListViewScreenBundle,
  ListViewStatePayload,
} from "./listViewStateTypes";
import { LIST_VIEW_SCHEMA_VERSION } from "./listViewStateTypes";

export async function fetchListViewScreen(tenantId: number, screenKey: string): Promise<ListViewScreenBundle> {
  const res = await api.get<ListViewScreenBundle>(`/ui/list-views/${encodeURIComponent(screenKey)}`, {
    params: { tenant_id: tenantId },
  });
  return res.data;
}

export async function putListViewAutosave(
  tenantId: number,
  screenKey: string,
  payload: ListViewStatePayload,
): Promise<ListViewAutosaveRecord> {
  const res = await api.put(
    `/ui/list-views/${encodeURIComponent(screenKey)}/autosave`,
    {
      payload,
      schema_version: LIST_VIEW_SCHEMA_VERSION,
    },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function deleteListViewAutosave(tenantId: number, screenKey: string): Promise<void> {
  await api.delete(`/ui/list-views/${encodeURIComponent(screenKey)}/autosave`, {
    params: { tenant_id: tenantId },
  });
}

export async function createListViewPreset(
  tenantId: number,
  screenKey: string,
  input: {
    name: string;
    payload: ListViewStatePayload;
    isPublic?: boolean;
    isDefault?: boolean;
  },
): Promise<ListViewPresetRecord> {
  const res = await api.post(
    `/ui/list-views/${encodeURIComponent(screenKey)}/presets`,
    {
      name: input.name,
      payload: input.payload,
      schema_version: LIST_VIEW_SCHEMA_VERSION,
      is_public: input.isPublic ?? false,
      is_default: input.isDefault ?? false,
    },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function patchListViewPreset(
  tenantId: number,
  screenKey: string,
  presetId: number,
  input: {
    name?: string;
    payload?: ListViewStatePayload;
    isDefault?: boolean;
  },
): Promise<ListViewPresetRecord> {
  const res = await api.patch(
    `/ui/list-views/${encodeURIComponent(screenKey)}/presets/${presetId}`,
    {
      name: input.name,
      payload: input.payload,
      schema_version: input.payload ? LIST_VIEW_SCHEMA_VERSION : undefined,
      is_default: input.isDefault,
    },
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}

export async function deleteListViewPresetApi(
  tenantId: number,
  screenKey: string,
  presetId: number,
): Promise<void> {
  await api.delete(`/ui/list-views/${encodeURIComponent(screenKey)}/presets/${presetId}`, {
    params: { tenant_id: tenantId },
  });
}

export async function setDefaultListViewPreset(
  tenantId: number,
  screenKey: string,
  presetId: number,
): Promise<ListViewPresetRecord> {
  const res = await api.post(
    `/ui/list-views/${encodeURIComponent(screenKey)}/presets/${presetId}/set-default`,
    null,
    { params: { tenant_id: tenantId } },
  );
  return res.data;
}
