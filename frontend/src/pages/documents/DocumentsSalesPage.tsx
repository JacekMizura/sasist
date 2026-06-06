import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Download, FileText, Plus, Upload } from "lucide-react";

import { listSaleDocuments } from "../../api/saleDocumentsApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import { paymentMethodPl } from "../../components/directSales/directSalesTerminology";
import { DocumentTypeBadge, ExternalStatusBadge, PaymentStatusBadge } from "./documentsBadges";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import {
  DocumentsFiltersToolbar,
  DocumentsKpiRow,
  DocumentsTableCard,
  documentsFilterInputCls,
  documentsTableSelectCls,
  documentsTableTheadCls,
} from "./documentsDashboardPrimitives";

type SalesRow = {
  id: string;
  documentNumber: string;
  orderNumber: string;
  client: string;
  series: string;
  docType: string;
  date: string;
  net: string;
  gross: string;
  paymentMethod: string;
  paid: boolean | null;
  externalStatus: BusinessDocStatus;
  detailPath: string;
};

const btnPrimary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700";
const btnSecondary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50";

export default function DocumentsSalesPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { selectedWarehouseId } = useWarehouse();
  const isReceipts = pathname.endsWith("/receipts");
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listSaleDocuments({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId: selectedWarehouseId ?? undefined,
      panelDocumentType: isReceipts ? "PARAGON" : "INVOICE",
    })
      .then((items) => {
        if (cancelled) return;
        setRows(
          items.map((it) => ({
            id: it.id,
            documentNumber: it.document_number,
            orderNumber: it.order_number ?? `#${it.order_id}`,
            client: it.client,
            series: it.series,
            docType: it.doc_type,
            date: it.date ? new Date(it.date).toLocaleString("pl-PL") : "—",
            net: `${Number(it.net).toFixed(2)} zł`,
            gross: `${Number(it.gross).toFixed(2)} zł`,
            paymentMethod: paymentMethodPl(it.payment_method),
            paid: it.paid,
            externalStatus: "NOWE" as BusinessDocStatus,
            detailPath: it.detail_path || `/documents/sales/${it.id}`,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isReceipts, selectedWarehouseId]);

  const empty = useMemo(() => !loading && rows.length === 0, [loading, rows.length]);

  const sectionTitle = isReceipts ? "Paragony" : "Faktury";
  const sectionSubtitle = isReceipts
    ? "Paragony z terminala sprzedaży bezpośredniej i pakowania WMS."
    : "Faktury VAT z terminala sprzedaży bezpośredniej i pakowania WMS.";

  const kpiItems = useMemo(() => {
    const countLabel = isReceipts ? "Liczba paragonów" : "Liczba faktur";
    let unposted = 0;
    let pending = 0;
    let grossNum = 0;
    for (const r of rows) {
      const g = Number(String(r.gross).replace(/\s/g, "").replace(",", "."));
      if (Number.isFinite(g)) grossNum += g;
      if (r.externalStatus === "NOWE") unposted += 1;
      if (r.externalStatus === "W TRAKCIE") pending += 1;
    }
    const grossFmt = new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
      maximumFractionDigits: 2,
    }).format(grossNum);
    return [
      { label: countLabel, value: rows.length },
      { label: "Niezaksięgowane", value: unposted, tone: "amber" as const },
      { label: "Oczekujące", value: pending, tone: "blue" as const },
      { label: "Suma brutto", value: grossFmt, tone: "emerald" as const },
    ];
  }, [rows, isReceipts]);

  return (
    <DocumentsSectionShell
      title={sectionTitle}
      subtitle={sectionSubtitle}
      actions={
        <>
          <button type="button" className={btnPrimary}>
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Dodaj dokument
          </button>
          <button type="button" className={btnSecondary}>
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Import
          </button>
          <button type="button" className={btnSecondary}>
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Eksport
          </button>
        </>
      }
      kpi={<DocumentsKpiRow items={kpiItems} />}
      toolbar={
        <DocumentsFiltersToolbar>
          <input
            type="search"
            placeholder="Szukaj po numerze, kliencie…"
            className={`${documentsFilterInputCls} w-full min-w-0 sm:max-w-xs sm:flex-1`}
            disabled
            aria-disabled="true"
          />
          <select className={documentsTableSelectCls} disabled aria-disabled="true">
            <option>Status — wszystkie</option>
          </select>
          <select className={documentsTableSelectCls} disabled aria-disabled="true">
            <option>Typ — wszystkie</option>
          </select>
          <input type="date" className={documentsFilterInputCls} disabled aria-disabled="true" />
          <select className={documentsTableSelectCls} disabled aria-disabled="true">
            <option>Magazyn — wszystkie</option>
          </select>
          <select className={documentsTableSelectCls} disabled aria-disabled="true">
            <option>Operator — wszyscy</option>
          </select>
        </DocumentsFiltersToolbar>
      }
    >
      {loading ? (
        <DocumentsTableCard>
          <p className="px-4 py-8 text-center text-sm text-slate-500">Ładowanie dokumentów…</p>
        </DocumentsTableCard>
      ) : empty ? (
        <DocumentsTableCard>
          <DocumentsEmptyState
            icon={FileText}
            title="Nie znaleziono dokumentów"
            description="Dokumenty pojawią się tutaj po pierwszej zaksięgowanej sprzedaży lub imporcie z systemu zewnętrznego. Na razie lista jest pusta."
            action={
              <Link to="/orders/list" className={btnPrimary}>
                Przejdź do zamówień
              </Link>
            }
          />
        </DocumentsTableCard>
      ) : (
        <DocumentsTableCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className={documentsTableTheadCls}>
                <tr>
                  {[
                    "Nr dokumentu",
                    "Nr zamówienia",
                    "Klient",
                    "Seria",
                    "Typ",
                    "Data",
                    "Netto",
                    "Brutto",
                    "Metoda płatności",
                    "Status płatności",
                    "Status zewnętrzny",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:px-5 sm:py-3.5 sm:text-xs"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer border-t border-slate-100 transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/80"
                    onClick={() => navigate(r.detailPath)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(r.detailPath);
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-mono text-sm font-semibold sm:px-5 sm:py-3.5">{r.documentNumber}</td>
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5">{r.orderNumber}</td>
                    <td className="max-w-[12rem] truncate px-4 py-3 sm:px-5 sm:py-3.5" title={r.client}>
                      {r.client}
                    </td>
                    <td className="px-4 py-3 text-slate-600 sm:px-5 sm:py-3.5">{r.series}</td>
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5">
                      <DocumentTypeBadge code={r.docType} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600 sm:px-5 sm:py-3.5">
                      {r.date}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums sm:px-5 sm:py-3.5">{r.net}</td>
                    <td className="px-4 py-3 text-right tabular-nums sm:px-5 sm:py-3.5">{r.gross}</td>
                    <td className="px-4 py-3 text-slate-600 sm:px-5 sm:py-3.5">{r.paymentMethod}</td>
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5">
                      <PaymentStatusBadge paid={r.paid} />
                    </td>
                    <td className="px-4 py-3 sm:px-5 sm:py-3.5">
                      <ExternalStatusBadge status={r.externalStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DocumentsTableCard>
      )}
    </DocumentsSectionShell>
  );
}
