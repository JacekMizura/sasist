/**
 * Persystencja reguł i dziennika testów — wyłącznie frontend (localStorage).
 * Po dodaniu endpointów backendu zamień warstwę zapisu na API, zachowując kształt {@link OrderAutomationRule}.
 */
import type {
  OrderAutomationChangeLogEntry,
  OrderAutomationExecutionLogEntry,
  OrderAutomationRule,
} from "../types/orderAutomation";
import { normalizeCondition } from "./orderAutomationConditionUtils";

const RULES_PREFIX = "orderAutomation.rules.v1";
/** Legacy suffix — migrowane przy pierwszym odczycie magazynu (inventory). */
const RULES_ASSORTMENT_LEGACY_SUFFIX = ".assortment";
const RULES_INVENTORY_SUFFIX = ".inventory";
const LOGS_PREFIX = "orderAutomation.executionLogs.v1";
const CHANGE_LOGS_PREFIX = "orderAutomation.changeLogs.v1";
const GROUPS_PREFIX = "orderAutomation.actionGroups.v1";
const PUBLIC_ID_COUNTER_PREFIX = "orderAutomation.publicIdCounter.v1";

export type OrderAutomationScope = "orders" | "inventory";

export type OrderAutomationActionGroup = {
  id: string;
  name: string;
  sortOrder: number;
};

function rulesKeyOrders(tenantId: number, warehouseId: number) {
  return `${RULES_PREFIX}:${tenantId}:${warehouseId}`;
}

function rulesKeyInventory(tenantId: number, warehouseId: number) {
  return `${RULES_PREFIX}${RULES_INVENTORY_SUFFIX}:${tenantId}:${warehouseId}`;
}

function rulesKeyInventoryLegacy(tenantId: number, warehouseId: number) {
  return `${RULES_PREFIX}${RULES_ASSORTMENT_LEGACY_SUFFIX}:${tenantId}:${warehouseId}`;
}

function executionLogsKey(tenantId: number, warehouseId: number) {
  return `${LOGS_PREFIX}:${tenantId}:${warehouseId}`;
}

function legacyLogsKey(tenantId: number, warehouseId: number) {
  return `orderAutomation.logs.v1:${tenantId}:${warehouseId}`;
}

function changeLogsKey(tenantId: number, warehouseId: number) {
  return `${CHANGE_LOGS_PREFIX}:${tenantId}:${warehouseId}`;
}

function groupsKey(tenantId: number, warehouseId: number) {
  return `${GROUPS_PREFIX}:${tenantId}:${warehouseId}`;
}

function publicIdCounterKey(tenantId: number, warehouseId: number, scope: OrderAutomationScope) {
  return `${PUBLIC_ID_COUNTER_PREFIX}:${scope}:${tenantId}:${warehouseId}`;
}

/** Przypisuje brakujące publicId regułom (migracja starych danych). */
export function normalizeRulesPublicIds(
  rules: OrderAutomationRule[],
  tenantId: number,
  warehouseId: number,
  scope: OrderAutomationScope,
): OrderAutomationRule[] {
  const key = publicIdCounterKey(tenantId, warehouseId, scope);
  let counter = Number(localStorage.getItem(key) ?? "0");
  if (!Number.isFinite(counter) || counter < 0) counter = 0;

  let changed = false;
  const next = rules.map((r) => {
    if (typeof r.publicId === "number" && r.publicId > 0) {
      counter = Math.max(counter, r.publicId);
      return r;
    }
    counter += 1;
    changed = true;
    return { ...r, publicId: counter };
  });

  if (changed || counter > Number(localStorage.getItem(key) ?? "0")) {
    localStorage.setItem(key, String(counter));
  }
  return next;
}

/** Następny wolny publicId dla nowej reguły. */
export function allocateRulePublicId(tenantId: number, warehouseId: number, scope: OrderAutomationScope): number {
  const key = publicIdCounterKey(tenantId, warehouseId, scope);
  const rules = loadAutomationRules(tenantId, warehouseId, scope);
  normalizeRulesPublicIds(rules, tenantId, warehouseId, scope);
  const current = Number(localStorage.getItem(key) ?? "0");
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}

