/** Matches backend `is_super_role` — full UI/API bypass for platform super accounts. */
export function isSuperRole(role: string | null | undefined): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return r === "superadmin" || r === "super_admin";
}
