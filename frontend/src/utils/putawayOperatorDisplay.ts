import type { MeResponse } from "../api/authApi";

/** Display name for current operator (putaway audit cache). */
export function mePutawayOperatorDisplayName(user: MeResponse | null | undefined): string {
  if (!user) return "";
  const first = (user.first_name ?? "").trim();
  const last = (user.last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return (user.login ?? "").trim();
}
