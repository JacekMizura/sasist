import type { OrderDetail } from "../../orderDetailPageTypes";
import {
  odHeaderActionFooterLinkClass,
  odHeaderActionSectionTitleClass,
} from "../orderHeaderActionTokens";

type DocRow = {
  key: string;
  type: string;
  number: string;
  date: string | null;
  status: string;
  previewPath?: string | null;
  fileUrl?: string | null;
  onPrint?: () => void;
};

type Props = {
  order: OrderDetail;
  onGoToDocuments: () => void;
  onPrintLinked?: (doc: NonNullable<OrderDetail["linked_documents"]>[number]) => void;
  onPrintOrderConfirmation?: () => void;
};

const SALE_LABELS: Record<string, string> = {
  INVOICE: "Faktura",
  FV: "Faktura",
  CORRECTION: "Korekta",
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

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pl-PL");
}

function DocSection({ title, rows }: { title: string; rows: DocRow[] }) {
  return (
    <section className="space-y-1.5">
      <p className={odHeaderActionSectionTitleClass}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Brak dokumentów w tej grupie.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.key} className="rounded-lg border border-slate-200 px-2.5 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {row.type}
                    {row.number ? (
                      <span className="ml-1.5 font-medium text-slate-600">{row.number}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {row.date ?? "—"} · {row.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.previewPath ? (
                    <a
                      href={row.previewPath}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Podgląd
                    </a>
                  ) : null}
                  {row.fileUrl ? (
                    <a
                      href={row.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Pobierz PDF
                    </a>
                  ) : null}
                  {row.onPrint ? (
                    <button
                      type="button"
                      onClick={row.onPrint}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Drukuj
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OrderDocumentsQuickPanel({
  order,
  onGoToDocuments,
  onPrintLinked,
  onPrintOrderConfirmation,
}: Props) {
  const linked = order.linked_documents ?? [];
  const uploads = order.order_documents ?? [];

  const saleRows: DocRow[] = [];
  const stockRows: DocRow[] = [];

  for (const d of linked) {
    const subtype = (d.document_subtype || d.document_type || "").toUpperCase();
    const isSale = d.kind === "sale" || Boolean(d.sale_document_id);
    const typeLabel = isSale
      ? SALE_LABELS[subtype] || d.document_type || "Dokument sprzedażowy"
      : STOCK_LABELS[subtype] || d.document_type || "Dokument magazynowy";
    const row: DocRow = {
      key: `linked-${d.id}`,
      type: typeLabel,
      number: d.document_number || "",
      date: null,
      status: "Zatwierdzony",
      previewPath: d.detail_path || null,
      onPrint: onPrintLinked ? () => onPrintLinked(d) : undefined,
    };
    if (isSale) saleRows.push(row);
    else stockRows.push(row);
  }

  for (const d of uploads) {
    const t = (d.document_type || "").toUpperCase();
    const isSale = t === "INVOICE" || t === "PARAGON" || t === "PROFORMA" || t === "CORRECTION";
    const row: DocRow = {
      key: `upload-${d.id}`,
      type: SALE_LABELS[t] || STOCK_LABELS[t] || d.document_type || "Dokument",
      number: d.original_filename || "",
      date: fmtDate(d.created_at),
      status: "Załącznik",
      fileUrl: d.file_url || null,
      previewPath: d.file_url || null,
    };
    if (isSale) saleRows.push(row);
    else stockRows.push(row);
  }

  if (saleRows.length === 0 && onPrintOrderConfirmation) {
    saleRows.push({
      key: "order-confirmation",
      type: "Potwierdzenie zamówienia",
      number: order.number ? String(order.number) : `#${order.id}`,
      date: null,
      status: "Dostępny",
      onPrint: onPrintOrderConfirmation,
    });
  }

  return (
    <div className="space-y-4">
      <DocSection title="Dokumenty sprzedażowe" rows={saleRows} />
      <DocSection title="Dokumenty magazynowe" rows={stockRows} />
      <div className="border-t border-slate-100 pt-2.5 text-center">
        <button type="button" onClick={onGoToDocuments} className={odHeaderActionFooterLinkClass}>
          Przejdź do Dokumentów i plików
        </button>
      </div>
    </div>
  );
}
