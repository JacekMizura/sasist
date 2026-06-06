import { useSyncExternalStore } from "react";

import { isOperationalDebugVisible } from "../../../services/operational/operationalDevMode";

export type DirectSalesNetworkEntry = {
  at: string;
  method: string;
  path: string;
  requestBody: unknown;
  status?: number;
  responseBody?: unknown;
  validationDetail?: unknown;
  errorMessage?: string;
};

const MAX_ENTRIES = 24;
let entries: DirectSalesNetworkEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function recordDirectSalesNetwork(entry: Omit<DirectSalesNetworkEntry, "at">): void {
  if (!isOperationalDebugVisible()) return;
  entries = [{ ...entry, at: new Date().toISOString() }, ...entries].slice(0, MAX_ENTRIES);
  notify();
}

export function clearDirectSalesNetworkLog(): void {
  entries = [];
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return entries;
}

export function useDirectSalesNetworkLog(): DirectSalesNetworkEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function extract422Detail(data: unknown): unknown {
  if (!data || typeof data !== "object") return null;
  const detail = (data as { detail?: unknown }).detail;
  return detail ?? null;
}
