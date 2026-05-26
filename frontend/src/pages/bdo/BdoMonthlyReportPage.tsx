import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { fetchBdoMonthlyReport, type BdoMonthlyReport } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";

type Tenant = { id: number; name: string };

export default function BdoMonthlyReportPage() {
  const { selectedWarehouseId } = useWarehouse();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rep, setRep] = useState<BdoMonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        const tid = searchParams.get("tenant_id");
        if (tid != null && tid !== "") {
          const n = Number(tid);
          if (Number.isFinite(n) && n >= 1) setTenantId(n);
        }
      })
      .catch(() => setTenants([]));
  }, [searchParams]);

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

  const doPrint = () => {
    window.print();
  };

  const fmtKg = (n: number) =>
    n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

  return (
    <div className="space-y-6">

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <select
          value={tenantId}
          onChange={(e) => {
            const v = Number(e.target.value);
            setTenantId(v);
            setSearchParams({ tenant_id: String(v) }, { replace: true });
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div>
          <label className="text-xs font-semibold text-slate-500">Rok</label>
          <input
            type="number"
            className="mt-1 block w-28 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">Miesiąc</label>
          <select
            className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Przelicz
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-slate-500">Obliczenia…</p> : null}

      {rep ? (
        <div className="space-y-6">
          {rep.methodology_note ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold">Metodyka (z ustawień): </span>
              {rep.methodology_note}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Tworzywo</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{rep.totals_plastic_kg.toLocaleString("pl-PL")} kg</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Papier / tektura</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{rep.totals_paper_kg.toLocaleString("pl-PL")} kg</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Drewno</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{rep.totals_wood_kg.toLocaleString("pl-PL")} kg</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Szkło</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{rep.totals_glass_kg.toLocaleString("pl-PL")} kg</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">Metal</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{rep.totals_metal_kg.toLocaleString("pl-PL")} kg</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() => void download("csv")}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Eksport CSV
            </button>
            <button
              type="button"
              onClick={() => void download("xlsx")}
              className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Eksport XLSX
            </button>
            <button
              type="button"
              onClick={doPrint}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Drukuj
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">Materiał</th>
                  <th className="px-3 py-3 text-right">Zużyte j.</th>
                  <th className="px-3 py-3 text-right">Tworzywo kg</th>
                  <th className="px-3 py-3 text-right">Papier kg</th>
                  <th className="px-3 py-3 text-right">Drewno kg</th>
                  <th className="px-3 py-3 text-right">Szkło kg</th>
                  <th className="px-3 py-3 text-right">Metal kg</th>
                </tr>
              </thead>
              <tbody>
                {rep.rows.map((r) => (
                  <tr key={r.wm_ref} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.material_name}</div>
                      <div className="text-xs text-slate-500">SKU: {r.sku ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.used_qty == null ? "Brak danych" : r.used_qty.toLocaleString("pl-PL", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKg(r.plastic_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKg(r.paper_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKg(r.wood_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKg(r.glass_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtKg(r.metal_kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm print:hidden">
            <summary className="cursor-pointer font-semibold text-slate-800">Szczegóły obliczeń (przejrzystość)</summary>
            <p className="mt-2 text-slate-600">
              Dla każdego materiału: stan początkowy = ostatni spis przed pierwszym dniem miesiąca (lub stan z księgi na
              dzień przed miesiącem, jeśli brak spisu). Stan końcowy = ostatni spis z datą do końca wybranego miesiąca.
              Zużycie = początek + zakupy w miesiącu + korekty w miesiącu − koniec. Masy kg = zużycie × kg na jednostkę z
              karty materiału.
            </p>
          </details>
        </div>
      ) : null}
    </div>
  );
}
