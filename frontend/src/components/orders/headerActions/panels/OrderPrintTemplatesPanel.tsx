import { Link } from "react-router-dom";
import { Printer } from "lucide-react";

import type { DocumentPrintRequest } from "../../../../utils/documentTemplatePrint";
import { saleKindFromSubtype, stockKindFromType } from "../../../../utils/documentTemplatePrint";
import type { OrderDetail } from "../../orderDetailPageTypes";
import {
  odHeaderActionFooterLinkClass,
  odHeaderActionSectionTitleClass,
} from "../orderHeaderActionTokens";

type Props = {
  order: OrderDetail;
  busy?: boolean;
  onPrint: (req: DocumentPrintRequest) => void;
};

type PrintRow = {
  id: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
};

export function OrderPrintTemplatesPanel({ order, busy, onPrint }: Props) {
  const linked = order.linked_documents ?? [];
  const wz = linked.find((d) => d.kind === "warehouse" || d.document_type === "WZ");
  const invoice = linked.find(
    (d) => d.document_subtype === "INVOICE" || d.document_type === "FV" || order.panel_document_type === "INVOICE",
  );
  const receipt = linked.find((d) => d.document_subtype === "RECEIPT" || d.document_type === "PA");

  const rows: PrintRow[] = [
    {
      id: "order",
      label: "Zamówienie",
      onClick: () => onPrint({ kind: "order_confirmation", orderId: order.id }),
    },
    {
      id: "picking",
      label: "Picking list",
      onClick: () => onPrint({ kind: "picking_list", orderId: order.id }),
    },
    {
      id: "packing",
      label: "Packing list",
      onClick: () => onPrint({ kind: "picking_list", orderId: order.id }),
    },
    {
      id: "label",
      label: "Etykieta",
      disabled: true,
      onClick: () => undefined,
    },
    {
      id: "invoice",
      label: "Faktura",
      disabled: !(invoice?.sale_document_id || invoice?.id),
      onClick: () => {
        const docId = invoice?.sale_document_id ?? invoice?.id;
        if (docId == null) return;
        onPrint({
          kind: "sale_document",
          documentId: String(docId),
          kindCode: saleKindFromSubtype(invoice?.document_subtype ?? "INVOICE"),
        });
      },
    },
    {
      id: "receipt",
      label: "Paragon",
      disabled: !(receipt?.sale_document_id || receipt?.id),
      onClick: () => {
        const docId = receipt?.sale_document_id ?? receipt?.id;
        if (docId == null) return;
        onPrint({
          kind: "sale_document",
          documentId: String(docId),
          kindCode: saleKindFromSubtype(receipt?.document_subtype ?? "RECEIPT"),
        });
      },
    },
    {
      id: "spec",
      label: "Specyfikacja",
      onClick: () => onPrint({ kind: "order_confirmation", orderId: order.id }),
    },
    {
      id: "stock",
      label: "Dokument magazynowy",
      disabled: !wz,
      onClick: () => {
        if (!wz) return;
        const stockId = wz.stock_document_id ?? Number(wz.id);
        if (!Number.isFinite(stockId)) return;
        onPrint({
          kind: "stock_document",
          documentId: stockId,
          kindCode: stockKindFromType(wz.document_type),
        });
      },
    },
    {
      id: "custom",
      label: "Wydruk własny",
      onClick: () => onPrint({ kind: "order_confirmation", orderId: order.id }),
    },
  ];

  return (
    <div className="space-y-3">
      <p className={odHeaderActionSectionTitleClass}>Dostępne szablony</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              disabled={busy || row.disabled}
              onClick={row.onClick}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-sm font-medium text-slate-800 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>{row.label}</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                <Printer className="h-3 w-3" strokeWidth={2} aria-hidden />
                Drukuj
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 pt-2.5 text-center">
        <Link to="/templates/print" className={odHeaderActionFooterLinkClass}>
          Zarządzaj szablonami wydruków
        </Link>
      </div>
    </div>
  );
}
