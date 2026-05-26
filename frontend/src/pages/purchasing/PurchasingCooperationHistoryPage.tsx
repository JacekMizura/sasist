import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { fetchPurchasingCooperationHistory, type PurchasingCooperationHistoryPayload } from "../../api/purchasingCooperationHistoryApi";

type Supplier = { id: number; name: string };

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL");
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

export default function PurchasingCooperationHistoryPage() {
  const [searchParams] = useSearchParams();
  const tenantId = useMemo(() => {
    const tid = Number(searchParams.get("tenant_id"));
    return Number.isFinite(tid) && tid >= 1 ? tid : 1;
  }, [searchParams]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [data, setData] = useState<PurchasingCooperationHistoryPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<Supplier[]>("/suppliers/", { params: { tenant_id: tenantId, status: "all", page_size: 500 } })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        setSuppliers(rows);
        if (rows.length > 0) setSupplierId((prev) => (prev && rows.some((s) => s.id === prev) ? prev : rows[0].id));
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!supplierId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetchPurchasingCooperationHistory({ tenantId, supplierId, limitDocs: 20 })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setErr("Nie udało się wczytać historii współpracy.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, supplierId]);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Historia współpracy</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium text-slate-600">Dostawca</label>
        <select
          className="mt-1 block w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={supplierId ?? ""}
          onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
        >
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Liczba PO</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{summary.total_orders}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Przyjęcia PZ</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{summary.total_receipts}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Terminowość %</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{fmtPct(summary.on_time_percent)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Śr. czas dostawy (dni)</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{summary.avg_delivery_time != null ? summary.avg_delivery_time.toFixed(2) : "—"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Wydatki netto</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{fmtMoney(summary.total_net_spend)}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm">
              <p className="text-xs font-medium text-slate-500">Pierwsze zamówienie</p>
              <p className="mt-1 text-slate-800">{fmtDate(summary.first_order_date)}</p>
              <p className="mt-3 text-xs font-medium text-slate-500">Ostatnia dostawa</p>
              <p className="mt-1 text-slate-800">{fmtDate(summary.last_delivery_date)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-sm">
              <p className="text-xs font-medium text-slate-500">Trend ceny</p>
              <p className="mt-1 text-slate-800">{fmtPct(summary.price_trend)}</p>
              <p className="mt-3 text-xs text-slate-500">Wyliczone z historii przyjęć</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Typ</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Dokument</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Data</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Netto</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Brutto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recent_documents.map((d, idx) => (
                  <tr key={`${d.doc_type}-${d.document_no}-${idx}`}>
                    <td className="px-3 py-2">{d.doc_type}</td>
                    <td className="px-3 py-2">{d.document_no}</td>
                    <td className="px-3 py-2">{fmtDate(d.date)}</td>
                    <td className="px-3 py-2">{d.status || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.total_net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.total_gross)}</td>
                  </tr>
                ))}
                {!data?.recent_documents?.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      Brak dokumentów.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
