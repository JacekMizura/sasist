/**
 * Offline-first preparation — sync queue abstraction (no full sync engine yet).
 */

export type InventorySyncOp =
  | { kind: "scan"; documentId: number; lineId: number; delta?: number; quantity?: number; barcode?: string; sessionId?: number }
  | { kind: "unknown_product"; payload: Record<string, unknown> }
  | { kind: "confirm_location"; taskId: number; locationId: number; scannedCode: string };

const QUEUE_KEY = "wms.inventory_count.sync_queue";

function readQueue(): InventorySyncOp[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InventorySyncOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(ops: InventorySyncOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}

export const inventoryCountSyncQueue = {
  enqueue(op: InventorySyncOp) {
    const q = readQueue();
    q.push(op);
    writeQueue(q);
    return q.length;
  },
  peekAll() {
    return readQueue();
  },
  clear() {
    localStorage.removeItem(QUEUE_KEY);
  },
  dequeue(): InventorySyncOp | undefined {
    const q = readQueue();
    const [head, ...rest] = q;
    writeQueue(rest);
    return head;
  },
  size() {
    return readQueue().length;
  },
};

export type InventoryTaskCacheEntry = {
  taskId: number;
  locationCode: string;
  progressPercent: number;
  cachedAt: string;
};

const CACHE_KEY = "wms.inventory_count.task_cache";

export function cacheTaskSnapshot(entry: InventoryTaskCacheEntry) {
  try {
    const map = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, InventoryTaskCacheEntry>;
    map[String(entry.taskId)] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readTaskCache(taskId: number): InventoryTaskCacheEntry | null {
  try {
    const map = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, InventoryTaskCacheEntry>;
    return map[String(taskId)] ?? null;
  } catch {
    return null;
  }
}
