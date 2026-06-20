import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Calendar,
  FileText,
  History,
  Layers,
  Package,
} from "lucide-react";
import { fetchBdoDashboard, fetchBdoRecent, type BdoAudit, type BdoDashboard } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { AppEmptyState } from "../../components/app-shell";
import {
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import { BdoFilterBar } from "./components/BdoFilterBar";
import { BdoKpiCard } from "./components/BdoKpiCard";
import { BdoKpiGrid } from "./components/BdoKpiGrid";
import { useBdoTenant } from "./hooks/useBdoTenant";

function fmt(n: number, maxFrac = 2): string {
  return n.toLocaleString("pl-PL", { maximumFractionDigits: maxFrac });
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BdoDashboardPage() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenants, tenantId, setTenantId } = useBdoTenant();
  const [dash, setDash] = useState<BdoDashboard | null>(null);
  const [recent, setRecent] = useState<BdoAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [d, r] = await Promise.all([
        fetchBdoDashboard(tenantId, selectedWarehouseId ?? undefined),
        fetchBdoRecent(tenantId, 40),
      ]);
      setDash(d);
      setRecent(r);
    } catch {
      setErr("Nie udało się wczytać pulpitu BDO.");
      setDash(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5 pb-8">
      <BdoFilterBar tenants={tenants} tenantId={tenantId} onTenantChange={setTenantId} />

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {dash && !loading ? (
        <>
          <BdoKpiGrid>
            <BdoKpiCard
              title="Materiały w ewidencji"
              value={dash.materials_tracked}
              subtitle="Pozycje z asortymentu, włączone do BDO"
              tone="indigo"
              icon={<Package aria-hidden />}
            />
            <BdoKpiCard
              title="Szac. tworzywo (stan)"
              value={`${fmt(dash.estimated_plastic_kg, 3)} kg`}
              subtitle={`Księga (szac.): ${fmt(dash.ledger_plastic_kg, 3)} kg`}
              tone="blue"
              icon={<Layers aria-hidden />}
            />
            <BdoKpiCard
              title="Szac. papier / tektura"
              value={`${fmt(dash.estimated_paper_kg, 3)} kg`}
              subtitle={`Księga (szac.): ${fmt(dash.ledger_paper_kg, 3)} kg`}
              tone="emerald"
              icon={<FileText aria-hidden />}
            />
            <BdoKpiCard
              title="Zakupy w bieżącym miesiącu"
              value={fmtMoney(dash.month_purchases_pln)}
              subtitle="Suma wartości (PLN) lub ilość × cena"
              tone="purple"
              icon={<Banknote aria-hidden />}
            />
            <BdoKpiCard
              title="Ostatni raport (spis)"
              value={dash.last_report_month_label ?? "—"}
              subtitle="Ostatni zamknięty okres raportowy"
              tone="default"
              icon={<Calendar aria-hidden />}
            />
            <BdoKpiCard
              title="Alerty: brak spisu"
              value={dash.missing_stock_counts}
              subtitle="Materiały bez spisu ponad 90 dni"
              tone="amber"
              icon={<AlertTriangle aria-hidden />}
            />
          </BdoKpiGrid>

          {recent.length === 0 ? (
            <AppEmptyState
              icon={History}
              title="Brak wpisów"
              description="Ostatnie działania w ewidencji BDO pojawią się tutaj."
            />
          ) : (
            <PurchasingTableSection title="Ostatnie działania">
              <table className="w-full min-w-[520px] text-sm">
                <PurchasingTableHeader headers={["Data", "Czynność", "Szczegóły", "Użytkownik"]} />
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                      <td className={`${purchasingTableTdClass} tabular-nums text-slate-700`}>
                        {a.created_at
                          ? new Date(a.created_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })
                          : "—"}
                      </td>
                      <td className={`${purchasingTableTdClass} font-medium text-slate-900`}>{a.action}</td>
                      <td className={`${purchasingTableTdClass} max-w-md truncate text-slate-600`}>{a.detail ?? "—"}</td>
                      <td className={`${purchasingTableTdClass} text-slate-600`}>{a.user_label ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PurchasingTableSection>
          )}
        </>
      ) : null}
    </div>
  );
}
