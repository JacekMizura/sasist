/** Creator metadata on PZ / stock documents (API: created_by / createdBy). */

export type DocumentCreatedByRead = {
  id?: number | null;
  login?: string | null;
  fullName?: string;
  full_name?: string;
};

/** Display label: fullName → login → System */
export function documentCreatedByLabel(c?: DocumentCreatedByRead | null): string {
  const name = (c?.fullName ?? c?.full_name ?? "").trim();
  if (name) return name;
  const login = (c?.login ?? "").trim();
  if (login) return login;
  return "System";
}
