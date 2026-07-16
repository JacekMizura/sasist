/**
 * Application label dictionary — frontend cache + getLabel(key, fallback).
 * Support mode: "Custom (system: Default)".
 */

const CACHE_KEY = "sasist.systemLabels.cache.v1";
const SUPPORT_KEY = "sasist.supportMode";

type CachePayload = {
  version: string;
  labels: Record<string, string>;
  defaults: Record<string, string>;
  fetchedAt: number;
};

let memoryLabels: Record<string, string> = {};
let memoryDefaults: Record<string, string> = {};
let memoryVersion = "";
let supportMode = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function readSupport(): boolean {
  try {
    return localStorage.getItem(SUPPORT_KEY) === "1";
  } catch {
    return false;
  }
}

function loadCacheFromStorage(): void {
  supportMode = readSupport();
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CachePayload;
    if (parsed?.labels && typeof parsed.labels === "object") {
      memoryLabels = parsed.labels;
      memoryDefaults = parsed.defaults || {};
      memoryVersion = parsed.version || "";
    }
  } catch {
    /* ignore */
  }
}

loadCacheFromStorage();

export function subscribeLabels(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSupportMode(): boolean {
  return supportMode;
}

export function setSupportMode(on: boolean): void {
  supportMode = on;
  try {
    localStorage.setItem(SUPPORT_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  notify();
}

export function getLabelCacheVersion(): string {
  return memoryVersion;
}

export function getCachedLabels(): Record<string, string> {
  return memoryLabels;
}

export function getCachedDefaults(): Record<string, string> {
  return memoryDefaults;
}

export function applyLabelCache(payload: {
  labels: Record<string, string>;
  version: string;
  defaults?: Record<string, string>;
}): void {
  memoryLabels = payload.labels || {};
  memoryDefaults = payload.defaults || memoryDefaults;
  memoryVersion = payload.version || "";
  try {
    const body: CachePayload = {
      version: memoryVersion,
      labels: memoryLabels,
      defaults: memoryDefaults,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(body));
  } catch {
    /* ignore */
  }
  notify();
}

export function setLabelDefaults(defaults: Record<string, string>): void {
  memoryDefaults = { ...memoryDefaults, ...defaults };
  notify();
}

/**
 * Resolve display label.
 * If custom_value missing on server, API already returns default_value in the map.
 * Fallback used when key not yet in cache.
 */
export function getLabel(key: string, fallback: string): string {
  const resolved = memoryLabels[key];
  const value = resolved != null && resolved !== "" ? resolved : fallback;
  if (!supportMode) return value;

  const systemDefault = memoryDefaults[key] || fallback;
  if (value === systemDefault) return value;
  return `${value} (system: ${systemDefault})`;
}

/** Alias used across UI. */
export const t = getLabel;
