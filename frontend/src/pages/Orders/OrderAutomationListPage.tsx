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
  ChevronRight,
  Copy,
  FlaskConical,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Filter,
  Zap,
  PlayCircle,
  Plus
} from "lucide-react";
import toast from "react-hot-toast";

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
import { oaBtn, oaBtnPri, oaInp } from "../../components/orders/automation/orderAutomationUiTokens";

const MENU_PANEL =
  "z-[100] min-w-[12rem] rounded-lg border border-slate-300 bg-white py-1 shadow-xl outline-none";
const menuItem =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100";

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

// Zmodyfikowane menu kropkowe - teraz zawiera tylko rzadsze akcje (Test, Logi), 
// bo Edycja, Kopiowanie i Usuwanie są na wierzchu w nowym designie.
function RuleRowMenu({
  onTest,
  onLogs,
}: {
  onTest: () => void;
  onLogs: () => void;
}) {
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
        className="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Więcej opcji"
        title="Więcej opcji"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>
      {open ? (
        <FloatingPortal id="floating-portal-order-automation-kebab">
          <div ref={refs.setFloating} style={floatingStyles} className={MENU_PANEL} role="menu" {...getFloatingProps()}>
            <button type="button" role="menuitem" className={menuItem} onClick={() => { setOpen(false); onTest(); }}>
              <FlaskConical className="h-4 w-4 text-blue-600" strokeWidth={2} />
              Test (symulacja)
            </button>
            <button type="button" role="menuitem" className={menuItem} onClick={() => { setOpen(false); onLogs(); }}>
              <Play className="h-4 w-4 text-emerald-600" strokeWidth={2} />
              Dziennik wykonań
            </button>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="h-10 rounded-lg bg-slate-200" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 rounded-lg bg-slate-100" />
      ))}
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
  const [statusLoading, setStatusLoading] = useState(false);
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
    setStatusLoading(true);
    void (async () => {
      try {
        const s = await getOrderUiStatusSummary(DAMAGE_TENANT_ID, wid, { includeInactive: true });
        setStatusSummary(s);
      } catch {
        setStatusSummary(null);
      } finally {
        setStatusLoading(false);
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
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Wybierz magazyn w nagłówku aplikacji.
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </div>
    );
  }

  if (!hydrated) {
    return <ListSkeleton />;
  }

  return (
    <div className="bg-white min-h-screen p-4 md:p-8 text-gray-800 font-sans w-full">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* BREADCRUMBS I NAGŁÓWEK */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>

            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Akcje automatyczne
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <Link 
              to={`${basePath}/new`} 
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Dodaj akcję
            </Link>
          </div>
        </div>

        {/* PASEK KONTROLNY (Wyszukiwarka i filtry) */}
        <div className="flex flex-col lg:flex-row items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4">
          <div className="relative min-w-0 flex-1 w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={2} />
            <input 
              value={q} 
              onChange={(e) => setQ(e.target.value)} 
              placeholder="Szukaj po nazwie, warunkach…" 
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-700 shadow-sm transition hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" 
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <select 
              value={group} 
              onChange={(e) => setGroup(e.target.value)} 
              className="rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 shadow-sm transition hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Wszystkie grupy</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <div className="text-sm text-gray-500 font-medium whitespace-nowrap hidden sm:block px-2">
              Łącznie: {filtered.length}
            </div>
          </div>
        </div>

        {statusLoading ? <p className="text-sm text-slate-500 px-2">Ładowanie słowników…</p> : null}

        {/* LISTA GRUP I REGUŁ */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-lg font-bold text-slate-900">Brak akcji</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              Dodaj pierwszą automatyzację lub zmień filtry wyszukiwania.
            </p>
            <Link to={`${basePath}/new`} className={`${oaBtnPri} mt-6 inline-flex`}>
              Utwórz akcję
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {byGroup.map(([gName, list]) => {
              const open = openGroups[gName] ?? true;
              
              return (
                <div key={gName} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  
                  {/* Nagłówek Grupy */}
                  <button 
                    type="button"
                    className="w-full px-5 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors border-b border-transparent data-[expanded=true]:border-gray-200"
                    data-expanded={open}
                    onClick={() => toggleGrp(gName)}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${!open ? '-rotate-90' : ''}`} />
                      <h2 className="text-base font-bold text-gray-900">{gName}</h2>
                      <span className="bg-white border border-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                        {list.length}
                      </span>
                    </div>
                  </button>

                  {/* Lista Reguł wewnątrz grupy */}
                  {open && (
                    <div className="divide-y divide-gray-100">
                      {list.map((r) => {
                        // Pobranie informacji o wyzwalaczu
                        let triggerText = "—";
                        if (r.execution.onOrderCreated) triggerText = "Po utworzeniu";
                        else if (r.execution.onStatusChanged) triggerText = "Zmiana statusu";
                        else if (r.execution.onSchedule) triggerText = "Harmonogram";
                        else if (r.manualTrigger.enabled) triggerText = "Przycisk ręczny";

                        return (
                          <div key={r.id} className="flex flex-col lg:flex-row lg:items-stretch gap-4 p-5 hover:bg-blue-50/20 transition-colors group">
                            
                            {/* Lewa strona: Tytuł i Informacje */}
                            <div className="flex items-start gap-3 w-full lg:w-72 shrink-0">
                              <div className="cursor-grab text-gray-300 hover:text-gray-500 mt-0.5" title="Kolejność w grupie">
                                <GripVertical className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <h3 className={`text-[14px] font-bold leading-snug truncate ${r.enabled ? 'text-gray-900' : 'text-gray-500'}`} title={r.name}>
                                    {r.name}
                                  </h3>
                                </div>
                                
                                <div className="flex items-center gap-2 mb-2">
                                  {r.enabled ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                                      <CheckCircle2 className="w-3 h-3" /> Aktywna
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                      Wyłączona
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 font-medium">
                                  <div className="flex items-center gap-1.5" title="Wyzwalacz akcji">
                                    <Zap className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    <span>{triggerText}</span>
                                  </div>
                                  <span className="text-[10px] text-gray-300">|</span>
                                  <span title={`Ostatnie uruchomienie: ${fmtTime(r.stats.lastRunAt)}`}>
                                    Wykonano: {r.stats.runCount}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Środek: Drzewo logiczne (JEŚLI / TO ZRÓB w jednej linii) */}
                            <div className="flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-2 gap-4 xl:gap-6 bg-gray-50/50 p-3 rounded-lg border border-gray-100 text-[13px]">
                              
                              {/* JEŚLI (Warunki) */}
                              <div className="flex items-start gap-2">
                                <span className="font-semibold text-gray-600 w-16 shrink-0 flex items-center gap-1.5 mt-0.5">
                                  <Filter className="w-3.5 h-3.5" /> Jeśli:
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {r.conditions.length === 0 ? (
                                    <span className="text-gray-400 italic mt-0.5">Zawsze (brak warunków)</span>
                                  ) : (
                                    r.conditions.map((c, i) => {
                                      const st = c.fieldKey === "order_status" && c.value && statusNameById.has(Number(c.value)) ? statusNameById.get(Number(c.value))! : null;
                                      const cls = st ? getStatusClass(st) : "";
                                      
                                      return (
                                        <Fragment key={c.uid}>
                                          <span 
                                            className={`bg-white text-gray-700 px-2 py-0.5 rounded border border-gray-200 font-medium shadow-sm max-w-[18rem] truncate ${st ? `border-l-[3px] ${cls}` : ""}`}
                                            title={formatConditionChipShort(c, statusNameById)}
                                          >
                                            {formatConditionChipShort(c, statusNameById)}
                                          </span>
                                          {i < r.conditions.length - 1 && (
                                            <span className="text-[10px] font-bold text-gray-400 px-1">
                                              {c.joinToNext === "or" ? "LUB" : "ORAZ"}
                                            </span>
                                          )}
                                        </Fragment>
                                      );
                                    })
                                  )}
                                </div>
                              </div>

                              {/* TO ZRÓB (Akcje) */}
                              <div className="flex items-start gap-2 border-t border-gray-100 pt-3 xl:border-t-0 xl:pt-0 xl:border-l xl:pl-6">
                                <span className="font-semibold text-green-700 w-20 shrink-0 flex items-center gap-1.5 mt-0.5">
                                  <PlayCircle className="w-3.5 h-3.5" /> To zrób:
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {r.effects.length === 0 ? (
                                    <span className="text-gray-400 italic mt-0.5">Brak akcji</span>
                                  ) : (
                                    r.effects.map((e, i) => (
                                      <Fragment key={e.uid}>
                                        <span 
                                          className="bg-white text-green-800 px-2 py-0.5 rounded border border-green-200 font-medium shadow-sm max-w-[18rem] truncate"
                                          title={formatEffectPill(e, statusNameById)}
                                        >
                                          {formatEffectChipShort(e, statusNameById)}
                                        </span>
                                        {i < r.effects.length - 1 && (
                                          <ArrowRight className="w-3 h-3 text-green-400 mx-0.5 shrink-0" />
                                        )}
                                      </Fragment>
                                    ))
                                  )}
                                </div>
                              </div>

                            </div>

                            {/* Prawa strona: Przyciski Akcji */}
                            <div className="flex items-center justify-end gap-2 lg:pl-4 mt-2 lg:mt-0 shrink-0 border-t lg:border-t-0 border-gray-100 pt-3 lg:pt-0">
                              {/* Toggle Aktywności */}
                              <label className="mr-2 relative inline-flex items-center cursor-pointer" title="Włącz/wyłącz akcję">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer" 
                                  checked={r.enabled}
                                  onChange={() => setEnabled(r.id, !r.enabled)}
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                              </label>

                              <div className="w-px h-6 bg-gray-200 hidden sm:block mr-2"></div>

                              {/* Ikonki zarządzania */}
                              <button 
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                title="Edytuj akcję"
                                onClick={() => navigate(`${basePath}/${r.id}/edit`)}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button 
                                className="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors" 
                                title="Duplikuj akcję"
                                onClick={() => { duplicateRule(r.id); toast.success("Zduplikowano."); }}
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button 
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                                title="Usuń akcję"
                                onClick={() => { if (!window.confirm(`Usunąć „${r.name}”?`)) return; deleteRule(r.id); toast.success("Usunięto."); }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              
                              <RuleRowMenu 
                                onTest={() => setTestRule(r)} 
                                onLogs={() => navigate("/orders/automation/logs")} 
                              />
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* MODAL TESTOWY */}
      {testRule ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl ring-1 ring-slate-900/5">
            <h2 className="text-lg font-bold text-slate-900">Test akcji</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Symulacja dla: <span className="font-semibold text-slate-900">{testRule.name}</span>. Po podłączeniu API w tym miejscu pojawi się wybór zamówienia i podgląd wyniku.
            </p>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs">{JSON.stringify({ id: testRule.id, c: testRule.conditions.length, e: testRule.effects.length }, null, 2)}</pre>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className={oaBtn} onClick={() => setTestRule(null)}>
                Zamknij
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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