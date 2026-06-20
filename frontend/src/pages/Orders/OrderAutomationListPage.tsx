import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Copy,
  FlaskConical,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
import { moduleListEmptyStateClass } from "../../components/listPage/moduleList";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useOrderAutomationStore } from "../../hooks/useOrderAutomationStore";
import type { AutomationCondition, AutomationEffect, OrderAutomationRule } from "../../types/orderAutomation";
import type { OrderAutomationScope } from "../../utils/orderAutomationLocalStore";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import {
  formatConditionDisplayParts,
  formatEffectPill,
  primaryTriggerLabel,
} from "../../utils/orderAutomationPreview";
import {
  oaBtn,
  oaBtnPri,
  oaInp,
  oaWorkflowChipClass,
  oaWorkflowGroupHeaderClass,
  oaWorkflowGroupSectionClass,
} from "../../components/orders/automation/orderAutomationUiTokens";

const MENU_PANEL =
  "z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg outline-none";
const menuItem =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-white hover:text-slate-900";

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function WorkflowChip({ children }: { children: React.ReactNode }) {
  return <span className={oaWorkflowChipClass}>{children}</span>;
}

function RuleRowMenu({ onTest, onLogs }: { onTest: () => void; onLogs: () => void }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    strategy: "fixed",
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context, { ancestorScroll: true, outsidePress: true, escapeKey: true });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  return (
    <div className="relative">
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`${oaBtn} h-8 w-8 px-0`}
        aria-label="Więcej opcji"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <FloatingPortal id="floating-portal-order-automation-kebab">
          <div ref={refs.setFloating} style={floatingStyles} className={MENU_PANEL} role="menu" {...getFloatingProps()}>
            <button type="button" role="menuitem" className={menuItem} onClick={() => { setOpen(false); onTest(); }}>
              <FlaskConical className="h-4 w-4 text-slate-600" strokeWidth={2} />
              Test (symulacja)
            </button>
            <button type="button" role="menuitem" className={menuItem} onClick={() => { setOpen(false); onLogs(); }}>
              <Play className="h-4 w-4 text-slate-600" strokeWidth={2} />
              Dziennik wykonań
            </button>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}

type RuleRowProps = {
  rule: OrderAutomationRule;
  statusNameById: Map<number, string>;
  basePath: string;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTest: () => void;
  onLogs: () => void;
};

