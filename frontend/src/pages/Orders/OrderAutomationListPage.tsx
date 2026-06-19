import { Fragment, useEffect, useMemo, useState } from "react";
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
  ChevronDown,
  Copy,
  FlaskConical,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Trash2,
  Plus,
} from "lucide-react";
import toast from "react-hot-toast";

import { flatSectionDividerClass } from "../../components/layout/flatSectionTokens";
import {
  moduleListEmptyStateClass,
  moduleListRowClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleListTableClass,
  moduleListTableScrollClass,
} from "../../components/listPage/moduleList";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useOrderAutomationStore } from "../../hooks/useOrderAutomationStore";
import type { OrderAutomationRule } from "../../types/orderAutomation";
import type { OrderAutomationScope } from "../../utils/orderAutomationLocalStore";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import {
  formatConditionChipShort,
  formatEffectChipShort,
  formatEffectPill,
} from "../../utils/orderAutomationPreview";
import { getStatusClass } from "../../components/orders/orderList/OrderListPanelStatusBadge";
import { oaBtn, oaBtnPri, oaChip, oaInp } from "../../components/orders/automation/orderAutomationUiTokens";

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
        className={oaBtn.replace("px-4", "px-2")}
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

function triggerLabel(r: OrderAutomationRule): string {
  if (r.execution.onOrderCreated) return "Po utworzeniu";
  if (r.execution.onStatusChanged) return "Zmiana statusu";
  if (r.execution.onSchedule) return "Harmonogram";
  if (r.manualTrigger.enabled) return "Przycisk ręczny";
  return "—";
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
      const blob = `${r.name} ${r.group} ${r.conditions.map((c) => formatConditionChipShort(c, statusNameById)).join(" ")} ${r.effects.map((e) => formatEffectPill(e, statusNameById)).join(" ")}`.toLowerCase();
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

  const toggleGrp = (g: string) => setOpenGroups((prev) => ({ ...prev, [g]: !(prev[g] ?? true) }));

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
    <div className="pt-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900">{pageTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} {filtered.length === 1 ? "akcja" : filtered.length < 5 ? "akcje" : "akcji"}
          </p>
        </div>
        <Link to={`${basePath}/new`} className={`${oaBtnPri} gap-2`}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Dodaj akcję
        </Link>
      </div>
      <div className={`${flatSectionDividerClass} mb-6`} aria-hidden />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj po nazwie, warunkach…"
            className={`${oaInp} pl-10`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={group} onChange={(e) => setGroup(e.target.value)} className={`${oaInp} w-auto min-w-[10rem]`}>
            <option value="all">Wszystkie grupy</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <span className="text-sm text-slate-500">Łącznie: {filtered.length}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-10">
          <p className="text-sm font-medium text-slate-800">Brak akcji</p>
          <p className="mt-1 text-sm text-slate-500">Dodaj pierwszą akcję automatyczną lub zmień filtry wyszukiwania.</p>
          <Link to={`${basePath}/new`} className={`${oaBtnPri} mt-4 inline-flex`}>
            Dodaj akcję
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {byGroup.map(([gName, list]) => {
            const open = openGroups[gName] ?? true;
            return (
              <section key={gName}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 text-left"
                  onClick={() => toggleGrp(gName)}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${!open ? "-rotate-90" : ""}`} />
                  <h3 className="text-sm font-semibold text-slate-900">{gName}</h3>
                  <span className="text-xs text-slate-500">({list.length})</span>
                </button>
                <div className={`${flatSectionDividerClass} mt-3`} aria-hidden />
                {open ? (
                  <div className={`${moduleListTableScrollClass} mt-4`}>
                    <table className={moduleListTableClass}>
                      <thead className={moduleListTheadClass}>
                        <tr>
                          <th className={`${moduleListThClass} w-8`} />
                          <th className={moduleListThClass}>Nazwa</th>
                          <th className={moduleListThClass}>Wyzwalacz</th>
                          <th className={moduleListThClass}>Warunki</th>
                          <th className={moduleListThClass}>Akcje</th>
                          <th className={`${moduleListThClass} w-36 text-right`}>Operacje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => (
                          <tr key={r.id} className={moduleListRowClass}>
                            <td className={moduleListTdClass}>
                              <GripVertical className="h-4 w-4 text-slate-300" aria-hidden />
                            </td>
                            <td className={moduleListTdClass}>
                              <div className="min-w-0">
                                <p className={`truncate font-medium ${r.enabled ? "text-slate-900" : "text-slate-500"}`}>{r.name}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {r.enabled ? "Aktywna" : "Wyłączona"} · Wykonano: {r.stats.runCount}
                                  {r.stats.lastRunAt ? ` · ${fmtTime(r.stats.lastRunAt)}` : ""}
                                </p>
                              </div>
                            </td>
                            <td className={`${moduleListTdClass} text-slate-600`}>{triggerLabel(r)}</td>
                            <td className={moduleListTdClass}>
                              <div className="flex flex-wrap gap-1">
                                {r.conditions.length === 0 ? (
                                  <span className="text-xs text-slate-400">Zawsze</span>
                                ) : (
                                  r.conditions.map((c, i) => {
                                    const st = c.fieldKey === "order_status" && c.value && statusNameById.has(Number(c.value)) ? statusNameById.get(Number(c.value))! : null;
                                    const cls = st ? getStatusClass(st) : "";
                                    return (
                                      <Fragment key={c.uid}>
                                        <span className={`${oaChip} max-w-[14rem] truncate ${st ? `border-l-2 ${cls}` : ""}`} title={formatConditionChipShort(c, statusNameById)}>
                                          {formatConditionChipShort(c, statusNameById)}
                                        </span>
                                        {i < r.conditions.length - 1 ? (
                                          <span className="text-[10px] font-medium text-slate-400">{c.joinToNext === "or" ? "LUB" : "ORAZ"}</span>
                                        ) : null}
                                      </Fragment>
                                    );
                                  })
                                )}
                              </div>
                            </td>
                            <td className={moduleListTdClass}>
                              <div className="flex flex-wrap gap-1">
                                {r.effects.length === 0 ? (
                                  <span className="text-xs text-slate-400">—</span>
                                ) : (
                                  r.effects.map((e) => (
                                    <span key={e.uid} className={`${oaChip} max-w-[14rem] truncate`} title={formatEffectPill(e, statusNameById)}>
                                      {formatEffectChipShort(e, statusNameById)}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className={`${moduleListTdClass} text-right`}>
                              <div className="flex items-center justify-end gap-1">
                                <label className="mr-1 cursor-pointer" title="Włącz/wyłącz">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300"
                                    checked={r.enabled}
                                    onChange={() => setEnabled(r.id, !r.enabled)}
                                  />
                                </label>
                                <button type="button" className={oaBtn.replace("px-4", "px-2")} title="Edytuj" onClick={() => navigate(`${basePath}/${r.id}/edit`)}>
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className={oaBtn.replace("px-4", "px-2")}
                                  title="Duplikuj"
                                  onClick={() => { duplicateRule(r.id); toast.success("Zduplikowano."); }}
                                >
                                  <Copy className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className={oaBtn.replace("px-4", "px-2 text-red-600 hover:bg-red-50")}
                                  title="Usuń"
                                  onClick={() => { if (!window.confirm(`Usunąć „${r.name}”?`)) return; deleteRule(r.id); toast.success("Usunięto."); }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                                <RuleRowMenu onTest={() => setTestRule(r)} onLogs={() => navigate("/orders/automation/logs")} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
