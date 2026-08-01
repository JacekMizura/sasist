import { Download, Eye, FilePlus2, FileText, Printer } from "lucide-react";

import type { OrderDetail } from "../../orderDetailPageTypes";
import {
  odHeaderActionDocActionBtnClass,
  odHeaderActionFooterLinkClass,
  odHeaderActionMenuDividerClass,
  odHeaderActionSectionTitleClass,
} from "../orderHeaderActionTokens";

type LinkedDoc = NonNullable<OrderDetail["linked_documents"]>[number];

type DocRowModel = {
  key: string;
  label: string;
  number?: string;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  onPrint?: () => void;
};

type Props = {
  order: OrderDetail;
  onGoToDocuments: () => void;
  onIssueSaleDocument: () => void;
  onIssueStockDocument: () => void;
  onPrintLinked?: (doc: LinkedDoc) => void;
};

const SALE_LABELS: Record<string, string> = {
  INVOICE: "Faktura",
  FV: "Faktura",
  CORRECTION: "Korekta",
  KOR: "Korekta",
  PROFORMA: "Proforma",
  RECEIPT: "Paragon",
  PA: "Paragon",
  PARAGON: "Paragon",
};

const STOCK_LABELS: Record<string, string> = {
  WZ: "WZ",
  PZ: "PZ",
  PW: "PW",
  RW: "RW",
  MM: "MM",
  RESERVATION: "Rezerwacja",
  REZERWACJA: "Rezerwacja",
};

function DocRow({ row }: { row: DocRowModel }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {row.label}
          {row.number ? <span className="ml-1.5 font-normal text-slate-500">{row.number}</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {row.downloadUrl ? (
          <a
            href={row.downloadUrl}
            target="_blank"
            rel="noreferrer"
            title="Pobierz"
            className={odHeaderActionDocActionBtnClass}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        ) : null}
        {row.previewUrl ? (
          <a
            href={row.previewUrl}
            target="_blank"
            rel="noreferrer"
            title="Podgląd"
            className={odHeaderActionDocActionBtnClass}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        ) : null}
        {row.onPrint ? (
          <button type="button" title="Drukuj" onClick={row.onPrint} className={odHeaderActionDocActionBtnClass}>
            <Printer className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Only issued documents + issue actions — no empty document type slots. */
export function OrderDocumentsQuickPanel({
  order,
  onGoToDocuments,
  onIssueSaleDocument,
  onIssueStockDocument,
  onPrintLinked,
}: Props) {
  const linked = order.linked_documents ?? [];
  const uploads = order.order_documents ?? [];

  const saleRows: DocRowModel[] = [];
  const stockRows: DocRowModel[] = [];

  for (const d of linked) {
    const subtype = (d.document_subtype || d.document_type || "").toUpperCase();
    const isSale = d.kind === "sale" || Boolean(d.sale_document_id);
    const typeLabel = isSale
      ? SALE_LABELS[subtype] || d.document_type || "Dokument sprzedażowy"
      : STOCK_LABELS[subtype] || d.document_type || "Dokument magazynowy";
    const row: DocRowModel = {
      key: `linked-${d.id}`,
      label: typeLabel,
      number: d.document_number || undefined,
      previewUrl: d.detail_path || null,
      downloadUrl: d.detail_path || null,
      onPrint: onPrintLinked ? () => onPrintLinked(d) : undefined,
    };
    if (isSale) saleRows.push(row);
    else stockRows.push(row);
  }

  for (const d of uploads) {
    const t = (d.document_type || "").toUpperCase();
    const isSale = Boolean(SALE_LABELS[t]);
    const row: DocRowModel = {
      key: `upload-${d.id}`,
      label: SALE_LABELS[t] || STOCK_LABELS[t] || d.document_type || "Dokument",
      number: d.original_filename || undefined,
      previewUrl: d.file_url || null,
      downloadUrl: d.file_url || null,
    };
    if (isSale) saleRows.push(row);
    else stockRows.push(row);
  }

  return (
    <div>
      <p className={odHeaderActionSectionTitleClass}>Dokumenty sprzedażowe</p>
      {saleRows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-500">Brak wystawionych dokumentów.</p>
      ) : (
        saleRows.map((row) => <DocRow key={row.key} row={row} />)
      )}

      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <p className={odHeaderActionSectionTitleClass}>Dokumenty magazynowe</p>
      {stockRows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-500">Brak wystawionych dokumentów.</p>
      ) : (
        stockRows.map((row) => <DocRow key={row.key} row={row} />)
      )}

      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <button
        type="button"
        onClick={onIssueSaleDocument}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50"
      >
        <FilePlus2 className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
        Wystaw dokument sprzedażowy
      </button>
      <button
        type="button"
        onClick={onIssueStockDocument}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50"
      >
        <FilePlus2 className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
        Wystaw dokument magazynowy
      </button>
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <button type="button" onClick={onGoToDocuments} className={odHeaderActionFooterLinkClass}>
        Przejdź do Dokumentów
      </button>
    </div>
  );
}
