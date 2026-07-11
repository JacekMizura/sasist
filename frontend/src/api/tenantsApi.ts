import api from "./axios";

/** Minimal tenant row returned by GET /tenants/ */
export type TenantListItem = {
  id: number;
  name: string;
  created_at?: string;
  default_warehouse_id?: number | null;
};

let cachedTenants: TenantListItem[] | null = null;
let inflight: Promise<TenantListItem[]> | null = null;

/** One GET /tenants/ per browser session (until invalidateTenantsCache). */
export async function fetchTenantsList(): Promise<TenantListItem[]> {
  if (cachedTenants) return cachedTenants;
  if (inflight) return inflight;

  inflight = api
    .get<TenantListItem[]>("/tenants/")
    .then((res) => {
      cachedTenants = Array.isArray(res.data) ? res.data : [];
      return cachedTenants;
    })
    .catch((err) => {
      cachedTenants = null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateTenantsCache(): void {
  cachedTenants = null;
  inflight = null;
}
