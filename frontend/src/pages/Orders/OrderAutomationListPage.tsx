import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Plus, Search } from "lucide-react";
import toast from "react-hot-toast";

import { AutomationRulesTable } from "../../components/orders/automation/AutomationRulesTable";
import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
import { moduleListEmptyStateClass } from "../../components/listPage/moduleList";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useOrderAutomationStore } from "../../hooks/useOrderAutomationStore";
import type { OrderAutomationRule } from "../../types/orderAutomation";
import type { OrderAutomationScope } from "../../utils/orderAutomationLocalStore";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import {
  formatConditionDisplayParts,
  formatEffectPill,
  formatRuleDisplayId,
  formatRuleWorkflowTitle,
  primaryTriggerLabel,
} from "../../utils/orderAutomationPreview";
import {
  oaBtnPri,
  oaSearchInp,
  oaSel,
  oaWorkflowGroupHeaderClass,
  oaWorkflowGroupSectionClass,
} from "../../components/orders/automation/orderAutomationUiTokens";

export default function OrderAutomationListPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const scope: OrderAutomationScope = pathname.includes("/orders/automation/inventory") ? "inventory" : "orders";
  const basePath = scope === "inventory" ? "/orders/automation/inventory" : "/orders/automation/orders";

  const { warehouse } = useWarehouse();
  const wid = warehouse?.id ?? null;
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("settings.automation");

  const store = useOrderAutomationStore(DAMAGE_TENANT_ID, wid, scope);
  const { rules, reload, hydrated, setEnabled, deleteRule } = store;

  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [idSort, setIdSort] = useState<"asc" | "desc">("asc");
  const [statusSummary, setStatusSummary] = useState<OrderUiStatusPanelSummary | null>(null);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (wid == null) return;
    void (async () => {
      try {
        const s = await getOrderUiStatusSummary(DAMAGE_TENANT_ID, wid, { includeInactive: true });
        setStatusSummary(s);
      } catch {
        setStatusSummary(null);
      }
    })();
  }, [wid]);

  const statusNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of statusSummary?.groups ?? []) {
      for (const s of g.sub_statuses ?? []) {
        m.set(s.id, s.name);
      }
    }
    return m;
  }, [statusSummary]);

  const groups = useMemo(() => [...new Set(rules.map((r) => r.group || "—"))].sort((a, b) => a.localeCompare(b, "pl")), [rules]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rules.filter((r) => {
      if (group !== "all" && (r.group || "—") !== group) return false;
      if (!s) return true;
      const trigger = primaryTriggerLabel(r);
      const workflowTitle = formatRuleWorkflowTitle(r, statusNameById);
      const displayId = formatRuleDisplayId(r);
      const blob = `${r.name} ${r.group} ${trigger} ${workflowTitle} ${displayId} ${r.publicId ?? ""} ${r.conditions.map((c) => formatConditionDisplayParts(c, statusNameById).field).join(" ")} ${r.effects.map((e) => formatEffectPill(e, statusNameById)).join(" ")}`.toLowerCase();
      return blob.includes(s);
    });
  }, [rules, q, group, statusNameById]);

  const byGroup = useMemo(() => {
    const m = new Map<string, OrderAutomationRule[]>();
    for (const r of filtered) {
      const k = r.group || "—";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "pl"));
  }, [filtered]);

  const toggleGroup = (gName: string) => setOpenGroups((prev) => ({ ...prev, [gName]: !(prev[gName] ?? true) }));

  const openRuleLogs = (rule: OrderAutomationRule) => {
    const params = new URLSearchParams({ ruleId: rule.id });
    if (rule.publicId) params.set("publicId", String(rule.publicId));
    navigate(`/orders/automation/logs?${params.toString()}`);
  };

  const confirmDelete = (rule: OrderAutomationRule) => {
    const title = formatRuleWorkflowTitle(rule, statusNameById);
    const label = title !== "—" ? title : rule.name;
    if (!window.confirm(`Usunąć „${label}” (ID ${formatRuleDisplayId(rule)})?`)) return;
    deleteRule(rule.id);
    toast.success("Usunięto.");
  };

  if (wid == null) {
    return <p className="text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>;
  }

  if (!canWrite) {
    return (
      <p className="text-sm text-slate-600">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </p>
    );
  }

  if (!hydrated) {
    return <div className={moduleListEmptyStateClass}>Ładowanie listy…</div>;
  }

  return (
    <div className={`${moduleAutomationShellClass} w-full max-w-none`}>
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-lg">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj po nazwie lub ID…"
              className={oaSearchInp}
              type="search"
            />
          </div>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={oaSel} aria-label="Filtruj po grupie">
            <option value="all">Wszystkie grupy</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <Link to={`${basePath}/new`} className={`${oaBtnPri} shrink-0 gap-2`}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Nowa automatyzacja
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-slate-800">Brak automatyzacji</p>
          <p className="mt-1 text-xs text-slate-500">Dodaj regułę lub zmień filtry.</p>
          <Link to={`${basePath}/new`} className={`${oaBtnPri} mt-4 inline-flex`}>
            Nowa automatyzacja
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white">
          {byGroup.map(([gName, list]) => {
            const open = openGroups[gName] ?? true;
            return (
              <section key={gName} className={oaWorkflowGroupSectionClass}>
                <button
                  type="button"
                  className={oaWorkflowGroupHeaderClass}
                  onClick={() => toggleGroup(gName)}
                  aria-expanded={open}
                >
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-700 transition-transform ${open ? "" : "-rotate-90"}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <h3 className="min-w-0 flex-1 truncate text-base font-extrabold uppercase tracking-wide text-slate-900">
                    {gName}{" "}
                    <span className="font-semibold text-slate-600">({list.length})</span>
                  </h3>
                </button>

                {open ? (
                  list.length > 0 ? (
                    <AutomationRulesTable
                      rules={list}
                      statusNameById={statusNameById}
                      basePath={basePath}
                      idSort={idSort}
                      onIdSortChange={setIdSort}
                      onToggle={(id, enabled) => setEnabled(id, enabled)}
                      onDelete={confirmDelete}
                      onLogs={openRuleLogs}
                    />
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-slate-400">
                      Brak akcji automatycznych w tej grupie.
                    </div>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
