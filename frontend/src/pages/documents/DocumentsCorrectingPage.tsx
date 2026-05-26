import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileDiff, Plus, Upload } from "lucide-react";

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

type Row = {
  id: string;
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
};

const btnPrimary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700";
const btnSecondary =
  "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50";

export default function DocumentsCorrectingPage() {
  const [rows] = useState<Row[]>([]);
  const empty = useMemo(() => rows.length === 0, [rows.length]);

  const kpiItems = useMemo(() => {
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
      { label: "Liczba korekt", value: rows.length },
      { label: "Niezaksięgowane", value: unposted, tone: "amber" as const },
      { label: "Oczekujące", value: pending, tone: "blue" as const },
      { label: "Suma brutto", value: grossFmt, tone: "emerald" as const },
    ];
  }, [rows]);

  return (
    <DocumentsSectionShell
      title="Dokumenty korygujące"
      subtitle="Korekty do faktur i powiązanych dokumentów sprzedaży — spójny widok z modułem zamówień."
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
      {empty ? (
        <DocumentsTableCard>
          <DocumentsEmptyState
            icon={FileDiff}
            title="Brak dokumentów korygujących"
            description="Po wystawieniu korekt w systemie sprzedażowym pojawią się one na tej liście. Na razie nie ma żadnych rekordów do wyświetlenia."
            action={
              <Link to="/orders/list" className={btnPrimary}>
                Zamówienia
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
                  >
                    <td className="px-4 py-3 font-mono text-sm font-semibold sm:px-5 sm:py-3.5">{r.id}</td>
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
