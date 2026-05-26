import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import {
  PURCHASING_ALERT_RULE_TYPES,
  fetchPurchasingAlertRules,
  fetchPurchasingAlerts,
  fetchPurchasingAlertsSummary,
  fetchPurchasingAutoDrafts,
  patchPurchasingAlertAcknowledge,
  patchPurchasingAlertResolve,
  patchPurchasingAlertRule,
  postPurchasingAlertRule,
  postPurchasingAlertsBulkResolve,
  postPurchasingAlertsCreateDraftOrders,
  postPurchasingAlertsRunScan,
  type PurchasingAlertEvent,
  type PurchasingAlertRule,
  type PurchasingAutoDraftRow,
} from "../../api/purchasingAlertsApi";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { formatApiError } from "../../utils/apiErrorMessage";

type Tenant = { id: number; name: string };

/** Kategoria widoczna dla użytkownika (bez żargonu developerskiego). */
const RULE_TYPE_META: Record<
  string,
  { emoji: string; label: string; short: string }
> = {
  low_cover_days: { emoji: "🔴", label: "Braki towaru / zbyt krótki zapas", short: "Braki towaru" },
  dead_stock: { emoji: "⚫", label: "Martwy stock", short: "Martwy stock" },
  delayed_supplier_delivery: { emoji: "🔵", label: "Dostawca się spóźnia (otwarte PO)", short: "Spóźniona dostawa" },
  rising_demand: { emoji: "🟠", label: "Szybki wzrost sprzedaży vs średnia", short: "Wzrost zapotrzebowania" },
  high_capital_locked: { emoji: "🟡", label: "Duży kapitał zamrożony w magazynie", short: "Kapitał w magazynie" },
};

