/**
 * Auto-uzupełnianie: szkice zamówień na podstawie braków — bez wysyłki do dostawcy.
 * Konfiguracja techniczna jest składana w tle; użytkownik widzi tylko decyzje biznesowe.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { listSuppliers, type SupplierRead } from "../../api/inboundSuppliersApi";
import {
  deleteAutoReorderRule,
  fetchAutoReorderHistory,
  fetchAutoReorderPreview,
  fetchAutoReorderRules,
  patchAutoReorderRule,
  postAutoReorderRule,
  postAutoReorderRunNow,
  type PurchaseAutoReorderHistoryPayload,
  type PurchaseAutoReorderPreviewPayload,
  type PurchaseAutoRule,
  type PurchaseAutoRun,
} from "../../api/purchasingAutoReorderApi";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  PurchasingContentArea,
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingFilterPrimaryButtonClass,
  purchasingSelectClass,
} from "../../modules/purchasing/ui";
import { formatApiError } from "../../utils/apiErrorMessage";

type Tenant = { id: number; name: string };

const WD_LABEL = ["", "Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"] as const;

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "jeszcze nie było uruchomienia";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function parseWeekdays(json: string): number[] {
  try {
    const x = JSON.parse(json || "[]") as unknown;
    if (!Array.isArray(x)) return [1, 2, 3, 4, 5];
    return x.map((n) => Number(n)).filter((n) => n >= 1 && n <= 7);
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function formatWeekdayList(days: number[]): string {
  const u = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (u.length === 7) return "codziennie";
  if (u.join(",") === "1,2,3,4,5") return "Pn–Pt";
  return u.map((d) => WD_LABEL[d] ?? String(d)).join(", ");
}

/** Najbliższe uruchomienie wg harmonogramu reguł (czas lokalny przeglądarki). */
function nextScheduledRunLabel(rules: PurchaseAutoRule[]): string {
  const enabled = rules.filter((r) => r.is_enabled);
  if (enabled.length === 0) return "Włącz co najmniej jedną automatyzację lub uruchom ręcznie.";

  const now = new Date();
  let best: Date | null = null;

  for (const r of enabled) {
    const days = parseWeekdays(r.weekdays_json);
    if (days.length === 0) continue;
    const parts = r.run_time.split(":");
    const hh = Number(parts[0]);
    const mm = Number(parts[1] ?? 0);
    if (!Number.isFinite(hh)) continue;

    for (let add = 0; add < 14; add++) {
      const d = new Date(now);
      d.setDate(d.getDate() + add);
      const wd = d.getDay() === 0 ? 7 : d.getDay();
      if (!days.includes(wd)) continue;
      d.setHours(hh, Number.isFinite(mm) ? mm : 0, 0, 0);
      if (d.getTime() > now.getTime()) {
        if (!best || d < best) best = d;
        break;
      }
    }
  }

  if (!best) return "Sprawdź godzinę i dni tygodnia w automatyzacjach.";
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const best0 = new Date(best.getFullYear(), best.getMonth(), best.getDate());
  const diffDays = Math.round((best0.getTime() - today0.getTime()) / 86400000);
  const rel = diffDays === 1 ? "jutro " : diffDays === 0 ? "dziś " : "";
  const time = best.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const datePart = best.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
  return `${rel}${datePart}, ${time}`;
}

