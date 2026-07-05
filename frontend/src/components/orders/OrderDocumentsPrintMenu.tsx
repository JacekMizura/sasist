import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Loader2, Printer } from "lucide-react";
import toast from "react-hot-toast";

import type { DocumentPrintRequest } from "@/utils/documentTemplatePrint";
import { saleKindFromSubtype, stockKindFromType } from "@/utils/documentTemplatePrint";

export type OrderLinkedDocument = {
  id: string | number;
  kind?: string | null;
  document_type?: string | null;
  document_subtype?: string | null;
  document_number?: string | null;
  sale_document_id?: string | null;
  stock_document_id?: number | null;
};

type Props = {
  orderId: number;
  linkedDocuments?: OrderLinkedDocument[] | null;
  panelDocumentType?: string | null;
  salesDocumentNumber?: string | null;
  disabled?: boolean;
  compact?: boolean;
  onPrint: (req: DocumentPrintRequest) => void;
  busy?: boolean;
};

type MenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export function OrderDocumentsPrintMenu({
  orderId,
  linkedDocuments,
  panelDocumentType,
  salesDocumentNumber,
  disabled,
  compact,
  onPrint,
  busy,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const linked = linkedDocuments ?? [];
  const wzDocs = linked.filter((d) => d.kind === "warehouse" || d.document_type === "WZ");
  const saleDocs = linked.filter((d) => d.kind === "sale" || d.sale_document_id || d.document_subtype);
  const invoiceDoc = saleDocs.find(
    (d) => d.document_subtype === "INVOICE" || d.document_type === "FV" || panelDocumentType === "INVOICE",
  );
  const receiptDoc = saleDocs.find((d) => d.document_subtype === "RECEIPT" || d.document_type === "PA");

  const items: MenuItem[] = [
    {
      id: "confirmation",
      label: "Potwierdzenie zamówienia",
      onClick: () => onPrint({ kind: "order_confirmation", orderId }),
    },
    {
      id: "picking",
      label: "Lista kompletacyjna",
      onClick: () => onPrint({ kind: "picking_list", orderId }),
    },
    ...wzDocs.map((doc, idx) => {
      const stockId = doc.stock_document_id ?? Number(doc.id);
      const label = wzDocs.length > 1 ? `WZ ${doc.document_number ?? idx + 1}` : "WZ";
      return {
        id: `wz-${stockId}`,
        label,
        disabled: !Number.isFinite(stockId),
        onClick: () =>
          onPrint({
            kind: "stock_document",
            documentId: stockId,
            kindCode: stockKindFromType(doc.document_type),
          }),
      };
    }),
    ...(wzDocs.length === 0
      ? [
          {
            id: "wz-missing",
            label: "WZ",
            disabled: true,
            onClick: () => toast.error("Brak dokumentu WZ dla tego zamówienia."),
          },
        ]
      : []),
    {
      id: "return",
      label: "Zwrot",
      onClick: () => onPrint({ kind: "return_document", orderId }),
    },
  ];

  if (invoiceDoc?.sale_document_id || (panelDocumentType === "INVOICE" && salesDocumentNumber)) {
    const docId = invoiceDoc?.sale_document_id ?? invoiceDoc?.id;
    items.push({
      id: "invoice",
      label: "Faktura",
      disabled: docId == null,
      onClick: () => {
        if (docId == null) return;
        onPrint({
          kind: "sale_document",
          documentId: String(docId),
          kindCode: saleKindFromSubtype(invoiceDoc?.document_subtype ?? "INVOICE"),
        });
      },
    });
  } else if (receiptDoc?.sale_document_id) {
    items.push({
      id: "receipt",
      label: "Paragon",
      onClick: () =>
        onPrint({
          kind: "sale_document",
          documentId: String(receiptDoc.sale_document_id ?? receiptDoc.id),
          kindCode: saleKindFromSubtype(receiptDoc.document_subtype ?? "RECEIPT"),
        }),
    });
  }

  const triggerClass = compact
    ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    : "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        title="Dokumenty"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : compact ? (
          <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
        ) : (
          <>
            <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dokumenty
            <ChevronDown className="h-4 w-4 opacity-60" aria-hidden />
          </>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[14rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled || busy}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
