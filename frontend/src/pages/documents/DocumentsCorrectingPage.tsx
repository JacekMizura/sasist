import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileDiff, Plus, Upload } from "lucide-react";

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
import { DocumentTypeBadge, ExternalStatusBadge, PaymentStatusBadge } from "./documentsBadges";
import type { BusinessDocStatus } from "./warehouseDocumentsUi";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { DocumentsKpiRow } from "./documentsDashboardPrimitives";

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
      {empty ? (
        <div className={moduleTableCardClass}>
          <DocumentsEmptyState
            icon={FileDiff}
            title="Brak dokumentów korygujących"
            description="Po wystawieniu korekt w systemie sprzedażowym pojawią się one na tej liście. Na razie nie ma żadnych rekordów do wyświetlenia."
            action={
              <Link to="/orders/list">
                <PrimaryButton type="button" density="compact">
                  Zamówienia
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
                  <tr key={r.id} role="button" tabIndex={0} className={moduleListRowClass}>
                    <td className={`${moduleListTdClass} font-mono font-semibold`}>{r.id}</td>
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
    </DocumentsSectionShell>
  );
}
