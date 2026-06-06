import { useReplenishmentTasks } from "../runtime/useReplenishmentTasks";

/** Realtime replenishment list — thin wrapper for execution screens. */
export function useReplenishmentRealtime() {
  return useReplenishmentTasks();
}