export function loadAutomationRules(
  tenantId: number,
  warehouseId: number,
  scope: OrderAutomationScope = "orders",
): OrderAutomationRule[] {
  try {
    const key = scope === "inventory" ? rulesKeyInventory(tenantId, warehouseId) : rulesKeyOrders(tenantId, warehouseId);
    let raw = localStorage.getItem(key);
    if (scope === "inventory" && !raw) {
      raw = localStorage.getItem(rulesKeyInventoryLegacy(tenantId, warehouseId));
      if (raw) {
        localStorage.setItem(key, raw);
      }
    }
    if (!raw) return [];
    const x = JSON.parse(raw) as unknown;
    if (!Array.isArray(x)) return [];
    const rules = (x as OrderAutomationRule[]).map((r) => ({
      ...r,
      conditions: (r.conditions ?? []).map((c) => normalizeCondition(c)),
    }));
    const normalized = normalizeRulesPublicIds(rules, tenantId, warehouseId, scope);
    if (normalized.some((r, i) => r.publicId !== rules[i]?.publicId)) {
      saveAutomationRules(tenantId, warehouseId, normalized, scope);
    }
    return normalized;
  } catch {
    return [];
  }
}

export function saveAutomationRules(
  tenantId: number,
  warehouseId: number,
  rules: OrderAutomationRule[],
  scope: OrderAutomationScope = "orders",
) {
  const key = scope === "inventory" ? rulesKeyInventory(tenantId, warehouseId) : rulesKeyOrders(tenantId, warehouseId);
  localStorage.setItem(key, JSON.stringify(rules));
}

export function loadAutomationExecutionLogs(tenantId: number, warehouseId: number): OrderAutomationExecutionLogEntry[] {
  try {
    let raw = localStorage.getItem(executionLogsKey(tenantId, warehouseId));
    if (!raw) {
      raw = localStorage.getItem(legacyLogsKey(tenantId, warehouseId));
      if (raw) localStorage.setItem(executionLogsKey(tenantId, warehouseId), raw);
    }
    if (!raw) return [];
    const x = JSON.parse(raw) as unknown;
    if (!Array.isArray(x)) return [];
    return x as OrderAutomationExecutionLogEntry[];
  } catch {
    return [];
  }
}

/** @deprecated */
export const loadAutomationLogs = loadAutomationExecutionLogs;

export function saveAutomationExecutionLogs(
  tenantId: number,
  warehouseId: number,
  logs: OrderAutomationExecutionLogEntry[],
) {
  const trimmed = logs.slice(-500);
  localStorage.setItem(executionLogsKey(tenantId, warehouseId), JSON.stringify(trimmed));
}

/** @deprecated */
export const saveAutomationLogs = saveAutomationExecutionLogs;

export function appendAutomationExecutionLog(
  tenantId: number,
  warehouseId: number,
  entry: OrderAutomationExecutionLogEntry,
) {
  const prev = loadAutomationExecutionLogs(tenantId, warehouseId);
  saveAutomationExecutionLogs(tenantId, warehouseId, [...prev, entry]);
}

/** @deprecated */
export const appendAutomationLog = appendAutomationExecutionLog;

export function loadAutomationChangeLogs(tenantId: number, warehouseId: number): OrderAutomationChangeLogEntry[] {
  try {
    const raw = localStorage.getItem(changeLogsKey(tenantId, warehouseId));
    if (!raw) return [];
    const x = JSON.parse(raw) as unknown;
    if (!Array.isArray(x)) return [];
    return x as OrderAutomationChangeLogEntry[];
  } catch {
    return [];
  }
}

export function saveAutomationChangeLogs(
  tenantId: number,
  warehouseId: number,
  logs: OrderAutomationChangeLogEntry[],
) {
  const trimmed = logs.slice(-2000);
  localStorage.setItem(changeLogsKey(tenantId, warehouseId), JSON.stringify(trimmed));
}

export function appendAutomationChangeLogs(
  tenantId: number,
  warehouseId: number,
  entries: OrderAutomationChangeLogEntry[],
) {
  if (entries.length === 0) return;
  const prev = loadAutomationChangeLogs(tenantId, warehouseId);
  saveAutomationChangeLogs(tenantId, warehouseId, [...prev, ...entries]);
}

export function loadActionGroups(tenantId: number, warehouseId: number): OrderAutomationActionGroup[] {
  try {
    const raw = localStorage.getItem(groupsKey(tenantId, warehouseId));
    if (!raw) return [];
    const x = JSON.parse(raw) as unknown;
    if (!Array.isArray(x)) return [];
    return x as OrderAutomationActionGroup[];
  } catch {
    return [];
  }
}

export function saveActionGroups(tenantId: number, warehouseId: number, groups: OrderAutomationActionGroup[]) {
  localStorage.setItem(groupsKey(tenantId, warehouseId), JSON.stringify(groups));
}

export function newUid(prefix: string) {
  try {
    return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
