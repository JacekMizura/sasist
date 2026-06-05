import type { OrderIssueTaskListItemApi } from "../../api/wmsOrderIssueTasksApi";

export type ShortagePriorityLevel = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export function priorityLevelFromTask(task: OrderIssueTaskListItemApi): ShortagePriorityLevel {
  const lv = (task.shortage_priority_level ?? "LOW").trim().toUpperCase();
  if (lv === "CRITICAL" || lv === "HIGH" || lv === "NORMAL" || lv === "LOW") {
    return lv;
  }
  const score = Number(task.shortage_priority_score) || 0;
  if (score >= 150) return "CRITICAL";
  if (score >= 100) return "HIGH";
  if (score >= 50) return "NORMAL";
  return "LOW";
}

export function priorityLabelPl(level: ShortagePriorityLevel): string {
  return {
    CRITICAL: "Krytyczny",
    HIGH: "Wysoki",
    NORMAL: "Normalny",
    LOW: "Niski",
  }[level];
}

export function priorityBadgeClass(level: ShortagePriorityLevel): string {
  switch (level) {
    case "CRITICAL":
      return "bg-orange-50 text-orange-900 border-orange-300";
    case "HIGH":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "NORMAL":
      return "bg-slate-50 text-slate-800 border-slate-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

export function priorityLabelForTask(task: OrderIssueTaskListItemApi): string {
  const fromApi = (task.shortage_priority_label ?? "").trim();
  if (fromApi) return fromApi;
  return priorityLabelPl(priorityLevelFromTask(task));
}

export function sortTasksByPriority(tasks: OrderIssueTaskListItemApi[]): OrderIssueTaskListItemApi[] {
  return [...tasks].sort((a, b) => {
    const sa = Number(a.shortage_priority_score) || 0;
    const sb = Number(b.shortage_priority_score) || 0;
    if (sb !== sa) return sb - sa;
    return a.order_id - b.order_id;
  });
}
