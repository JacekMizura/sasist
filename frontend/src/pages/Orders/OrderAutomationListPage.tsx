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
  Copy,
  FlaskConical,
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
import type { OrderAutomationRule } from "../../types/orderAutomation";
import type { OrderAutomationScope } from "../../utils/orderAutomationLocalStore";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { formatAutomationSentencePl } from "../../utils/orderAutomationPreview";
import { oaBtn, oaBtnPri, oaInp } from "../../components/orders/automation/orderAutomationUiTokens";

const MENU_PANEL =
  "z-[100] min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg outline-none";
const menuItem =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50";

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

function triggerLabels(r: OrderAutomationRule): string[] {
  const out: string[] = [];
  if (r.execution.onOrderCreated) out.push("Utworzenie");
  if (r.execution.onStatusChanged) out.push("Status");
  if (r.execution.onSchedule) out.push("Harmonogram");
  if (r.manualTrigger.enabled) out.push("Ręczny");
  return out;
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
        className={`${oaBtn} h-7 px-2`}
        aria-label="Więcej opcji"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
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
  const { ifLine, thenLine } = formatAutomationSentencePl(rule, statusNameById);
  const triggers = triggerLabels(rule);

  return (
    <div
      className={`group/row grid min-h-11 grid-cols-[auto_minmax(10rem,16rem)_minmax(5rem,8rem)_minmax(0,1fr)_auto_auto] items-center gap-x-4 px-3 py-2 transition ${
        rule.enabled
          ? "border-l-[3px] border-l-emerald-500 bg-white hover:bg-slate-50"
          : "border-l-[3px] border-l-slate-300 bg-slate-50/80 opacity-75 hover:bg-slate-100 hover:opacity-100"
      }`}
    >
      <label className="cursor-pointer" title={rule.enabled ? "Wyłącz" : "Włącz"} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-400 accent-emerald-600"
          checked={rule.enabled}
          onChange={onToggle}
        />
      </label>

      <button
        type="button"
        className={`min-w-0 truncate text-left text-sm font-bold ${rule.enabled ? "text-slate-900" : "text-slate-500 line-through decoration-slate-400"}`}
        title={rule.name}
        onClick={() => navigate(`${basePath}/${rule.id}/edit`)}
      >
        {rule.name}
      </button>

      <div className="flex min-w-0 flex-wrap gap-1">
        {triggers.length === 0 ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          triggers.map((t) => (
            <span
              key={t}
              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                rule.enabled ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t}
            </span>
          ))
        )}
      </div>

      <div className={`flex min-w-0 items-center gap-2 text-sm ${rule.enabled ? "text-slate-800" : "text-slate-500"}`}>
        <span className="min-w-0 truncate font-medium" title={ifLine}>
          <span className="font-bold text-slate-500">Jeśli</span> {ifLine}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <span className="min-w-0 truncate font-medium" title={thenLine}>
          <span className="font-bold text-slate-500">To</span> {thenLine}
        </span>
      </div>

      <span
        className="hidden shrink-0 text-xs font-medium tabular-nums text-slate-500 lg:inline"
        title={`Ostatnio: ${fmtTime(rule.stats.lastRunAt)}`}
      >
        {rule.stats.runCount}×
      </span>

      <div className="flex shrink-0 items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100">
        <button type="button" className={`${oaBtn} h-7 px-2`} title="Edytuj" onClick={() => navigate(`${basePath}/${rule.id}/edit`)}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={`${oaBtn} h-7 px-2`} title="Duplikuj" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={`${oaBtn} h-7 px-2 text-red-600 hover:bg-red-50`} title="Usuń" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <RuleRowMenu onTest={onTest} onLogs={onLogs} />
      </div>
    </div>
  );
}

export default function OrderAutomationListPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const scope: OrderAutomationScope = pathname.includes("/orders/automation/inventory") ? "inventory" : "orders";
  const basePath = scope === "inventory" ? "/orders/automation/inventory" : "/orders/automation/orders";
  const pageTitle = scope === "inventory" ? "Akcje dla asortymentu" : "Akcje dla zamówień";

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
      const { ifLine, thenLine } = formatAutomationSentencePl(r, statusNameById);
      const blob = `${r.name} ${r.group} ${ifLine} ${thenLine}`.toLowerCase();
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
    <div className={`${moduleAutomationShellClass} w-full max-w-none pt-4`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-900">{pageTitle}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{filtered.length} reguł automatyzacji</p>
        </div>
        <Link to={`${basePath}/new`} className={`${oaBtnPri} gap-2`}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Nowa automatyzacja
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj po nazwie, warunkach, akcjach…"
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

      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-slate-800">Brak automatyzacji</p>
          <p className="mt-1 text-xs text-slate-500">Dodaj regułę lub zmień filtry.</p>
          <Link to={`${basePath}/new`} className={`${oaBtnPri} mt-3 inline-flex h-8 text-xs`}>
            Nowa automatyzacja
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="hidden grid-cols-[auto_minmax(10rem,16rem)_minmax(5rem,8rem)_minmax(0,1fr)_auto_auto] gap-x-4 border-b-2 border-slate-200 px-3 pb-2 text-xs font-bold uppercase tracking-wide text-slate-500 lg:grid">
            <span />
            <span>Nazwa</span>
            <span>Wyzwalacz</span>
            <span>Reguła</span>
            <span>Wykonania</span>
            <span />
          </div>

          {byGroup.map(([gName, list]) => {
            const open = openGroups[gName] ?? true;
            return (
              <section key={gName} className="overflow-hidden rounded-xl border-2 border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 text-left transition hover:bg-slate-200/60"
                  onClick={() => toggleGroup(gName)}
                >
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-600 transition-transform ${open ? "" : "-rotate-90"}`}
                    strokeWidth={2}
                  />
                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide text-slate-800">{gName}</h3>
                  <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700 ring-1 ring-slate-300">
                    {list.length}
                  </span>
                </button>
                {open ? (
                  <div className="divide-y divide-slate-100">
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
