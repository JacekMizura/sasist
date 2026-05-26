import type { WarehousePriorityTask } from "../../api/warehouseOperationsApi";

const STORAGE_KEY = "wms.activePriorityTask";

export type ActivePriorityTask = WarehousePriorityTask & {
  activated_at: string;
};

export function loadActivePriorityTask(): ActivePriorityTask | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivePriorityTask;
    if (!parsed || typeof parsed !== "object" || !parsed.id) return null;
    if (["WYKONANE", "ODRZUCONE"].includes(parsed.status)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveActivePriorityTask(task: WarehousePriorityTask): ActivePriorityTask {
  const active = { ...task, activated_at: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  window.dispatchEvent(new Event("wms:priority-task-changed"));
  return active;
}

export function clearActivePriorityTask(taskId?: number): void {
  const current = loadActivePriorityTask();
  if (taskId == null || current?.id === taskId) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("wms:priority-task-changed"));
  }
}

export function priorityTaskOrderIds(task: ActivePriorityTask | WarehousePriorityTask | null): number[] {
  const raw = task?.payload?.["order_ids"];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0);
}

export function priorityTaskAppliesTo(task: ActivePriorityTask | null, kind: "packing" | "picking"): boolean {
  if (!task) return false;
  if (kind === "packing") return task.task_type === "priority_packing";
  if (kind === "picking") return task.task_type === "priority_picking";
  return false;
}
