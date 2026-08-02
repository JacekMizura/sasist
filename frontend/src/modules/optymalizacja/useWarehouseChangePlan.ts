import { useMemo, useSyncExternalStore } from "react";
import {
  addWarehouseChange,
  clearWarehouseChangePlan,
  getHistoryItems,
  getPlanSnapshot,
  getRankedVerifiedChanges,
  getWarehouseChangePlan,
  removeWarehouseChange,
  subscribeWarehouseChangePlan,
  updateWarehouseChange,
  updateWarehouseChangeStatus,
} from "./warehouseChangePlanStore";

function subscribe(cb: () => void) {
  return subscribeWarehouseChangePlan(cb);
}

function getSnapshot() {
  return getWarehouseChangePlan();
}

export function useWarehouseChangePlan() {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => []);
  const snapshot = useMemo(() => getPlanSnapshot(items), [items]);
  const history = useMemo(() => getHistoryItems(items), [items]);
  const ranked = useMemo(() => getRankedVerifiedChanges(items), [items]);

  return {
    items,
    snapshot,
    history,
    ranked,
    add: addWarehouseChange,
    remove: removeWarehouseChange,
    clear: clearWarehouseChangePlan,
    setStatus: updateWarehouseChangeStatus,
    update: updateWarehouseChange,
  };
}
