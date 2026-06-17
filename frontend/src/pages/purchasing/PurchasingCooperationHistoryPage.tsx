import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { fetchPurchasingCooperationHistory, type PurchasingCooperationHistoryPayload } from "../../api/purchasingCooperationHistoryApi";
import {
  PurchasingAnalysisSection,
  PurchasingContentArea,
  PurchasingFilterBar,
  PurchasingFilterField,
  PurchasingKpiCard,
  PurchasingKpiGrid,
  PurchasingPageHeader,
  PurchasingPageShell,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingSelectClass,
} from "../../modules/purchasing/ui";

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
    <PurchasingContentArea>
      <PurchasingPageShell
        header={
          <PurchasingPageHeader
            title="Historia współpracy"
            subtitle="Podsumowanie zamówień, przyjęć i trendów cenowych wybranego dostawcy."
          />
        }
        status={
          <>
            {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div> : null}
            {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}
          </>
        }
        filters={
          <PurchasingFilterBar>
            <PurchasingFilterField label="Dostawca" className="min-w-[240px] flex-1">
              <select
                className={purchasingSelectClass}
                value={supplierId ?? ""}
                onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </PurchasingFilterField>
          </PurchasingFilterBar>
        }
        kpis={
          summary ? (
            <PurchasingKpiGrid columns={4}>
              <PurchasingKpiCard title="Liczba PO" value={summary.total_orders} tone="blue" />
              <PurchasingKpiCard title="Przyjęcia PZ" value={summary.total_receipts} tone="indigo" />
              <PurchasingKpiCard title="Terminowość %" value={fmtPct(summary.on_time_percent)} tone="emerald" />
              <PurchasingKpiCard
                title="Śr. czas dostawy (dni)"
                value={summary.avg_delivery_time != null ? summary.avg_delivery_time.toFixed(2) : "—"}
                tone="default"
              />
              <PurchasingKpiCard title="Wydatki netto" value={`${fmtMoney(summary.total_net_spend)} zł`} tone="purple" />
            </PurchasingKpiGrid>
          ) : null
        }
        analysis={
          summary ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <PurchasingAnalysisSection title="Oś czasu współpracy">
                <p className="text-xs font-medium text-slate-500">Pierwsze zamówienie</p>
                <p className="mt-1 text-sm text-slate-800">{fmtDate(summary.first_order_date)}</p>
                <p className="mt-3 text-xs font-medium text-slate-500">Ostatnia dostawa</p>
                <p className="mt-1 text-sm text-slate-800">{fmtDate(summary.last_delivery_date)}</p>
              </PurchasingAnalysisSection>
              <PurchasingAnalysisSection title="Trend ceny" subtitle="Wyliczone z historii przyjęć">
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{fmtPct(summary.price_trend)}</p>
              </PurchasingAnalysisSection>
            </div>
          ) : null
        }
        table={
          summary ? (
            <PurchasingTableSection title="Ostatnie dokumenty" indicatorClass="bg-slate-500">
              <table className="min-w-full text-sm">
                <PurchasingTableHeader
                  headers={["Typ", "Dokument", "Data", "Status", "Netto", "Brutto"]}
                  align={["left", "left", "left", "left", "right", "right"]}
                />
                <tbody className="divide-y divide-slate-100">
                  {data?.recent_documents.map((d, idx) => (
                    <tr key={`${d.doc_type}-${d.document_no}-${idx}`} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">{d.doc_type}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{d.document_no}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(d.date)}</td>
                      <td className="px-4 py-3">{d.status || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(d.total_net)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(d.total_gross)}</td>
                    </tr>
                  ))}
                  {!data?.recent_documents?.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        Brak dokumentów.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </PurchasingTableSection>
          ) : null
        }
      />
    </PurchasingContentArea>
  );
}
