import { useCallback, useMemo, useState } from "react";
import type { OrderAutomationLogEntry, OrderAutomationRule } from "../types/orderAutomation";
import type { OrderAutomationScope } from "../utils/orderAutomationLocalStore";
import {
  appendAutomationLog,
  loadAutomationLogs,
  loadAutomationRules,
  newUid,
  saveAutomationLogs,
  saveAutomationRules,
} from "../utils/orderAutomationLocalStore";

export function useOrderAutomationStore(tenantId: number, warehouseId: number | null, scope: OrderAutomationScope = "orders") {
  const [rules, setRules] = useState<OrderAutomationRule[]>([]);
  const [logs, setLogs] = useState<OrderAutomationLogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const canUse = warehouseId != null;

  const reload = useCallback(() => {
    if (warehouseId == null) {
      setRules([]);
      setLogs([]);
      setHydrated(true);
      return;
    }
    setRules(loadAutomationRules(tenantId, warehouseId, scope));
    setLogs(loadAutomationLogs(tenantId, warehouseId));
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

  const persistLogs = useCallback(
    (next: OrderAutomationLogEntry[]) => {
      if (warehouseId == null) return;
      setLogs(next);
      saveAutomationLogs(tenantId, warehouseId, next);
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
        name: `${src.name} (kopia)`,
        enabled: false,
        stats: { lastRunAt: null, runCount: 0 },
      };
      persistRules([...rules, copy]);
    },
    [persistRules, rules, warehouseId],
  );

  const recordTestRun = useCallback(
    (rule: OrderAutomationRule, ok: boolean, message: string, detail?: string) => {
      if (warehouseId == null) return;
      const entry: OrderAutomationLogEntry = {
        id: newUid("log"),
        ts: new Date().toISOString(),
        ruleId: rule.id,
        ruleName: scope === "inventory" ? `[Magazyn] ${rule.name}` : rule.name,
        level: ok ? "success" : "error",
        message,
        detail,
      };
      appendAutomationLog(tenantId, warehouseId, entry);
      setLogs(loadAutomationLogs(tenantId, warehouseId));
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

  const clearLogs = useCallback(() => {
    if (warehouseId == null) return;
    persistLogs([]);
  }, [persistLogs, warehouseId]);

  const byId = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  return {
    canUse,
    hydrated,
    rules,
    logs,
    reload,
    upsertRule,
    deleteRule,
    setEnabled,
    duplicateRule,
    recordTestRun,
    clearLogs,
    byId,
  };
}
