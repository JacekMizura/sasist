import { useCallback, useMemo, useState } from "react";
import type { OrderAutomationChangeLogEntry, OrderAutomationExecutionLogEntry, OrderAutomationRule } from "../types/orderAutomation";
import type { OrderAutomationScope } from "../utils/orderAutomationLocalStore";
import {
  appendAutomationChangeLogs,
  appendAutomationExecutionLog,
  allocateRulePublicId,
  loadAutomationChangeLogs,
  loadAutomationExecutionLogs,
  newUid,
  saveAutomationChangeLogs,
  saveAutomationExecutionLogs,
  saveAutomationRules,
  loadAutomationRules,
} from "../utils/orderAutomationLocalStore";

export function useOrderAutomationStore(tenantId: number, warehouseId: number | null, scope: OrderAutomationScope = "orders") {
  const [rules, setRules] = useState<OrderAutomationRule[]>([]);
  const [executionLogs, setExecutionLogs] = useState<OrderAutomationExecutionLogEntry[]>([]);
  const [changeLogs, setChangeLogs] = useState<OrderAutomationChangeLogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const canUse = warehouseId != null;

  const reload = useCallback(() => {
    if (warehouseId == null) {
      setRules([]);
      setExecutionLogs([]);
      setChangeLogs([]);
      setHydrated(true);
      return;
    }
    setRules(loadAutomationRules(tenantId, warehouseId, scope));
    setExecutionLogs(loadAutomationExecutionLogs(tenantId, warehouseId));
    setChangeLogs(loadAutomationChangeLogs(tenantId, warehouseId));
    setHydrated(true);
  }, [tenantId, warehouseId, scope]);

  const persistRules = useCallback(
    (next: OrderAutomationRule[]) => {
      if (warehouseId == null) return;
      setRules(next);
      saveAutomationRules(tenantId, warehouseId, next, scope);
    },
    [tenantId, warehouseId, scope],
  );

  const persistExecutionLogs = useCallback(
    (next: OrderAutomationExecutionLogEntry[]) => {
      if (warehouseId == null) return;
      setExecutionLogs(next);
      saveAutomationExecutionLogs(tenantId, warehouseId, next);
    },
    [tenantId, warehouseId],
  );

  const persistChangeLogs = useCallback(
    (next: OrderAutomationChangeLogEntry[]) => {
      if (warehouseId == null) return;
      setChangeLogs(next);
      saveAutomationChangeLogs(tenantId, warehouseId, next);
    },
    [tenantId, warehouseId],
  );

  const upsertRule = useCallback(
    (rule: OrderAutomationRule) => {
      const next = [...rules.filter((r) => r.id !== rule.id), rule].sort((a, b) => a.name.localeCompare(b.name, "pl"));
      persistRules(next);
    },
    [persistRules, rules],
  );

  const appendChangeLogs = useCallback(
    (entries: OrderAutomationChangeLogEntry[]) => {
      if (warehouseId == null || entries.length === 0) return;
      appendAutomationChangeLogs(tenantId, warehouseId, entries);
      setChangeLogs(loadAutomationChangeLogs(tenantId, warehouseId));
    },
    [tenantId, warehouseId],
  );

  const deleteRule = useCallback(
    (id: string) => {
      persistRules(rules.filter((r) => r.id !== id));
    },
    [persistRules, rules],
  );

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      persistRules(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
    },
    [persistRules, rules],
  );

  const duplicateRule = useCallback(
    (id: string) => {
      const src = rules.find((r) => r.id === id);
      if (!src || warehouseId == null) return;
      const copy: OrderAutomationRule = {
        ...src,
        id: newUid("rule"),
        publicId: allocateRulePublicId(tenantId, warehouseId, scope),
        name: `${src.name} (kopia)`,
        enabled: false,
        stats: { lastRunAt: null, runCount: 0 },
      };
      persistRules([...rules, copy]);
    },
    [persistRules, rules, warehouseId, tenantId, scope],
  );

  const recordTestRun = useCallback(
    (rule: OrderAutomationRule, ok: boolean, message: string, detail?: string) => {
      if (warehouseId == null) return;
      const entry: OrderAutomationExecutionLogEntry = {
        id: newUid("log"),
        ts: new Date().toISOString(),
        ruleId: rule.id,
        ruleName: scope === "inventory" ? `[Magazyn] ${rule.name}` : rule.name,
        level: ok ? "success" : "error",
        message,
        detail,
        kind: "test",
      };
      appendAutomationExecutionLog(tenantId, warehouseId, entry);
      setExecutionLogs(loadAutomationExecutionLogs(tenantId, warehouseId));
      const bumped = rules.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              stats: {
                lastRunAt: entry.ts,
                runCount: r.stats.runCount + 1,
              },
            }
          : r,
      );
      persistRules(bumped);
    },
    [persistRules, rules, tenantId, warehouseId, scope],
  );

  const clearExecutionLogs = useCallback(() => {
    if (warehouseId == null) return;
    persistExecutionLogs([]);
  }, [persistExecutionLogs, warehouseId]);

  const byId = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  const changeLogsByRuleId = useMemo(() => {
    const m = new Map<string, OrderAutomationChangeLogEntry[]>();
    for (const e of changeLogs) {
      if (!m.has(e.ruleId)) m.set(e.ruleId, []);
      m.get(e.ruleId)!.push(e);
    }
    for (const [, list] of m) {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return m;
  }, [changeLogs]);

  const executionLogsByRuleId = useMemo(() => {
    const m = new Map<string, OrderAutomationExecutionLogEntry[]>();
    for (const e of executionLogs) {
      if (!m.has(e.ruleId)) m.set(e.ruleId, []);
      m.get(e.ruleId)!.push(e);
    }
    for (const [, list] of m) {
      list.sort((a, b) => b.ts.localeCompare(a.ts));
    }
    return m;
  }, [executionLogs]);

  return {
    canUse,
    hydrated,
    rules,
    logs: executionLogs,
    executionLogs,
    changeLogs,
    reload,
    upsertRule,
    appendChangeLogs,
    deleteRule,
    setEnabled,
    duplicateRule,
    recordTestRun,
    clearLogs: clearExecutionLogs,
    clearExecutionLogs,
    byId,
    changeLogsByRuleId,
    executionLogsByRuleId,
  };
}
