import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { fetchWorkforceCostOverview, type EmployeeCostOverviewRead, type EmployeeCostOverviewRow } from "../../api/workforceApi";
import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "../../components/listPage/listSellasistTokens";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { OPERATIONAL_COST_DISCLAIMER_PL } from "../../utils/operationalEmployerCosts";

function fmtPln0(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 0 }).format(n);
}

function fmtPln2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function contractLabel(ct: string): string {
  const c = (ct || "").toLowerCase();
  if (c === "uop") return "UoP";
  if (c === "b2b") return "B2B";
  if (c === "zlecenie") return "Zlecenie";
  return ct || "—";
}

function rowEmploymentType(r: EmployeeCostOverviewRow): string {
  const raw = (r.employment_label || "").trim();
  if (raw) return raw;
  return contractLabel(r.contract_type);
}

function statusLabel(r: EmployeeCostOverviewRow): string {
  if (!r.is_active_account) return "Nieaktywny";
  if ((r.employer_total_monthly_pln ?? 0) > 0 || (r.gross_monthly_pln ?? 0) > 0 || (r.net_monthly_pln ?? 0) > 0) return "Aktywny";
  return "Brak danych";
}

const kpiCard =
  "rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5 sm:py-4";

export default function EmployeeCostsOverviewPage() {
  const { user, loading: authLoading, sessionReady, hasPermission } = useAuth();
  const canView =
    hasPermission("settings.users") || hasPermission("workforce.costs.read") || isSuperRole(user?.role ?? "");

  const [data, setData] = useState<EmployeeCostOverviewRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView || !sessionReady) {
      setLoading(false);
      if (!canView) setData(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchWorkforceCostOverview();
      setData(res);
    } catch (e) {
      console.error("[EmployeeCostsOverview] fetch failed", e);
      setErr("Nie udało się wczytać zestawienia kosztów. Sprawdź uprawnienia i połączenie z serwerem.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canView, sessionReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const th = listSellasistTableHeaderCellGrid;
  const td = listSellasistTableBodyCellGrid;

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      emp: data.sum_employer_total_monthly_pln,
      net: data.sum_net_monthly_pln,
      gross: data.sum_gross_monthly_pln,
      n: data.total_employees,
      withNum: data.employees_with_cost_numbers,
      avg: data.avg_employer_total_monthly_pln,
    };
  }, [data]);

  const hasConfiguredCosts = totals != null && totals.withNum > 0;
  const showEmptyHint = totals != null && !hasConfiguredCosts && !loading && !err;

  if (authLoading || !sessionReady) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 py-6 sm:px-6">
          <p className="text-sm text-slate-600">Ładowanie sesji…</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 sm:mx-6 sm:mt-6">
          <p className="text-sm font-medium text-amber-950">Brak uprawnień do widoku kosztów pracowników.</p>
          <p className="mt-1 text-xs text-amber-900/90">Wymagane jest uprawnienie „Ustawienia → Administratorzy” lub „Koszty pracodawcy — podgląd”.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6">
        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 shadow-sm" role="alert">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-700">Wczytywanie danych…</p>
            <p className="mt-1 text-xs text-slate-500">Pobieranie profili kosztów z serwera.</p>
          </div>
        ) : data && totals ? (
          <>
            <p className="text-xs leading-relaxed text-slate-500">{data.disclaimer_pl || OPERATIONAL_COST_DISCLAIMER_PL}</p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className={kpiCard}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Liczba pracowników</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{totals.n}</p>
              </div>
              <div className={kpiCard}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Łączne netto</p>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{fmtPln0(totals.net)}</p>
                <p className="mt-1 text-[11px] text-slate-500">miesięcznie, szacunek</p>
              </div>
              <div className={kpiCard}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Łączne brutto</p>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{fmtPln0(totals.gross)}</p>
                <p className="mt-1 text-[11px] text-slate-500">miesięcznie, szacunek</p>
              </div>
              <div className={`${kpiCard} border-emerald-200/90 bg-emerald-50/50`}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Łączny koszt pracodawcy</p>
                <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950">{fmtPln0(totals.emp)}</p>
                <p className="mt-1 text-[11px] text-emerald-800/90">miesięcznie, szacunek</p>
              </div>
              <div className={kpiCard}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Średni koszt pracownika</p>
                <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{totals.avg != null ? fmtPln0(totals.avg) : "—"}</p>
                <p className="mt-1 text-[11px] text-slate-500">koszt pracodawcy / osobę z danymi ({totals.withNum})</p>
              </div>
            </div>

            {showEmptyHint ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-slate-800">Brak skonfigurowanych kosztów pracowników</p>
                <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-600">
                  Żaden profil nie zawiera jeszcze kwot netto / brutto ani kosztu pracodawcy. Uzupełnij zakładkę „Koszty pracownika” w profilu użytkownika (Administratorzy → wybór osoby → Organizacja i koszty).
                </p>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full border-collapse text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/80">
                    <tr>
                      <th className={th}>Pracownik</th>
                      <th className={th}>Stanowisko</th>
                      <th className={th}>Typ zatrudnienia</th>
                      <th className={`${th} text-right`}>Netto</th>
                      <th className={`${th} text-right`}>Brutto</th>
                      <th className={`${th} text-right`}>Koszt pracodawcy</th>
                      <th className={`${th} text-right`}>Koszt godzinowy</th>
                      <th className={th}>Status</th>
                      <th className={`${th} w-[100px]`}> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-600">
                          Brak pracowników do wyświetlenia.
                        </td>
                      </tr>
                    ) : (
                      data.rows.map((r) => (
                        <tr key={r.user_id} className="border-b border-slate-100 hover:bg-slate-50/60">
                          <td className={td}>
                            <span className="font-semibold text-slate-900">{r.full_name || r.login}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{r.login}</span>
                          </td>
                          <td className={td}>{r.workstation || "—"}</td>
                          <td className={td}>{rowEmploymentType(r)}</td>
                          <td className={`${td} text-right tabular-nums`}>{fmtPln0(r.net_monthly_pln ?? undefined)}</td>
                          <td className={`${td} text-right tabular-nums`}>{fmtPln0(r.gross_monthly_pln ?? undefined)}</td>
                          <td className={`${td} text-right tabular-nums font-semibold text-emerald-900`}>
                            {fmtPln0(r.employer_total_monthly_pln ?? undefined)}
                          </td>
                          <td className={`${td} text-right tabular-nums text-slate-700`}>{fmtPln2(r.employer_hourly_pln ?? undefined)}</td>
                          <td className={td}>
                            <span
                              className={
                                r.is_active_account && (r.employer_total_monthly_pln ?? 0) > 0
                                  ? "rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800"
                                  : "rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900"
                              }
                            >
                              {statusLabel(r)}
                            </span>
                          </td>
                          <td className={td}>
                            <Link
                              to={`/settings/administrators/${r.user_id}?tab=workforce`}
                              className="text-xs font-semibold text-blue-700 underline hover:text-blue-900"
                            >
                              Profil
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : !loading && !err ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600 shadow-sm">
            Brak danych do wyświetlenia.
          </div>
        ) : null}
      </div>

      {!loading && !err && totals ? (
        <div className="sticky bottom-0 z-20 border-t border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-4 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-900/80">Szacowany miesięczny koszt wszystkich pracowników</p>
              <p className="mt-1 text-[11px] text-emerald-900/75">Suma kosztów pracodawcy z uzupełnionych profili (operacyjnie).</p>
            </div>
            <p className="text-3xl font-black tabular-nums tracking-tight text-emerald-950 sm:text-4xl">{fmtPln0(totals.emp)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
