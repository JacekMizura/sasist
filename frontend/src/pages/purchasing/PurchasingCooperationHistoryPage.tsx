import { useEffect, useMemo, useState } from "react";
import { Banknote, Clock, PackageCheck, ShoppingCart, TrendingUp, Truck } from "lucide-react";
import { useLocation, useSearchParams } from "react-router-dom";
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
  const location = useLocation();
  const isSuppliersModule = location.pathname.startsWith("/suppliers");
  const [searchParams] = useSearchParams();
  const tenantId = useMemo(() => {
    const tid = Number(searchParams.get("tenant_id"));
    return Number.isFinite(tid) && tid >= 1 ? tid : 1;
  }, [searchParams]);
  const initialSupplierId = useMemo(() => {
    const sid = Number(searchParams.get("supplier_id"));
    return Number.isFinite(sid) && sid >= 1 ? sid : null;
  }, [searchParams]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(initialSupplierId);
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
        setSupplierId((prev) => {
          if (prev && rows.some((s) => s.id === prev)) return prev;
          if (initialSupplierId && rows.some((s) => s.id === initialSupplierId)) return initialSupplierId;
          return rows.length > 0 ? rows[0].id : null;
        });
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, initialSupplierId]);

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
  const td = "px-4 py-3 text-sm text-slate-800 sm:px-6 sm:py-4";

  const pageShell = (
    <PurchasingPageShell
      header={
        isSuppliersModule ? null : (
          <PurchasingPageHeader
            title="Historia współpracy"
            subtitle="Podsumowanie zamówień, przyjęć i trendów cenowych wybranego dostawcy."
          />
        )
      }
        status={
          err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
          ) : loading ? (
            <p className="text-sm text-slate-500">Ładowanie danych…</p>
          ) : null
        }
        kpis={
          <PurchasingKpiGrid columns={5}>
            <PurchasingKpiCard
              title="Liczba PO"
              value={summary?.total_orders ?? "—"}
              subtitle="Zamówienia zakupowe w okresie"
              tone="blue"
              icon={<ShoppingCart aria-hidden />}
            />
            <PurchasingKpiCard
              title="Przyjęcia PZ"
              value={summary?.total_receipts ?? "—"}
              subtitle="Przyjęte dokumenty magazynowe"
              tone="indigo"
              icon={<PackageCheck aria-hidden />}
            />
            <PurchasingKpiCard
              title="Terminowość"
              value={summary ? fmtPct(summary.on_time_percent) : "—"}
              subtitle="Dostawy w terminie"
              tone="emerald"
              icon={<Truck aria-hidden />}
            />
            <PurchasingKpiCard
              title="Śr. czas dostawy"
              value={summary?.avg_delivery_time != null ? `${summary.avg_delivery_time.toFixed(2)} dni` : "—"}
              subtitle="Od zamówienia do przyjęcia"
              tone="default"
              icon={<Clock aria-hidden />}
            />
            <PurchasingKpiCard
              title="Wydatki netto"
              value={summary ? `${fmtMoney(summary.total_net_spend)} zł` : "—"}
              subtitle="Suma wartości netto dokumentów"
              tone="purple"
              icon={<Banknote aria-hidden />}
            />
          </PurchasingKpiGrid>
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
        analysis={
          summary ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <PurchasingAnalysisSection title="Oś czasu współpracy">
                <p className="text-xs font-medium text-slate-500">Pierwsze zamówienie</p>
                <p className="mt-1 text-sm text-slate-800">{fmtDate(summary.first_order_date)}</p>
                <p className="mt-3 text-xs font-medium text-slate-500">Ostatnia dostawa</p>
                <p className="mt-1 text-sm text-slate-800">{fmtDate(summary.last_delivery_date)}</p>
              </PurchasingAnalysisSection>
              <PurchasingAnalysisSection title="Trend ceny" subtitle="Wyliczone z historii przyjęć">
                <div className="flex items-end gap-2">
                  <p className="text-4xl font-bold tracking-tight tabular-nums text-slate-800">{fmtPct(summary.price_trend)}</p>
                  <TrendingUp className="mb-2 h-5 w-5 text-slate-400" aria-hidden />
                </div>
              </PurchasingAnalysisSection>
            </div>
          ) : null
        }
        table={
          <PurchasingTableSection
            title="Ostatnie dokumenty"
            subtitle="Ostatnie PO i PZ wybranego dostawcy"
            indicatorClass="bg-slate-500"
          >
            <table className="w-full min-w-full text-sm">
              <PurchasingTableHeader>
                <tr>
                  <th className="px-6 py-4 text-left">Typ</th>
                  <th className="px-6 py-4 text-left">Dokument</th>
                  <th className="px-6 py-4 text-left">Data</th>
                  <th className="px-6 py-4 text-left">Status</th>
                  <th className="px-6 py-4 text-right">Netto</th>
                  <th className="px-6 py-4 text-right">Brutto</th>
                </tr>
              </PurchasingTableHeader>
              <tbody className="divide-y divide-slate-100">
                {data?.recent_documents.map((d, idx) => (
                  <tr key={`${d.doc_type}-${d.document_no}-${idx}`} className="transition-colors hover:bg-blue-50/30">
                    <td className={td}>{d.doc_type}</td>
                    <td className={`${td} font-medium text-slate-800`}>{d.document_no}</td>
                    <td className={`${td} text-slate-600`}>{fmtDate(d.date)}</td>
                    <td className={td}>{d.status || "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(d.total_net)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(d.total_gross)}</td>
                  </tr>
                ))}
                {!loading && !data?.recent_documents?.length ? (
                  <tr>
                    <td colSpan={6} className={`${td} text-center text-slate-500`}>
                      Brak dokumentów.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </PurchasingTableSection>
        }
    />
  );

  if (isSuppliersModule) {
    return pageShell;
  }

  return <PurchasingContentArea>{pageShell}</PurchasingContentArea>;
}
