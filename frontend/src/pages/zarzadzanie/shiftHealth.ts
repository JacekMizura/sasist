import type { WarehouseOperationsSummary } from "../../api/warehouseOperationsApi";
import type { AlertView, ShiftBoardView } from "../wms/supply-flow/utils/shiftBoard";

export type ShiftHealth = "ok" | "decision" | "critical";

export function resolveShiftHealth(
  board: ShiftBoardView,
  ops: WarehouseOperationsSummary | null,
): ShiftHealth {
  const criticalAlert = board.alerts.some((a) => a.severity === "critical");
  const blocked = (ops?.blocked_orders ?? 0) > 0;
  if (criticalAlert || blocked) return "critical";
  if (board.attention || board.alerts.some((a) => a.severity === "warning")) return "decision";
  return "ok";
}

export function shiftHealthLabel(health: ShiftHealth): string {
  if (health === "critical") return "Magazyn wymaga interwencji";
  if (health === "decision") return "Jest decyzja do podjęcia";
  return "Magazyn działa normalnie";
}

/** Jedno zdanie efektu — nie lista KPI. */
export function decisionEffectLine(board: ShiftBoardView): string | null {
  const why = board.attention?.whyBullets?.[0];
  if (why) return why.charAt(0).toUpperCase() + why.slice(1);
  const q = board.queue[0];
  if (q?.effectLine) return q.effectLine;
  return null;
}

export function topBlockingAlert(alerts: AlertView[]): AlertView | null {
  return alerts.find((a) => a.severity === "critical") || alerts.find((a) => a.severity === "warning") || null;
}
