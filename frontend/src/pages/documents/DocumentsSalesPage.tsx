import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Download, FileText, Plus, Printer, Upload } from "lucide-react";

import { listSaleDocuments } from "../../api/saleDocumentsApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  ErpBulkPrintModal,
  saleBulkDocumentType,
} from "../../components/documentTemplates/ErpBulkPrintModal";
import {
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { PrimaryButton, SecondaryButton } from "../../design-system";
import { formatMoneyPl } from "../../utils/formatOrderMoney";
import { useWarehouse } from "../../context/WarehouseContext";
import { DocumentTypeBadge, ExternalStatusBadge, PaymentStatusBadge } from "./documentsBadges";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { DocumentsKpiRow } from "./documentsDashboardPrimitives";

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

export default function DocumentsSalesPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { selectedWarehouseId } = useWarehouse();
  const isReceipts = pathname.endsWith("/receipts");
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);

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
            documentNumber: it.numbering_legacy
              ? "Numer legacy (wymaga korekty)"
              : it.document_number,
            orderNumber: it.order_number ?? `#${it.order_id}`,
            client: it.client,
            series: it.series,
            docType: it.doc_type,
            date: it.date ? new Date(it.date).toLocaleString("pl-PL") : "—",
            net: formatMoneyPl(Number(it.total_net ?? it.net)),
            gross: formatMoneyPl(Number(it.total_gross ?? it.gross)),
            paymentMethod: it.payment_label_pl || "—",
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
      actions={
        <>
          <PrimaryButton type="button" density="compact">
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Dodaj dokument
          </PrimaryButton>
          <SecondaryButton type="button" density="compact">
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            Import
          </SecondaryButton>
          <SecondaryButton type="button" density="compact">
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            Eksport
          </SecondaryButton>
          <SecondaryButton
            type="button"
            density="compact"
            disabled={selectedIds.size === 0}
            onClick={() => setBulkPrintOpen(true)}
          >
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
            Drukuj ({selectedIds.size})
          </SecondaryButton>
        </>
      }
      kpi={<DocumentsKpiRow items={kpiItems} />}
      toolbar={
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            placeholder="Szukaj po numerze, kliencie…"
            className={`${listSellasistInputClass} w-full min-w-0 sm:max-w-xs sm:flex-1`}
            disabled
            aria-disabled="true"
          />
          <select className={listSellasistInputClass} disabled aria-disabled="true">
            <option>Status — wszystkie</option>
          </select>
          <select className={listSellasistInputClass} disabled aria-disabled="true">
            <option>Typ — wszystkie</option>
          </select>
          <input type="date" className={listSellasistInputClass} disabled aria-disabled="true" />
          <select className={listSellasistInputClass} disabled aria-disabled="true">
            <option>Magazyn — wszystkie</option>
          </select>
          <select className={listSellasistInputClass} disabled aria-disabled="true">
            <option>Operator — wszyscy</option>
          </select>
        </div>
      }
    >
      {loading ? (
        <div className={moduleTableCardClass}>
          <p className="px-4 py-8 text-center text-sm text-slate-500">Ładowanie dokumentów…</p>
        </div>
      ) : empty ? (
        <div className={moduleTableCardClass}>
          <DocumentsEmptyState
            icon={FileText}
            title="Nie znaleziono dokumentów"
            description="Dokumenty pojawią się tutaj po pierwszej zaksięgowanej sprzedaży lub imporcie z systemu zewnętrznego. Na razie lista jest pusta."
            action={
              <Link to="/orders/list">
                <PrimaryButton type="button" density="compact">
                  Przejdź do zamówień
                </PrimaryButton>
              </Link>
            }
          />
        </div>
      ) : (
        <div className={moduleTableCardClass}>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass} style={{ minWidth: 1100 }}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={`${moduleListThClass} w-12`}>
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          if (rows.every((r) => prev.has(r.id))) return new Set();
                          return new Set(rows.map((r) => r.id));
                        });
                      }}
                      aria-label="Zaznacz wszystkie"
                    />
                  </th>
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
                    <th key={h} className={moduleListThClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className={moduleListRowClass}
                    onClick={() => navigate(r.detailPath)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(r.detailPath);
                      }
                    }}
                  >
                    <td className={moduleListTdClass} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id);
                            else next.add(r.id);
                            return next;
                          })
                        }
                        aria-label={`Zaznacz ${r.documentNumber}`}
                      />
                    </td>
                    <td className={`${moduleListTdClass} font-mono font-semibold`}>{r.documentNumber}</td>
                    <td className={moduleListTdClass}>{r.orderNumber}</td>
                    <td className={`${moduleListTdClass} max-w-[12rem] truncate`} title={r.client}>
                      {r.client}
                    </td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{r.series}</td>
                    <td className={moduleListTdClass}>
                      <DocumentTypeBadge code={r.docType} />
                    </td>
                    <td className={`${moduleListTdClass} whitespace-nowrap tabular-nums text-slate-600`}>
                      {r.date}
                    </td>
                    <td className={`${moduleListTdClass} text-right tabular-nums`}>{r.net}</td>
                    <td className={`${moduleListTdClass} text-right tabular-nums`}>{r.gross}</td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{r.paymentMethod}</td>
                    <td className={moduleListTdClass}>
                      <PaymentStatusBadge paid={r.paid} />
                    </td>
                    <td className={moduleListTdClass}>
                      <ExternalStatusBadge status={r.externalStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ErpBulkPrintModal
        open={bulkPrintOpen}
        onClose={() => setBulkPrintOpen(false)}
        tenantId={DAMAGE_TENANT_ID}
        title="Masowy druk dokumentów sprzedaży"
        ids={Array.from(selectedIds)}
        documentTypes={[saleBulkDocumentType(isReceipts)]}
      />
    </DocumentsSectionShell>
  );
}
