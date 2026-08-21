/**
 * Order automations store — backend Automation Engine SSOT.
 * localStorage used only for one-shot legacy import + change/execution log UX (non-rule).
 */
import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  createAutomation,
  deleteAutomation,
  disableAutomation,
  duplicateAutomation,
  enableAutomation,
  importLegacyAutomations,
  listAutomations,
  listAutomationExecutions,
  testAutomation,
  updateAutomation,
  type AutomationRuleDto,
} from "../api/automationsApi";
import type {
  OrderAutomationChangeLogEntry,
  OrderAutomationExecutionLogEntry,
  OrderAutomationRule,
} from "../types/orderAutomation";
import {
  appendAutomationChangeLogs,
  loadAutomationChangeLogs,
  loadAutomationExecutionLogs,
  loadAutomationRules,
  migrationMarkerKey,
  newUid,
  saveAutomationChangeLogs,
  saveAutomationExecutionLogs,
  appendAutomationExecutionLog,
} from "../utils/orderAutomationLocalStore";
import {
  backendRuleToFe,
  feRuleToCreateBody,
  feRuleToUpdateBody,
} from "../utils/orderAutomationBackendMap";

export type OrderAutomationScope = "orders" | "inventory";

function isMigrated(tenantId: number, warehouseId: number): boolean {
  try {
    return localStorage.getItem(migrationMarkerKey(tenantId, warehouseId)) === "1";
  } catch {
    return false;
  }
}

function setMigrated(tenantId: number, warehouseId: number): void {
  try {
    localStorage.setItem(migrationMarkerKey(tenantId, warehouseId), "1");
  } catch {
    /* ignore */
  }
}

export function useOrderAutomationStore(
  tenantId: number,
  warehouseId: number | null,
  scope: OrderAutomationScope = "orders",
) {
  const [rules, setRules] = useState<OrderAutomationRule[]>([]);
  const [backendDtos, setBackendDtos] = useState<AutomationRuleDto[]>([]);
  const [executionLogs, setExecutionLogs] = useState<OrderAutomationExecutionLogEntry[]>([]);
  const [changeLogs, setChangeLogs] = useState<OrderAutomationChangeLogEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [legacyPending, setLegacyPending] = useState(false);

  const canUse = warehouseId != null;

  const reload = useCallback(async () => {
    if (warehouseId == null) {
      setRules([]);
      setBackendDtos([]);
      setExecutionLogs([]);
      setChangeLogs([]);
      setHydrated(true);
      setLegacyPending(false);
      return;
    }
    try {
      const dtos = await listAutomations({
        tenantId,
        warehouseId,
        // Include ORDER + RETURN + COMPLAINT STATUS_ACTION on the shared list.
        entityType: undefined,
      });
      // Inventory scope: still ORDER entity for now; filter by metadata later if needed
      setBackendDtos(dtos);
      setRules(dtos.map(backendRuleToFe).sort((a, b) => a.name.localeCompare(b.name, "pl")));

      const legacy = loadAutomationRules(tenantId, warehouseId, scope);
      const migrated = isMigrated(tenantId, warehouseId);
      setLegacyPending(!migrated && legacy.length > 0);

      setExecutionLogs(loadAutomationExecutionLogs(tenantId, warehouseId));
      setChangeLogs(loadAutomationChangeLogs(tenantId, warehouseId));
    } catch {
      toast.error("Nie udało się wczytać automatyzacji z serwera");
      setRules([]);
      setBackendDtos([]);
    } finally {
      setHydrated(true);
    }
  }, [tenantId, warehouseId, scope]);

  const runLegacyImport = useCallback(async () => {
    if (warehouseId == null) return { created: 0, skipped: 0 };
    const legacy = loadAutomationRules(tenantId, warehouseId, scope);
    if (legacy.length === 0) {
      setMigrated(tenantId, warehouseId);
      setLegacyPending(false);
      return { created: 0, skipped: 0 };
    }
    const result = await importLegacyAutomations({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      entity_type: "ORDER",
      rules: legacy,
    });
    setMigrated(tenantId, warehouseId);
    setLegacyPending(false);
    await reload();
    return result;
  }, [tenantId, warehouseId, scope, reload]);

  const dismissLegacy = useCallback(() => {
    if (warehouseId == null) return;
    setMigrated(tenantId, warehouseId);
    setLegacyPending(false);
  }, [tenantId, warehouseId]);

  const upsertRule = useCallback(
    async (rule: OrderAutomationRule) => {
      if (warehouseId == null) return rule;
      const numericId = Number(rule.id);
      const isExisting = Number.isFinite(numericId) && numericId > 0 && /^\d+$/.test(rule.id);
      let dto: AutomationRuleDto;
      if (isExisting) {
        dto = await updateAutomation(numericId, tenantId, feRuleToUpdateBody(rule));
      } else {
        dto = await createAutomation(
          feRuleToCreateBody(rule, { tenantId, warehouseId, source: "USER_AUTOMATION" }),
        );
      }
      await reload();
      return backendRuleToFe(dto);
    },
    [tenantId, warehouseId, reload],
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
    async (id: string) => {
      const n = Number(id);
      if (!Number.isFinite(n) || n <= 0) return;
      await deleteAutomation(n, tenantId);
      await reload();
    },
    [tenantId, reload],
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      const n = Number(id);
      if (!Number.isFinite(n) || n <= 0) return;
      if (enabled) await enableAutomation(n, tenantId);
      else await disableAutomation(n, tenantId);
      await reload();
    },
    [tenantId, reload],
  );

  const duplicateRule = useCallback(
    async (id: string) => {
      const n = Number(id);
      if (!Number.isFinite(n) || n <= 0) return;
      await duplicateAutomation(n, tenantId);
      await reload();
    },
    [tenantId, reload],
  );

  const recordTestRun = useCallback(
    async (rule: OrderAutomationRule, ok: boolean, message: string, detail?: string) => {
      if (warehouseId == null) return;
      const n = Number(rule.id);
      if (Number.isFinite(n) && n > 0) {
        try {
          await testAutomation(n, {
            tenant_id: tenantId,
            entity_type: "ORDER",
            dry_run: true,
            check_conditions: false,
          });
        } catch {
          /* still log locally for UX history panel */
        }
      }
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
    },
    [tenantId, warehouseId, scope],
  );

  const clearExecutionLogs = useCallback(() => {
    if (warehouseId == null) return;
    saveAutomationExecutionLogs(tenantId, warehouseId, []);
    setExecutionLogs([]);
  }, [tenantId, warehouseId]);

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

  const sourceByRuleId = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of backendDtos) m.set(String(d.id), d.source);
    return m;
  }, [backendDtos]);

  const runtimeReadyByRuleId = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of backendDtos) m.set(String(d.id), d.runtime_ready !== false);
    return m;
  }, [backendDtos]);

  const validationIssuesByRuleId = useMemo(() => {
    const m = new Map<string, AutomationRuleDto["validation_issues"]>();
    for (const d of backendDtos) m.set(String(d.id), d.validation_issues ?? []);
    return m;
  }, [backendDtos]);

  return {
    canUse,
    hydrated,
    rules,
    backendDtos,
    sourceByRuleId,
    runtimeReadyByRuleId,
    validationIssuesByRuleId,
    legacyPending,
    runLegacyImport,
    dismissLegacy,
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
    listAutomationExecutions,
  };
}
