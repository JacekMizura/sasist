import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, FileText, MoreHorizontal, Users, Wallet } from "lucide-react";

import {
  fetchWorkforceCostOverview,
  type EmployeeCostOverviewRead,
  type EmployeeCostOverviewRow,
} from "../../api/workforceApi";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { OPERATIONAL_COST_DISCLAIMER_PL } from "../../utils/operationalEmployerCosts";

function fmtPln0(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPln2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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
  if (
    (r.employer_total_monthly_pln ?? 0) > 0 ||
    (r.gross_monthly_pln ?? 0) > 0 ||
    (r.net_monthly_pln ?? 0) > 0
  )
    return "Aktywny";
  return "Brak danych";
}

// Funkcja pomocnicza do generowania inicjałów na podstawie nazwy lub loginu
function getInitials(name?: string | null, login?: string | null): string {
  const n = (name || login || "?").trim();
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

export default function EmployeeCostsOverviewPage() {
  const { user, loading: authLoading, sessionReady, hasPermission } = useAuth();
  const canView =
    hasPermission("settings.users") ||
    hasPermission("workforce.costs.read") ||
    isSuperRole(user?.role ?? "");

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
      setErr(
        "Nie udało się wczytać zestawienia kosztów. Sprawdź uprawnienia i połączenie z serwerem."
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canView, sessionReady]);

  useEffect(() => {
    void load();
  }, [load]);

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
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="px-6 py-8">
          <p className="text-sm text-slate-500">Ładowanie sesji…</p>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="m-6 rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm font-semibold text-amber-900">
            Brak uprawnień do widoku kosztów pracowników.
          </p>
          <p className="mt-1 text-sm text-amber-800/90">
            Wymagane jest uprawnienie „Ustawienia → Administratorzy” lub „Koszty pracodawcy
            — podgląd”.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 bg-white">
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-900 shadow-sm" role="alert">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-700">Wczytywanie danych…</p>
          <p className="mt-1 text-xs text-slate-500">Pobieranie profili kosztów z serwera.</p>
        </div>
      ) : data && totals ? (
        <>
          {/* 1. KARTY KPI (Góra) — 4 karty jak na screenie */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Pracownicy
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-slate-900">
                    {totals.n}
                  </span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-600">
                  <Users className="h-5 w-5" strokeWidth={1.5} />
                </div>
              </div>
              <span className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                Liczba osób
              </span>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Łączne Netto
                  </span>
                  <span className="text-xl font-bold tabular-nums text-slate-900">
                    {fmtPln0(totals.net)}
                  </span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-600">
                  <Wallet className="h-5 w-5" strokeWidth={1.5} />
                </div>
              </div>
              <span className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                Miesięcznie, szacunek
              </span>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Łączne Brutto
                  </span>
                  <span className="text-xl font-bold tabular-nums text-slate-900">
                    {fmtPln0(totals.gross)}
                  </span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-600">
                  <FileText className="h-5 w-5" strokeWidth={1.5} />
                </div>
              </div>
              <span className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                Miesięcznie, szacunek
              </span>
            </div>

            {/* Wyróżniona karta kluczowa */}
            <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-800">
                    Koszt Pracodawcy
                  </span>
                  <span className="text-xl font-bold tabular-nums text-emerald-900">
                    {fmtPln0(totals.emp)}
                  </span>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-100 text-emerald-700">
                  <Briefcase className="h-5 w-5" strokeWidth={2} />
                </div>
              </div>
              <span className="mt-4 border-t border-emerald-100 pt-3 text-[11px] text-emerald-800/90">
                Miesięcznie, szacunek
              </span>
            </div>
          </div>

          {showEmptyHint ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-800">
                Brak skonfigurowanych kosztów pracowników
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Żaden profil nie zawiera jeszcze kwot netto / brutto ani kosztu pracodawcy.
                Uzupełnij zakładkę „Koszty pracownika” w profilu użytkownika (Administratorzy
                → wybór osoby → Organizacja i koszty).
              </p>
            </div>
          ) : null}

          {/* 2. TABELA SZCZEGÓŁÓW (Dół) */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-6 py-4">Pracownik</th>
                    <th className="px-6 py-4">Stanowisko / Typ</th>
                    <th className="px-6 py-4 text-right">Netto (Mies.)</th>
                    <th className="px-6 py-4 text-right">Brutto (Mies.)</th>
                    <th className="px-6 py-4 text-right">Koszt Godzinowy</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Koszt Pracodawcy</th>
                    <th className="px-6 py-4 text-center">Akcje</th>
                  </tr>
                </thead>
                
                <tbody className="divide-y divide-slate-100 bg-white">
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-600">
                        Brak pracowników do wyświetlenia.
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((r) => {
                      const isActive = statusLabel(r) === "Aktywny";
                      
                      return (
                        <tr key={r.user_id} className="group transition-colors hover:bg-slate-50/60">
                          {/* Pracownik */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                {getInitials(r.full_name, r.login)}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900">
                                  {r.full_name || r.login}
                                </span>
                                <span className="text-xs text-slate-500">{r.login}</span>
                              </div>
                            </div>
                          </td>
                          
                          {/* Stanowisko */}
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">
                                {r.workstation || "—"}
                              </span>
                              <span className="text-xs text-slate-500">
                                {rowEmploymentType(r)}
                              </span>
                            </div>
                          </td>
                          
                          {/* Finanse (Wyrównane do prawej dla czytelności) */}
                          <td className="px-6 py-4 text-right tabular-nums text-slate-700">
                            {fmtPln0(r.net_monthly_pln ?? undefined)}
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums text-slate-700">
                            {fmtPln0(r.gross_monthly_pln ?? undefined)}
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums text-slate-700">
                            {fmtPln2(r.employer_hourly_pln ?? undefined)}
                          </td>
                          
                          {/* Status */}
                          <td className="px-6 py-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  isActive ? "bg-emerald-500" : "bg-slate-400"
                                }`}
                              ></span>
                              {statusLabel(r)}
                            </span>
                          </td>
                          
                          {/* Koszt Pracodawcy */}
                          <td className="px-6 py-4 text-right font-bold tabular-nums text-slate-900">
                            {fmtPln0(r.employer_total_monthly_pln ?? undefined)}
                          </td>
                          
                          {/* Akcje - zamiana tekstowego linku na przycisk z ikoną */}
                          <td className="px-6 py-4 text-center">
                            <Link
                              to={`/settings/administrators/${r.user_id}?tab=workforce`}
                              title="Przejdź do profilu"
                              className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200"
                            >
                              <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* 3. ZINTEGROWANE PODSUMOWANIE W STOPCE */}
                {data.rows.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50/80">
                    <tr>
                      <td colSpan={6} className="px-6 py-5 text-right text-sm font-semibold uppercase tracking-wider text-slate-500">
                        Szacowany miesięczny koszt łączny:
                      </td>
                      <td className="px-6 py-5 text-right text-lg font-bold tabular-nums text-emerald-700">
                        {fmtPln0(totals.emp)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            
            <div className="border-t border-slate-100 bg-white px-6 py-4">
              <p className="text-xs leading-relaxed text-slate-500">
                {data.disclaimer_pl || OPERATIONAL_COST_DISCLAIMER_PL}
              </p>
            </div>
          </div>
        </>
      ) : !loading && !err ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600 shadow-sm">
          Brak danych do wyświetlenia.
        </div>
      ) : null}
    </div>
  );
}