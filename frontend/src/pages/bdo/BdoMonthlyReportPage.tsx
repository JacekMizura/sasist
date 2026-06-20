import { useCallback, useEffect, useMemo, useState } from "react";
import { FileBarChart, FileText, Gem, Layers, Printer, TreePine, Wine } from "lucide-react";
import api from "../../api/axios";
import { fetchBdoMonthlyReport, type BdoMonthlyReport } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { AppButton, AppEmptyState } from "../../components/app-shell";
import {
  PurchasingFilterField,
  PurchasingInfoNotice,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingInputClass,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import { BdoFilterBar } from "./components/BdoFilterBar";
import { BdoKpiCard } from "./components/BdoKpiCard";
import { BdoReportKpiGrid } from "./components/BdoReportKpiGrid";
import { useBdoTenant } from "./hooks/useBdoTenant";

export default function BdoMonthlyReportPage() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenants, tenantId, setTenantId } = useBdoTenant();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rep, setRep] = useState<BdoMonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRep(await fetchBdoMonthlyReport(tenantId, year, month, selectedWarehouseId ?? undefined));
    } catch {
      setErr("Nie udało się wygenerować raportu.");
      setRep(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, year, month, selectedWarehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (fmt: "csv" | "xlsx") => {
    const path = fmt === "csv" ? "monthly.csv" : "monthly.xlsx";
    try {
      const params: Record<string, string | number> = { tenant_id: tenantId, year, month };
      if (selectedWarehouseId != null) params.warehouse_id = selectedWarehouseId;
      const res = await api.get(`/warehouse/bdo/reports/${path}`, {
        params,
        responseType: "blob",
      });
      const blob = new Blob([res.data], {
        type: fmt === "csv" ? "text/csv;charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bdo_raport_${year}_${String(month).padStart(2, "0")}.${fmt === "csv" ? "csv" : "xlsx"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Eksport nie powiódł się (sprawdź, czy backend ma openpyxl dla XLSX).");
    }
  };

  const fmtKg = (n: number) =>
    n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  return (
    <div className="space-y-5 pb-8">
      <BdoFilterBar
        tenants={tenants}
        tenantId={tenantId}
        onTenantChange={setTenantId}
        actions={
          <AppButton variant="secondary" onClick={() => void load()}>
            Przelicz
          </AppButton>
        }
      >
        <PurchasingFilterField label="Rok">
          <input
            type="number"
            className={purchasingInputClass}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
          />
        </PurchasingFilterField>
        <PurchasingFilterField label="Miesiąc">
          <select className={purchasingSelectClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </PurchasingFilterField>
      </BdoFilterBar>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Obliczenia…</p> : null}

      {rep ? (
        <>
          {rep.methodology_note ? (
            <PurchasingInfoNotice tone="slate">
              <span className="font-semibold">Metodyka (z ustawień): </span>
              {rep.methodology_note}
            </PurchasingInfoNotice>
          ) : null}

          <BdoReportKpiGrid>
            <BdoKpiCard
              title="Tworzywo"
              value={`${rep.totals_plastic_kg.toLocaleString("pl-PL")} kg`}
              tone="blue"
              icon={<Layers aria-hidden />}
            />
            <BdoKpiCard
              title="Papier / tektura"
              value={`${rep.totals_paper_kg.toLocaleString("pl-PL")} kg`}
              tone="emerald"
              icon={<FileText aria-hidden />}
            />
            <BdoKpiCard
              title="Drewno"
              value={`${rep.totals_wood_kg.toLocaleString("pl-PL")} kg`}
              tone="amber"
              icon={<TreePine aria-hidden />}
            />
            <BdoKpiCard
              title="Szkło"
              value={`${rep.totals_glass_kg.toLocaleString("pl-PL")} kg`}
              tone="indigo"
              icon={<Wine aria-hidden />}
            />
            <BdoKpiCard
              title="Metal"
              value={`${rep.totals_metal_kg.toLocaleString("pl-PL")} kg`}
              tone="default"
              icon={<Gem aria-hidden />}
            />
          </BdoReportKpiGrid>

          <div className="flex flex-wrap gap-2 print:hidden">
            <AppButton variant="primary" onClick={() => void download("csv")}>
              Eksport CSV
            </AppButton>
            <AppButton variant="success" onClick={() => void download("xlsx")}>
              Eksport XLSX
            </AppButton>
            <AppButton variant="secondary" onClick={() => window.print()}>
              <Printer className="mr-1.5 inline h-4 w-4" aria-hidden />
              Drukuj
            </AppButton>
          </div>

          {rep.rows.length === 0 ? (
            <AppEmptyState
              icon={FileBarChart}
              title="Brak danych dla wybranego okresu"
              description="Uzupełnij spisy, zakupy i korekty — raport wymaga danych za wybrany miesiąc."
            />
          ) : (
            <PurchasingTableSection title="Szczegóły zużycia">
              <table className="w-full min-w-[900px] text-sm">
                <PurchasingTableHeader
                  headers={[
                    "Materiał",
                    "Zużyte j.",
                    "Tworzywo kg",
                    "Papier kg",
                    "Drewno kg",
                    "Szkło kg",
                    "Metal kg",
                  ]}
                  align={["left", "right", "right", "right", "right", "right", "right"]}
                />
                <tbody>
                  {rep.rows.map((r) => (
                    <tr key={r.wm_ref} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                      <td className={purchasingTableTdClass}>
                        <div className="font-medium text-slate-900">{r.material_name}</div>
                        <div className="text-xs text-slate-500">SKU: {r.sku ?? "—"}</div>
                      </td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>
                        {r.used_qty == null ? "Brak danych" : r.used_qty.toLocaleString("pl-PL", { maximumFractionDigits: 3 })}
                      </td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{fmtKg(r.plastic_kg)}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{fmtKg(r.paper_kg)}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{fmtKg(r.wood_kg)}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{fmtKg(r.glass_kg)}</td>
                      <td className={`${purchasingTableTdClass} text-right tabular-nums`}>{fmtKg(r.metal_kg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PurchasingTableSection>
          )}

          <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm print:hidden">
            <summary className="cursor-pointer font-semibold text-slate-800">Szczegóły obliczeń (przejrzystość)</summary>
            <p className="mt-2 text-slate-600">
              Dla każdego materiału: stan początkowy = ostatni spis przed pierwszym dniem miesiąca (lub stan z księgi na
              dzień przed miesiącem, jeśli brak spisu). Stan końcowy = ostatni spis z datą do końca wybranego miesiąca.
              Zużycie = początek + zakupy w miesiącu + korekty w miesiącu − koniec. Masy kg = zużycie × kg na jednostkę z
              karty materiału.
            </p>
          </details>
        </>
      ) : null}
    </div>
  );
}