function parseConfig(json: string): Record<string, unknown> {
  try {
    const o = JSON.parse(json || "{}") as unknown;
    return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function opisAutomatyzacji(configJson: string, supplierNames: Map<number, string>): string {
  const o = parseConfig(configJson);
  const cover = typeof o.target_cover_days === "number" ? o.target_cover_days : Number(o.target_cover_days) || 14;
  const onlySid = o.only_supplier_id;
  const sid = onlySid != null && String(onlySid).trim() !== "" ? Number(onlySid) : null;
  const sup = sid != null && Number.isFinite(sid) ? supplierNames.get(sid) : null;
  const części: string[] = [];
  if (sup) części.push(`Tylko dostawca: ${sup}`);
  else części.push("Wszyscy dostawcy z generatora");
  części.push(`uzupełnia braki do ok. ${cover} dni pokrycia`);
  if (o.exclude_dead_stock !== false) części.push("pomija martwy stock");
  return części.join(" · ");
}

function humanRunLog(logJson: string | null | undefined): string {
  if (!logJson) return "Brak szczegółów w logu.";
  try {
    const o = JSON.parse(logJson) as { message?: string; steps?: string[] };
    if (typeof o.message === "string" && o.message.trim()) return o.message;
    if (Array.isArray(o.steps) && o.steps.length) return o.steps.join(" → ");
  } catch {
    /* ignore */
  }
  return "Zapisano podsumowanie uruchomienia.";
}

function buildEngineConfig(params: {
  coverDays: number;
  warehouseId: number | null;
  onlySupplierId: number | null;
}): string {
  const o = {
    only_segments: [] as string[],
    max_budget: null as number | null,
    only_critical_products: false,
    exclude_dead_stock: true,
    min_supplier_score: null as number | null,
    target_cover_days: params.coverDays,
    auto_group_by_supplier: true,
    minimum_order_value_required: false,
    warehouse_id: params.warehouseId,
    segment_range_days: 90,
    only_supplier_id: params.onlySupplierId,
  };
  return JSON.stringify(o, null, 0);
}

export default function PurchasingAutoReorderPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierRead[]>([]);
  const [rules, setRules] = useState<PurchaseAutoRule[]>([]);
  const [hist, setHist] = useState<PurchaseAutoReorderHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizName, setWizName] = useState("Codzienne uzupełnienie");
  const [wizSupplierId, setWizSupplierId] = useState<string>("");
  const [wizCoverDays, setWizCoverDays] = useState(14);
  const [wizTime, setWizTime] = useState("07:00");
  const [wizWeekdays, setWizWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PurchaseAutoReorderPreviewPayload | null>(null);
  const [previewRuleId, setPreviewRuleId] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  const supplierNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of suppliers) m.set(s.id, s.name);
    return m;
  }, [suppliers]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [r, h] = await Promise.all([fetchAutoReorderRules(tenantId), fetchAutoReorderHistory(tenantId)]);
      setRules(r);
      setHist(h);
    } catch (e: unknown) {
      setErr(formatApiError(e) || "Nie udało się wczytać auto-uzupełniania.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = hist?.kpis;
  const enabledCount = rules.filter((r) => r.is_enabled).length;
  const nextRunText = useMemo(() => nextScheduledRunLabel(rules), [rules]);
  const draftsToday = kpis?.drafts_created_today ?? 0;
  const ostatnieUruchomienie = useMemo(() => fmtDateTime(kpis?.last_run_finished_at ?? null), [kpis]);

  const toggleWeekday = (d: number) => {
    setWizWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  };

  const resetWizard = () => {
    setWizardStep(1);
    setWizName("Codzienne uzupełnienie");
    setWizSupplierId("");
    setWizCoverDays(14);
    setWizTime("07:00");
    setWizWeekdays([1, 2, 3, 4, 5]);
  };

  const zapiszAutomatyzacje = async () => {
    setBusy(true);
    try {
      const onlySup = wizSupplierId.trim() === "" ? null : Number(wizSupplierId);
      const cfg = buildEngineConfig({
        coverDays: wizCoverDays,
        warehouseId: selectedWarehouseId ?? null,
        onlySupplierId: Number.isFinite(onlySup as number) ? (onlySup as number) : null,
      });
      await postAutoReorderRule({
        tenant_id: tenantId,
        name: wizName.trim() || "Automatyzacja",
        run_time: wizTime.trim(),
        weekdays_json: JSON.stringify(wizWeekdays.length ? wizWeekdays : [1, 2, 3, 4, 5]),
        config_json: cfg,
        is_enabled: true,
      });
      setWizardOpen(false);
      resetWizard();
      setToast("Zapisano automatyzację — możesz ją włączać i wyłączać w tabeli.");
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const uruchomTeraz = async (ruleId?: number | null) => {
    setBusy(true);
    try {
      const out = await postAutoReorderRunNow({ tenant_id: tenantId, rule_id: ruleId ?? undefined, dry_run: false });
      const sumPo = out.results.reduce((a, r) => a + r.created_orders_count, 0);
      setToast(
        sumPo > 0
          ? `Przygotowano ${sumPo} szkic(ów) zamówienia — sprawdź je w module zamówień przed wysłką.`
          : "Uruchomienie zakończone — brak nowych szkiców (filtry lub stany magazynowe).",
      );
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const podglad = async (ruleId: number) => {
    setPreviewRuleId(ruleId);
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const p = await fetchAutoReorderPreview(tenantId, ruleId);
      setPreviewData(p);
    } catch (e: unknown) {
      setPreviewData(null);
      setErr(formatApiError(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const usunRegule = async (id: number) => {
    if (!window.confirm("Usunąć tę automatyzację?")) return;
    setBusy(true);
    try {
      await deleteAutoReorderRule(id, tenantId);
      setToast("Usunięto.");
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const przełaczAktywna = async (r: PurchaseAutoRule) => {
    setBusy(true);
    try {
      await patchAutoReorderRule(r.id, tenantId, { is_enabled: !r.is_enabled });
      await load();
    } catch (e: unknown) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Auto-uzupełnianie"
            subtitle="System sam przygotuje szkice zamówień, gdy wykryje braki. Ty zatwierdzasz treść — nic nie idzie do dostawcy bez Twojej decyzji."
          />
        }
        status={
          <>
            {toast ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                {toast}
                <button type="button" className="ml-3 underline" onClick={() => setToast(null)}>
                  OK
                </button>
              </div>
            ) : null}
            {err ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {err}
                <button type="button" className="ml-3 underline" onClick={() => setErr(null)}>
                  Zamknij
                </button>
              </div>
            ) : null}
          </>
        }
        kpis={
          <PurchasingKpiGrid columns={3}>
            <PurchasingKpiCard
              title="Włączone automatyzacje"
              value={loading ? "…" : enabledCount}
              subtitle="Liczba aktywnych wierszy w tabeli poniżej."
              tone="emerald"
            />
            <PurchasingKpiCard
              title="Najbliższe uruchomienie (plan)"
              value={loading ? "…" : nextRunText}
              subtitle="Liczone z godziny i dni tygodnia — pełny harmonogram cron można dodać na serwerze."
              tone="blue"
            />
            <PurchasingKpiCard
              title="Szkice utworzone dziś (cały podmiot)"
              value={loading ? "…" : draftsToday}
              subtitle={`Ostatnie zakończenie silnika: ${ostatnieUruchomienie}`}
              tone="indigo"
            />
          </PurchasingKpiGrid>
        }
        filters={
          <PurchasingFilterBar>
            <PurchasingFilterField label="Podmiot">
              <select className={purchasingSelectClass} value={tenantId} onChange={(e) => setTenantId(Number(e.target.value))}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (#{t.id})
                  </option>
                ))}
              </select>
            </PurchasingFilterField>
          </PurchasingFilterBar>
        }
        table={
          <>
            <PurchasingTableSection
              title="Twoje automatyzacje"
              indicatorClass="bg-slate-700"
              action={
                <button
                  type="button"
                  onClick={() => {
                    resetWizard();
                    setWizardOpen(true);
                  }}
                  className={purchasingFilterPrimaryButtonClass}
                >
                  + Dodaj automatyzację
                </button>
              }
            >
              <table className="min-w-full text-left text-sm">
                <PurchasingTableHeader
                  headers={["Nazwa", "Dostawca", "Kiedy działa", "Co robi", "Status", "Akcje"]}
                />
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Ładowanie…
                  </td>
                </tr>
              ) : null}
              {!loading && rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    Nie masz jeszcze automatyzacji — dodaj pierwszą, aby przyspieszyć uzupełnianie braków.
                  </td>
                </tr>
              ) : null}
              {rules.map((r) => {
                const cfgSid = parseConfig(r.config_json).only_supplier_id;
                const sid = cfgSid != null ? Number(cfgSid) : NaN;
                const supCell =
                  Number.isFinite(sid) && supplierNames.has(sid) ? supplierNames.get(sid)! : "Wszyscy dostawcy z generatora";
                const dni = formatWeekdayList(parseWeekdays(r.weekdays_json));
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-slate-700">{supCell}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {dni} · {r.run_time}
                    </td>
                    <td className="max-w-md px-3 py-2 text-slate-700">{opisAutomatyzacji(r.config_json, supplierNames)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          r.is_enabled
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200"
                            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200"
                        }
                      >
                        {r.is_enabled ? "Aktywne" : "Wyłączone"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="text-xs text-sky-700 underline" disabled={busy} onClick={() => void uruchomTeraz(r.id)}>
                          Uruchom teraz
                        </button>
                        <button type="button" className="text-xs text-slate-700 underline" disabled={busy} onClick={() => void podglad(r.id)}>
                          Zobacz listę produktów
                        </button>
                        <button type="button" className="text-xs text-slate-700 underline" disabled={busy} onClick={() => void przełaczAktywna(r)}>
                          {r.is_enabled ? "Wyłącz" : "Włącz"}
                        </button>
                        <button type="button" className="text-xs text-red-700 underline" disabled={busy} onClick={() => void usunRegule(r.id)}>
                          Usuń
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </PurchasingTableSection>

            <PurchasingTableSection title="Ostatnie uruchomienia" indicatorClass="bg-indigo-500">
              <table className="min-w-full text-left text-sm">
                <PurchasingTableHeader
                  headers={["Start", "Wynik", "Nowe szkice", "Pominięte pozycje", "Notatka"]}
                />
            <tbody className="divide-y divide-slate-100">
              {(hist?.runs ?? []).map((run: PurchaseAutoRun) => (
                <tr key={run.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(run.started_at)}</td>
                  <td className="px-3 py-2">{run.status === "completed" ? "Zakończone" : run.status}</td>
                  <td className="px-3 py-2 tabular-nums">{run.created_orders_count}</td>
                  <td className="px-3 py-2 tabular-nums">{run.skipped_products_count}</td>
                  <td className="max-w-md px-3 py-2 text-slate-700">{humanRunLog(run.log_json)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(hist?.runs.length ?? 0) === 0 && !loading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">Brak historii — uruchom automatyzację pierwszy raz.</p>
          ) : null}
            </PurchasingTableSection>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void uruchomTeraz(null)}
          className={purchasingFilterPrimaryButtonClass}
        >
          Uruchom wszystkie włączone
        </button>
        <Link
          to={`/purchasing/orders?tenant_id=${tenantId}`}
          className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Otwórz szkice zamówień
        </Link>
      </div>

      {wizardOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setWizardOpen(false)} role="presentation">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Nowa automatyzacja</h3>
            <p className="mt-1 text-xs text-slate-500">
              Krok {wizardStep} z 3 — bez technicznych formatów, tylko to, co musisz ustalić z biznesem.
            </p>

            {wizardStep === 1 ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Nazwa (widoczna w tabeli)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={wizName}
                    onChange={(e) => setWizName(e.target.value)}
                    placeholder="np. Codzienne uzupełnienie AN-EL"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Dostawca</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={wizSupplierId}
                    onChange={(e) => setWizSupplierId(e.target.value)}
                  >
                    <option value="">Wszyscy dostawcy (wg generatora)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Możesz ograniczyć automatyzację do jednego kontrahenta.</p>
                </div>
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Godzina uruchomienia (plan)</label>
                  <input
                    type="time"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={wizTime}
                    onChange={(e) => setWizTime(e.target.value)}
                  />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-600">Dni tygodnia</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                      <label key={d} className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs">
                        <input type="checkbox" checked={wizWeekdays.includes(d)} onChange={() => toggleWeekday(d)} />
                        {WD_LABEL[d]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Uzupełniaj, gdy zapas jest krótszy niż (dni pokrycia)</label>
                  <input
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={wizCoverDays}
                    onChange={(e) => setWizCoverDays(Number(e.target.value) || 14)}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Im wyższa liczba, tym wcześniej system zaproponuje domówienie. Magazyn z kontekstu górnego paska:{" "}
                    {selectedWarehouseId != null ? `#${selectedWarehouseId}` : "cały podmiot"}.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-between gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-slate-600"
                onClick={() => (wizardStep <= 1 ? setWizardOpen(false) : setWizardStep((s) => s - 1))}
              >
                {wizardStep <= 1 ? "Anuluj" : "Wstecz"}
              </button>
              {wizardStep < 3 ? (
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  onClick={() => setWizardStep((s) => s + 1)}
                >
                  Dalej
                </button>
              ) : (
                <button type="button" disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => void zapiszAutomatyzacje()}>
                  Zapisz automatyzację
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewOpen(false)} role="presentation">
          <div className="max-h-[90vh] w-full min-w-0 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">
              Lista produktów{previewRuleId != null ? ` — reguła #${previewRuleId}` : ""}
            </h3>
            {previewLoading ? <p className="mt-4 text-sm text-slate-500">Ładowanie…</p> : null}
            {!previewLoading && previewData ? (
              <p className="mt-2 text-sm text-slate-600">
                {previewData.rule_name}: <strong>{previewData.count}</strong> pozycji spełnia warunki.
              </p>
            ) : null}
            {!previewLoading && previewData ? (
              <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-slate-100">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-2">Produkt</th>
                      <th className="px-2 py-2">Priorytet (ABC/XYZ)</th>
                      <th className="px-2 py-2">Sztuki</th>
                      <th className="px-2 py-2">Szac. wartość</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row) => (
                      <tr key={row.product_id} className="border-t border-slate-100">
                        <td className="px-2 py-1">
                          <div>{row.name ?? `Produkt #${row.product_id}`}</div>
                          {row.supplier_name ? <div className="text-slate-500">{row.supplier_name}</div> : null}
                        </td>
                        <td className="px-2 py-1">{row.segment ?? "—"}</td>
                        <td className="px-2 py-1 tabular-nums">{row.suggested_qty}</td>
                        <td className="px-2 py-1 tabular-nums">{row.estimated_order_value ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => setPreviewOpen(false)}>
                Zamknij
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PurchasingContentArea>
  );
}