function AutomationRuleRow({
  rule,
  statusNameById,
  basePath,
  onToggle,
  onDuplicate,
  onDelete,
  onTest,
  onLogs,
}: RuleRowProps) {
  const navigate = useNavigate();
  const trigger = primaryTriggerLabel(rule);

  return (
    <div
      className={`group/row border-b border-slate-100 px-4 py-4 transition last:border-b-0 ${
        rule.enabled
          ? "border-l-[3px] border-l-emerald-500 bg-white"
          : "border-l-[3px] border-l-slate-200 bg-white opacity-60 hover:opacity-100"
      }`}
    >
      <div className="flex gap-4">
        <label className="mt-1 shrink-0 cursor-pointer" title={rule.enabled ? "Wyłącz" : "Włącz"} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
            checked={rule.enabled}
            onChange={onToggle}
          />
        </label>

        <div className="flex min-w-0 flex-1 flex-col gap-4 xl:flex-row xl:items-start xl:gap-8">
          {/* Nazwa + wyzwalacz + statystyki */}
          <div className="shrink-0 xl:w-52">
            <button
              type="button"
              className={`text-left text-sm font-bold leading-snug hover:underline ${
                rule.enabled ? "text-slate-900" : "text-slate-500 line-through decoration-slate-400"
              }`}
              title={rule.name}
              onClick={() => navigate(`${basePath}/${rule.id}/edit`)}
            >
              {rule.name}
            </button>
            <p className="mt-1.5 text-xs text-slate-500">{trigger}</p>
            <p className="mt-2 text-[11px] text-slate-500">
              Wykonano: <span className="font-semibold tabular-nums text-slate-700">{rule.stats.runCount}</span>
              <span className="mx-1.5 text-slate-300">·</span>
              Ostatnie: {fmtTime(rule.stats.lastRunAt)}
            </p>
          </div>

          {/* Przepływ Jeśli → To */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Jeśli</span>
              <div className="mt-1.5 flex flex-col items-start gap-1.5">
                {rule.conditions.length === 0 ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  rule.conditions.map((c: AutomationCondition, i: number) => {
                    const parts = formatConditionDisplayParts(c, statusNameById);
                    const join = i > 0 ? (rule.conditions[i - 1]?.joinToNext === "or" ? "LUB" : "ORAZ") : null;
                    return (
                      <div key={c.uid} className="flex flex-col items-start gap-1">
                        {join ? (
                          <span className="text-[10px] font-bold uppercase text-slate-400">{join}</span>
                        ) : null}
                        <WorkflowChip>
                          {parts.field} <span className="font-bold">{parts.op}</span> {parts.value}
                        </WorkflowChip>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center self-center sm:self-start sm:pt-6">
              <ArrowRight className="h-5 w-5 text-slate-400" strokeWidth={2} aria-hidden />
            </div>

            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To</span>
              <div className="mt-1.5 flex flex-col items-start gap-1.5">
                {rule.effects.length === 0 ? (
                  <span className="text-xs text-slate-400">—</span>
                ) : (
                  rule.effects.map((e: AutomationEffect) => (
                    <WorkflowChip key={e.uid}>{formatEffectPill(e, statusNameById)}</WorkflowChip>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Akcje */}
          <div className="flex shrink-0 items-center gap-1 self-start opacity-100 xl:opacity-0 xl:group-hover/row:opacity-100">
            <button type="button" className={`${oaBtn} h-8 w-8 px-0`} title="Edytuj" onClick={() => navigate(`${basePath}/${rule.id}/edit`)}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" className={`${oaBtn} h-8 w-8 px-0`} title="Duplikuj" onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </button>
            <button type="button" className={`${oaBtn} h-8 w-8 px-0 text-red-600 hover:border-red-200 hover:text-red-700`} title="Usuń" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </button>
            <RuleRowMenu onTest={onTest} onLogs={onLogs} />
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const { rules, reload, hydrated, setEnabled, deleteRule, duplicateRule, recordTestRun } = store;

  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [statusSummary, setStatusSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [testRule, setTestRule] = useState<OrderAutomationRule | null>(null);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!testRule) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTestRule(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [testRule]);

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
      const blob = `${r.name} ${r.group} ${trigger} ${r.conditions.map((c) => formatConditionDisplayParts(c, statusNameById).field).join(" ")} ${r.effects.map((e) => formatEffectPill(e, statusNameById)).join(" ")}`.toLowerCase();
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
      {/* Pasek narzędzi */}
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj po nazwie lub ID…"
              className={`${oaInp} pl-10`}
            />
          </div>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={`${oaInp} w-auto min-w-[11rem]`}>
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {byGroup.map(([gName, list]) => {
            const open = openGroups[gName] ?? true;
            return (
              <section key={gName} className={oaWorkflowGroupSectionClass}>
                <div className={oaWorkflowGroupHeaderClass}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <h3 className="truncate text-sm font-bold uppercase tracking-wide text-slate-800">
                      {gName}{" "}
                      <span className="font-normal text-slate-500">({list.length})</span>
                    </h3>
                    <Link
                      to={`${basePath}/new`}
                      className={`${oaBtn} h-8 w-8 px-0`}
                      title="Dodaj regułę w grupie"
                      onClick={() => {
                        /* group prefill via sessionStorage could be added later */
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      className={`${oaBtn} h-8 gap-1.5 px-2.5 text-xs`}
                      onClick={() => toggleGroup(gName)}
                    >
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {open ? "Zwiń" : "Rozwiń"}
                    </button>
                  </div>
                  <div className="cursor-grab p-1 text-slate-300 hover:text-slate-500" title="Zmień kolejność grupy">
                    <GripVertical className="h-4 w-4" />
                  </div>
                </div>

                {open ? (
                  list.length > 0 ? (
                    <div>
                      {list.map((r) => (
                        <AutomationRuleRow
                          key={r.id}
                          rule={r}
                          statusNameById={statusNameById}
                          basePath={basePath}
                          onToggle={() => setEnabled(r.id, !r.enabled)}
                          onDuplicate={() => { duplicateRule(r.id); toast.success("Zduplikowano."); }}
                          onDelete={() => {
                            if (!window.confirm(`Usunąć „${r.name}”?`)) return;
                            deleteRule(r.id);
                            toast.success("Usunięto.");
                          }}
                          onTest={() => setTestRule(r)}
                          onLogs={() => navigate("/orders/automation/logs")}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">
                      Brak akcji automatycznych w tej grupie.
                    </div>
                  )
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {testRule ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Test akcji</h2>
            <p className="mt-2 text-sm text-slate-600">
              Symulacja dla: <span className="font-medium text-slate-900">{testRule.name}</span>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={oaBtn} onClick={() => setTestRule(null)}>Zamknij</button>
              <button
                type="button"
                className={oaBtnPri}
                onClick={() => {
                  recordTestRun(testRule, true, "Test (placeholder UI)", "{}");
                  toast.success("Zapisano w dzienniku.");
                  setTestRule(null);
                }}
              >
                Uruchom symulację
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
