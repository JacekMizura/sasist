import { Download, Eye, FilePlus2, FileText, Printer } from "lucide-react";

import type { OrderDetail } from "../../orderDetailPageTypes";
import {
  odHeaderActionDocActionBtnClass,
  odHeaderActionFooterLinkClass,
  odHeaderActionMenuDividerClass,
  odHeaderActionSectionTitleClass,
} from "../orderHeaderActionTokens";

type LinkedDoc = NonNullable<OrderDetail["linked_documents"]>[number];

type DocSlot = {
  key: string;
  label: string;
  number?: string;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  onPrint?: () => void;
  present: boolean;
};

type Props = {
  order: OrderDetail;
  onGoToDocuments: () => void;
  onIssueSaleDocument: () => void;
  onIssueStockDocument: () => void;
  onPrintLinked?: (doc: LinkedDoc) => void;
};

const SALE_SLOTS = [
  { key: "INVOICE", label: "Faktura", match: ["INVOICE", "FV"] },
  { key: "CORRECTION", label: "Korekta", match: ["CORRECTION", "KOR"] },
  { key: "RECEIPT", label: "Paragon", match: ["RECEIPT", "PA", "PARAGON"] },
  { key: "PROFORMA", label: "Proforma", match: ["PROFORMA"] },
] as const;

const STOCK_SLOTS = [
  { key: "WZ", label: "WZ", match: ["WZ"] },
  { key: "PZ", label: "PZ", match: ["PZ"] },
  { key: "RW", label: "RW", match: ["RW"] },
  { key: "PW", label: "PW", match: ["PW"] },
  { key: "MM", label: "MM", match: ["MM"] },
  { key: "RESERVATION", label: "Rezerwacja", match: ["RESERVATION", "REZERWACJA"] },
] as const;

function matchType(raw: string | null | undefined, match: readonly string[]): boolean {
  const t = (raw || "").toUpperCase();
  return match.some((m) => t === m || t.includes(m));
}

function buildSlots(
  order: OrderDetail,
  kind: "sale" | "stock",
  defs: readonly { key: string; label: string; match: readonly string[] }[],
  onPrintLinked?: (doc: LinkedDoc) => void,
): DocSlot[] {
  const linked = order.linked_documents ?? [];
  const uploads = order.order_documents ?? [];

  return defs.map((def) => {
    const linkedHit = linked.find((d) => {
      const isSale = d.kind === "sale" || Boolean(d.sale_document_id);
      if (kind === "sale" ? !isSale : isSale) return false;
      return matchType(d.document_subtype, def.match) || matchType(d.document_type, def.match);
    });
    const uploadHit = uploads.find((d) => matchType(d.document_type, def.match));

    if (linkedHit) {
      return {
        key: def.key,
        label: def.label,
        number: linkedHit.document_number || undefined,
        previewUrl: linkedHit.detail_path || null,
        downloadUrl: linkedHit.detail_path || null,
        onPrint: onPrintLinked ? () => onPrintLinked(linkedHit) : undefined,
        present: true,
      };
    }
    if (uploadHit) {
      return {
        key: def.key,
        label: def.label,
        number: uploadHit.original_filename || undefined,
        previewUrl: uploadHit.file_url || null,
        downloadUrl: uploadHit.file_url || null,
        present: true,
      };
    }
    return { key: def.key, label: def.label, present: false };
  });
}

function DocRow({ slot }: { slot: DocSlot }) {
  const canPreview = Boolean(slot.previewUrl);
  const canDownload = Boolean(slot.downloadUrl);
  const canPrint = Boolean(slot.onPrint);

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <FileText className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${slot.present ? "font-medium text-slate-900" : "text-slate-500"}`}>
          {slot.label}
          {slot.number ? <span className="ml-1.5 font-normal text-slate-500">{slot.number}</span> : null}
        </p>
        {!slot.present ? <p className="text-[11px] text-slate-400">Brak dokumentu</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canDownload ? (
          <a
            href={slot.downloadUrl!}
            target="_blank"
            rel="noreferrer"
            title="Pobierz"
            aria-label={`Pobierz ${slot.label}`}
            className={odHeaderActionDocActionBtnClass}
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        ) : (
          <button type="button" disabled title="Pobierz" className={odHeaderActionDocActionBtnClass}>
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
        {canPreview ? (
          <a
            href={slot.previewUrl!}
            target="_blank"
            rel="noreferrer"
            title="Podgląd"
            aria-label={`Podgląd ${slot.label}`}
            className={odHeaderActionDocActionBtnClass}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        ) : (
          <button type="button" disabled title="Podgląd" className={odHeaderActionDocActionBtnClass}>
            <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          disabled={!canPrint}
          title="Drukuj"
          aria-label={`Drukuj ${slot.label}`}
          onClick={slot.onPrint}
          className={odHeaderActionDocActionBtnClass}
        >
          <Printer className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export function OrderDocumentsQuickPanel({
  order,
  onGoToDocuments,
  onIssueSaleDocument,
  onIssueStockDocument,
  onPrintLinked,
}: Props) {
  const saleSlots = buildSlots(order, "sale", SALE_SLOTS, onPrintLinked);
  const stockSlots = buildSlots(order, "stock", STOCK_SLOTS, onPrintLinked);

  return (
    <div>
      <p className={odHeaderActionSectionTitleClass}>Dokumenty sprzedażowe</p>
      {saleSlots.map((slot) => (
        <DocRow key={slot.key} slot={slot} />
      ))}

      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <p className={odHeaderActionSectionTitleClass}>Dokumenty magazynowe</p>
      {stockSlots.map((slot) => (
        <DocRow key={slot.key} slot={slot} />
      ))}

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
