/** Pure helpers for Production dashboard attention queue (testable). */

export const PRODUCTION_DASHBOARD_SECTION_LIMIT = 5;

export type DashboardBucket = "reaction" | "todo" | "in_progress" | "done" | "hidden";

export function limitDashboardSectionItems<T>(items: T[], limit = PRODUCTION_DASHBOARD_SECTION_LIMIT): T[] {
  return items.slice(0, Math.max(0, limit));
}

export function countOverdueFromPlannedDates(
  plannedDates: Array<string | null | undefined>,
  todayIso: string,
): number {
  const today = todayIso.slice(0, 10);
  return plannedDates.filter((raw) => {
    if (!raw) return false;
    const d = String(raw).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today;
  }).length;
}

export function countDueTodayFromPlannedDates(
  plannedDates: Array<string | null | undefined>,
  todayIso: string,
): number {
  const today = todayIso.slice(0, 10);
  return plannedDates.filter((raw) => {
    if (!raw) return false;
    const d = String(raw).slice(0, 10);
    return d === today;
  }).length;
}

export function dashboardSeeAllHref(ordersPath: string, bucket: DashboardBucket): string {
  if (bucket === "reaction") return `${ordersPath}?shortages=1&bucket=reaction`;
  if (bucket === "todo") return `${ordersPath}?bucket=todo`;
  if (bucket === "in_progress") return `${ordersPath}?bucket=in_progress`;
  return ordersPath;
}