const RULE_CFG_DEFAULTS: Record<string, Record<string, number>> = {
  low_cover_days: { threshold_days: 7 },
  dead_stock: { no_sales_days: 60 },
  delayed_supplier_delivery: { po_age_days: 14 },
  rising_demand: { multiplier: 1.5 },
  high_capital_locked: { threshold_value: 10000 },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "brak daty";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function severityBadgeClass(sev: string): string {
  switch (sev) {
    case "critical":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    case "warning":
      return "bg-amber-50 text-amber-950 ring-1 ring-amber-200";
    case "info":
    default:
      return "bg-sky-50 text-sky-900 ring-1 ring-sky-200";
  }
}

function priorityLabel(sev: string): string {
  switch (sev) {
    case "critical":
      return "Wysoki";
    case "warning":
      return "Średni";
    case "info":
    default:
      return "Informacja";
  }
}

function statusLabelPl(st: string): string {
  switch (st) {
    case "open":
      return "Do obsłużenia";
    case "acknowledged":
      return "Przejrzane";
    case "resolved":
      return "Zamknięte";
    default:
      return st;
  }
}

function extractQuotedName(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = /«([^»]+)»/.exec(message);
  return m ? m[1].trim() : null;
}

function problemDescription(a: PurchasingAlertEvent): string {
  const meta = RULE_TYPE_META[a.rule_type];
  const base = meta?.label ?? a.title;
  const p = a.payload ?? {};
  if (a.rule_type === "low_cover_days") {
    const cov = typeof p.cover_days === "number" ? p.cover_days : Number(p.cover_days);
    const th = typeof p.threshold_days === "number" ? p.threshold_days : Number(p.threshold_days);
    const avg = typeof p.avg_daily === "number" ? p.avg_daily : Number(p.avg_daily);
    const sales30 = Number.isFinite(avg) ? Math.round(avg * 30) : null;
    const covR = Number.isFinite(cov) ? Math.round(cov * 10) / 10 : null;
    const thR = Number.isFinite(th) ? th : null;
    if (sales30 != null && covR != null && thR != null) {
      return `Zapas starczy na ok. ${covR} dni (cel: min. ${thR} dni). Sprzedaż ok. ${sales30} szt. / 30 dni.`;
    }
  }
  if (a.message && a.message.length < 220) return a.message;
  return base;
}

function suggestionText(a: PurchasingAlertEvent): string {
  const p = a.payload ?? {};
  switch (a.rule_type) {
    case "low_cover_days": {
      const avg = typeof p.avg_daily === "number" ? p.avg_daily : Number(p.avg_daily);
      const th = typeof p.threshold_days === "number" ? p.threshold_days : Number(p.threshold_days);
      if (Number.isFinite(avg) && avg > 0 && Number.isFinite(th)) {
        const qty = Math.max(1, Math.ceil(avg * th * 1.2));
        return `Zamów ok. ${qty} szt., aby dojść do bezpiecznego poziomu.`;
      }
      return "Sprawdź sugerowaną ilość w generatorze zakupów.";
    }
    case "dead_stock":
      return "Rozważ promocję, zestaw lub wstrzymanie domówień.";
    case "delayed_supplier_delivery":
      return "Skontaktuj się z dostawcą lub anuluj / zamknij PO w systemie.";
    case "rising_demand":
      return "Zwiększ zapas lub przyspiesz kolejne zamówienie.";
    case "high_capital_locked":
      return "Ogranicz kolejne dostawy tej pozycji do czasu spłaszczenia stanu.";
    default:
      return "Otwórz generator zakupów i zweryfikuj działania.";
  }
}

function KpiCard({
  title,
  value,
  hint,
  tone = "slate",
}: {
  title: string;
  value: string | number;
  hint?: ReactNode;
  tone?: "slate" | "amber" | "rose" | "emerald" | "violet";
}) {
  const ring =
    tone === "rose"
      ? "ring-rose-200/80"
      : tone === "amber"
        ? "ring-amber-200/80"
        : tone === "emerald"
          ? "ring-emerald-200/80"
          : tone === "violet"
            ? "ring-violet-200/80"
            : "ring-slate-200/90";
  return (
    <div className={`rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

type SortKey = "severity" | "title" | "entity" | "created_at" | "status";
type SortDir = "asc" | "desc";

const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export default function PurchasingAlertsPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchPurchasingAlertsSummary>> | null>(null);
  const [alerts, setAlerts] = useState<PurchasingAlertEvent[]>([]);
  const [rules, setRules] = useState<PurchasingAlertRule[]>([]);
  const [drafts, setDrafts] = useState<PurchasingAutoDraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [filterRuleType, setFilterRuleType] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState<string>(PURCHASING_ALERT_RULE_TYPES[0]);
  const [newRuleSeverity, setNewRuleSeverity] = useState("warning");
  const [ruleCfgValues, setRuleCfgValues] = useState<Record<string, number>>(() => ({ ...RULE_CFG_DEFAULTS.low_cover_days }));

  useEffect(() => {
    void api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        if (list.length > 0 && !list.some((t) => t.id === tenantId)) setTenantId(list[0].id);
      })
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const tid = searchParams.get("tenant_id");
    if (tid != null && tid !== "") {
      const n = Number(tid);
      if (Number.isFinite(n) && n >= 1) setTenantId(n);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!tenantId) return;
    void listSuppliers(tenantId, { status: "active" })
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [tenantId]);

  useEffect(() => {
    setRuleCfgValues({ ...RULE_CFG_DEFAULTS[newRuleType] });
  }, [newRuleType]);

  const supplierNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of suppliers) m.set(s.id, s.name);
    return m;
  }, [suppliers]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, a, r, d] = await Promise.all([
        fetchPurchasingAlertsSummary(tenantId),
        fetchPurchasingAlerts({
          tenantId,
          status: filterStatus || undefined,
          severity: filterSeverity || undefined,
          ruleType: filterRuleType || undefined,
        }),
        fetchPurchasingAlertRules(tenantId),
        fetchPurchasingAutoDrafts(tenantId, 15),
      ]);
      setSummary(s);
      setAlerts(a);
      setRules(r);
      setDrafts(d);
    } catch (e: unknown) {
      setErr(formatApiError(e) || "Nie udało się wczytać listy problemów.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, filterStatus, filterSeverity, filterRuleType]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAlerts = useMemo(() => {
    const copy = [...alerts];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "severity":
          cmp = (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
          break;
        case "title":
          cmp = a.title.localeCompare(b.title, "pl");
          break;
        case "entity": {
          const ea = [a.product_id, a.supplier_id].filter(Boolean).join("-");
          const eb = [b.product_id, b.supplier_id].filter(Boolean).join("-");
          cmp = ea.localeCompare(eb, "pl", { numeric: true });
          break;
        }
        case "status":
          cmp = a.status.localeCompare(b.status, "pl");
          break;
        case "created_at":
        default:
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      if (cmp !== 0) return cmp * dir;
      return b.id - a.id;
    });
    return copy;
  }, [alerts, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "created_at" || key === "severity" ? "desc" : "asc");
    }
  };

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const runScan = async () => {
    setActionBusy(true);
    setToast(null);
    try {
      const out = await postPurchasingAlertsRunScan(tenantId, selectedWarehouseId ?? null);
      setToast(out.message || "Skan zakończony — lista odświeżona.");
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const createDrafts = async () => {
    setActionBusy(true);
    setToast(null);
    try {
      const out = await postPurchasingAlertsCreateDraftOrders(tenantId, selectedWarehouseId ?? null);
      const n = out.purchase_order_ids?.length ?? 0;
      setToast(
        n > 0
          ? `Utworzono ${n} szkic(ów) zamówienia — sprawdź je w „Zamówieniach zakupowych” przed wysłką.`
          : "Brak nowych szkiców — żadna pozycja nie spełniła kryteriów lub szkice już istnieją.",
      );
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const bulkResolve = async () => {
    const ids = [...selectedIds].filter((id) => {
      const ev = alerts.find((a) => a.id === id);
      return ev && ev.status !== "resolved";
    });
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      await postPurchasingAlertsBulkResolve(tenantId, ids);
      setToast(`Oznaczono jako zamknięte: ${ids.length} pozycji.`);
      setSelectedIds(new Set());
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const addRule = async () => {
    setActionBusy(true);
    try {
      await postPurchasingAlertRule({
        tenant_id: tenantId,
        name: newRuleName.trim() || "Nowa reguła",
        type: newRuleType,
        severity: newRuleSeverity,
        config_json: JSON.stringify(ruleCfgValues),
        is_enabled: true,
      });
      setModalOpen(false);
      setNewRuleName("");
      setToast("Reguła została zapisana — przy następnym skanie zacznie wykrywać problemy.");
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setActionBusy(false);
    }
  };

  const ordersHref = `/purchasing/orders?tenant_id=${tenantId}`;
  const replenishmentHref = (a: PurchasingAlertEvent) => {
    const q = new URLSearchParams({ tenant_id: String(tenantId) });
    if (a.supplier_id != null) q.set("supplier_id", String(a.supplier_id));
    return `/purchasing/replenishment?${q.toString()}`;
  };

  const openCount = summary?.open_alerts ?? 0;
  const criticalOpen = summary?.critical_open ?? 0;
  const resolvedToday = summary?.resolved_today ?? 0;
  const draftsWaiting = summary?.draft_orders_waiting ?? 0;

  const updateRuleCfg = (key: string, val: string) => {
    const n = Number(val);
    setRuleCfgValues((prev) => ({ ...prev, [key]: Number.isFinite(n) ? n : prev[key] }));
  };

  const ruleCfgFields = () => {
    switch (newRuleType) {
      case "low_cover_days":
        return (
          <div>
            <label className="text-xs font-medium text-slate-600">Minimalny zapas liczony w dniach pokrycia</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={ruleCfgValues.threshold_days ?? 7}
              onChange={(e) => updateRuleCfg("threshold_days", e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Jeśli według sprzedaży zapas starczy na mniej dni — pojawi się problem.</p>
          </div>
        );
      case "dead_stock":
        return (
          <div>
            <label className="text-xs font-medium text-slate-600">Po ilu dniach bez sprzedaży uznać stock za „martwy”</label>
            <input
              type="number"
              min={7}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={ruleCfgValues.no_sales_days ?? 60}
              onChange={(e) => updateRuleCfg("no_sales_days", e.target.value)}
            />
          </div>
        );
      case "delayed_supplier_delivery":
        return (
          <div>
            <label className="text-xs font-medium text-slate-600">Otwarte zamówienie starsze niż (dni)</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={ruleCfgValues.po_age_days ?? 14}
              onChange={(e) => updateRuleCfg("po_age_days", e.target.value)}
            />
          </div>
        );
      case "rising_demand":
        return (
          <div>
            <label className="text-xs font-medium text-slate-600">Wzmocnienie sprzedaży 7 dni vs 30 dni (mnożnik)</label>
            <input
              type="number"
              step={0.1}
              min={1}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={ruleCfgValues.multiplier ?? 1.5}
              onChange={(e) => updateRuleCfg("multiplier", e.target.value)}
            />
          </div>
        );
      case "high_capital_locked":
        return (
          <div>
            <label className="text-xs font-medium text-slate-600">Próg wartości zamrożonego towaru (PLN)</label>
            <input
              type="number"
              min={100}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={ruleCfgValues.threshold_value ?? 10000}
              onChange={(e) => updateRuleCfg("threshold_value", e.target.value)}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Problemy wymagające uwagi</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Podmiot</label>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            value={tenantId}
            onChange={(e) => setTenantId(Number(e.target.value))}
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {err}
          <button type="button" className="ml-3 underline" onClick={() => setErr(null)}>
            Zamknij
          </button>
        </div>
      ) : null}
      {toast ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {toast}
          <button type="button" className="ml-3 underline" onClick={() => setToast(null)}>
            OK
          </button>
        </div>
      ) : null}

      {loading && !summary ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Otwarte problemy" value={openCount} tone="slate" hint="Wymagają decyzji lub działania." />
          <KpiCard title="Pilne (wysoki priorytet)" value={criticalOpen} tone="rose" hint="Zacznij od tych pozycji w tabeli." />
          <KpiCard title="Zamknięte dziś" value={resolvedToday} tone="emerald" hint="Dobra robota — utrzymuj porządek na liście." />
          <KpiCard
            title="Szkice zamówień do sprawdzenia"
            value={draftsWaiting}
            hint={<Link className="text-sky-700 underline" to={ordersHref}>Przejdź do zamówień zakupowych</Link>}
            tone="violet"
          />
        </div>
      )}

      <SectionCard title="Co możesz zrobić teraz">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void runScan()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Przeskanuj magazyn i zamówienia
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void createDrafts()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
          >
            Utwórz szkice zamówień (pozycje pilne)
          </button>
          <button
            type="button"
            disabled={actionBusy || selectedIds.size === 0}
            onClick={() => void bulkResolve()}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 disabled:opacity-50"
          >
            Oznacz jako zamknięte ({selectedIds.size})
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Skan odczytuje reguły poniżej i odświeża listę. Szkice zawsze możesz poprawić przed wysłką do dostawcy.
        </p>
      </SectionCard>

      <SectionCard title="Lista problemów">
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Status: wszystkie</option>
            <option value="open">Do obsłużenia</option>
            <option value="acknowledged">Przejrzane</option>
            <option value="resolved">Zamknięte</option>
          </select>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="">Priorytet: wszystkie</option>
            <option value="critical">Wysoki</option>
            <option value="warning">Średni</option>
            <option value="info">Informacja</option>
          </select>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={filterRuleType}
            onChange={(e) => setFilterRuleType(e.target.value)}
          >
            <option value="">Kategoria: wszystkie</option>
            {PURCHASING_ALERT_RULE_TYPES.map((t) => (
              <option key={t} value={t}>
                {RULE_TYPE_META[t]?.emoji} {RULE_TYPE_META[t]?.short ?? t}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Zaznacz widoczne"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(sortedAlerts.filter((a) => a.status !== "resolved").map((a) => a.id)));
                      } else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="cursor-pointer pb-2 pr-3" onClick={() => toggleSort("severity")}>
                  Priorytet {sortKey === "severity" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="cursor-pointer pb-2 pr-3" onClick={() => toggleSort("title")}>
                  Problem {sortKey === "title" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="cursor-pointer pb-2 pr-3" onClick={() => toggleSort("entity")}>
                  Produkt {sortKey === "entity" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2 pr-3">Dostawca</th>
                <th className="pb-2 pr-3">Sugestia</th>
                <th className="cursor-pointer pb-2 pr-3" onClick={() => toggleSort("created_at")}>
                  Zgłoszono {sortKey === "created_at" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="cursor-pointer pb-2 pr-3" onClick={() => toggleSort("status")}>
                  Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
                <th className="pb-2">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAlerts.map((a) => {
                const prodName = extractQuotedName(a.message) ?? (a.product_id != null ? `Produkt #${a.product_id}` : "—");
                const supName =
                  a.supplier_id != null ? supplierNameById.get(a.supplier_id) ?? `Dostawca #${a.supplier_id}` : "—";
                const cat = RULE_TYPE_META[a.rule_type];
                return (
                  <tr key={a.id} className="align-top">
                    <td className="py-2 pr-2">
                      {a.status !== "resolved" ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={(e) => toggleSelect(a.id, e.target.checked)}
                        />
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${severityBadgeClass(a.severity)}`}>
                        {priorityLabel(a.severity)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-900">
                      <div className="font-medium text-slate-900">
                        {cat?.emoji} {cat?.short ?? "Problem"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">{problemDescription(a)}</div>
                    </td>
                    <td className="py-2 pr-3 text-slate-800">
                      {a.product_id != null ? (
                        <Link className="text-sky-800 underline" to={`/products/${a.product_id}`}>
                          {prodName}
                        </Link>
                      ) : (
                        <span className="text-slate-500">{prodName}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-700">{supName}</td>
                    <td className="py-2 pr-3 text-slate-700">{suggestionText(a)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-600">{fmtDate(a.created_at)}</td>
                    <td className="py-2 pr-3 text-slate-700">{statusLabelPl(a.status)}</td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1">
                        <Link className="text-xs font-medium text-sky-800 underline" to={replenishmentHref(a)}>
                          Dodaj do szkicu (generator)
                        </Link>
                        {a.status === "open" ? (
                          <button
                            type="button"
                            className="text-left text-xs text-slate-700 underline"
                            onClick={() =>
                              void patchPurchasingAlertAcknowledge(a.id, tenantId).then(() => load())
                            }
                          >
                            Oznacz jako przejrzane
                          </button>
                        ) : null}
                        {a.status !== "resolved" ? (
                          <button
                            type="button"
                            className="text-left text-xs text-slate-700 underline"
                            onClick={() => void patchPurchasingAlertResolve(a.id, tenantId).then(() => load())}
                          >
                            Zamknij
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedAlerts.length === 0 && !loading ? (
            <p className="mt-4 text-sm text-slate-500">Brak pozycji — zmień filtry lub uruchom skan.</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Reguły wykrywania (dla administratora zakupów)">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Dodaj regułę
          </button>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <span className="font-medium text-slate-900">{r.name}</span>
                <span className="ml-2 text-slate-600">
                  {RULE_TYPE_META[r.type]?.emoji} {RULE_TYPE_META[r.type]?.label ?? r.type} ·{" "}
                  <span className={`rounded px-1.5 py-0.5 text-xs ${severityBadgeClass(r.severity)}`}>
                    {priorityLabel(r.severity)}
                  </span>
                </span>
              </div>
              <label className="flex items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={r.is_enabled}
                  onChange={(e) =>
                    void patchPurchasingAlertRule(r.id, tenantId, { is_enabled: e.target.checked }).then(() => load())
                  }
                />
                Włączona
              </label>
            </li>
          ))}
        </ul>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">Nie masz jeszcze reguł — dodaj pierwszą, aby skan miał się czego trzymać.</p>
        ) : null}
      </SectionCard>

      <SectionCard title="Ostatnio utworzone szkice (automat)">
        <ul className="space-y-3 text-sm">
          {drafts.map((d) => (
            <li key={d.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
              <div className="font-medium text-slate-800">{fmtDate(d.generated_at)}</div>
              <div className="mt-1 text-slate-600">
                {d.purchase_order_ids.length === 0 ? (
                  <span>Brak powiązanych numerów PO w zapisie.</span>
                ) : (
                  <>
                    Numery szkiców:{" "}
                    {d.purchase_order_ids.map((id) => (
                      <span key={id}>
                        <Link className="text-sky-700 underline" to={ordersHref}>
                          {id}
                        </Link>{" "}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {drafts.length === 0 ? <p className="text-sm text-slate-500">Jeszcze nie zapisano partii szkiców z tej ścieżki.</p> : null}
      </SectionCard>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Nowa reguła wykrywania</h3>
            <p className="mt-1 text-xs text-slate-500">Ustal próg liczbami — system zapisze konfigurację po swojej stronie.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Nazwa (dla zespołu)</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="np. Pilnuj zapasu poniżej tygodnia"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Rodzaj problemu</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value)}
                >
                  {PURCHASING_ALERT_RULE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RULE_TYPE_META[t]?.emoji} {RULE_TYPE_META[t]?.label ?? t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Priorytet domyślny</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={newRuleSeverity}
                  onChange={(e) => setNewRuleSeverity(e.target.value)}
                >
                  <option value="info">Informacja</option>
                  <option value="warning">Średni</option>
                  <option value="critical">Wysoki</option>
                </select>
              </div>
              {ruleCfgFields()}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600" onClick={() => setModalOpen(false)}>
                Anuluj
              </button>
              <button
                type="button"
                disabled={actionBusy}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void addRule()}
              >
                Zapisz
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
