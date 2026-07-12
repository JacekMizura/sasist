export type AgentVersionState = "current" | "update" | "unknown";

export function parseSemver(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
}

export function compareAgentVersions(
  reported: string | null | undefined,
  latest: string | null | undefined,
): AgentVersionState {
  if (!reported?.trim() || !latest?.trim()) return "unknown";
  const left = parseSemver(reported);
  const right = parseSemver(latest);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a < b) return "update";
    if (a > b) return "unknown";
  }
  return "current";
}

export function agentVersionBadgeLabel(state: AgentVersionState): string {
  switch (state) {
    case "current":
      return "🟢 Aktualny";
    case "update":
      return "🟠 Dostępna aktualizacja";
    default:
      return "🔴 Nieznana wersja";
  }
}

export function agentVersionBadgeClass(state: AgentVersionState): string {
  switch (state) {
    case "current":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "update":
      return "bg-orange-50 text-orange-800 ring-orange-200";
    default:
      return "bg-red-50 text-red-800 ring-red-200";
  }
}
