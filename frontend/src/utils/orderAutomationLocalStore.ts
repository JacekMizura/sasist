/**
 * Persystencja reguł i dziennika testów — wyłącznie frontend (localStorage).
 * Po dodaniu endpointów backendu zamień warstwę zapisu na API, zachowując kształt {@link OrderAutomationRule}.
 */
import type { OrderAutomationLogEntry, OrderAutomationRule } from "../types/orderAutomation";

const RULES_PREFIX = "orderAutomation.rules.v1";
/** Legacy suffix — migrowane przy pierwszym odczycie magazynu (inventory). */
const RULES_ASSORTMENT_LEGACY_SUFFIX = ".assortment";
const RULES_INVENTORY_SUFFIX = ".inventory";
const LOGS_PREFIX = "orderAutomation.logs.v1";
const GROUPS_PREFIX = "orderAutomation.actionGroups.v1";

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

function logsKey(tenantId: number, warehouseId: number) {
  return `${LOGS_PREFIX}:${tenantId}:${warehouseId}`;
}

function groupsKey(tenantId: number, warehouseId: number) {
  return `${GROUPS_PREFIX}:${tenantId}:${warehouseId}`;
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
    return x as OrderAutomationRule[];
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

export function loadAutomationLogs(tenantId: number, warehouseId: number): OrderAutomationLogEntry[] {
  try {
    const raw = localStorage.getItem(logsKey(tenantId, warehouseId));
    if (!raw) return [];
    const x = JSON.parse(raw) as unknown;
    if (!Array.isArray(x)) return [];
    return x as OrderAutomationLogEntry[];
  } catch {
    return [];
  }
}

export function saveAutomationLogs(tenantId: number, warehouseId: number, logs: OrderAutomationLogEntry[]) {
  const trimmed = logs.slice(-500);
  localStorage.setItem(logsKey(tenantId, warehouseId), JSON.stringify(trimmed));
}

export function appendAutomationLog(tenantId: number, warehouseId: number, entry: OrderAutomationLogEntry) {
  const prev = loadAutomationLogs(tenantId, warehouseId);
  saveAutomationLogs(tenantId, warehouseId, [...prev, entry]);
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
