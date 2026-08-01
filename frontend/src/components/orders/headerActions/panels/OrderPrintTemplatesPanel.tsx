import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  FileText,
  Package,
  Printer,
  Receipt,
  ScrollText,
  Settings2,
  ShoppingBag,
  StickyNote,
  Tags,
} from "lucide-react";

import type { DocumentPrintRequest } from "../../../../utils/documentTemplatePrint";
import { saleKindFromSubtype, stockKindFromType } from "../../../../utils/documentTemplatePrint";
import type { OrderDetail } from "../../orderDetailPageTypes";
import { OrderHeaderMenuItem } from "../OrderHeaderMenuItem";
import {
  odHeaderActionFooterLinkClass,
  odHeaderActionMenuDividerClass,
} from "../orderHeaderActionTokens";

type Props = {
  order: OrderDetail;
  busy?: boolean;
  onPrint: (req: DocumentPrintRequest) => void;
  onClose: () => void;
};

type PrintRow = {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

export function OrderPrintTemplatesPanel({ order, busy, onPrint, onClose }: Props) {
  const linked = order.linked_documents ?? [];
  const wz = linked.find((d) => d.kind === "warehouse" || d.document_type === "WZ");
  const invoice = linked.find(
    (d) => d.document_subtype === "INVOICE" || d.document_type === "FV" || order.panel_document_type === "INVOICE",
  );
  const receipt = linked.find((d) => d.document_subtype === "RECEIPT" || d.document_type === "PA");

  const fire = (fn: () => void) => {
    fn();
    onClose();
  };

  const rows: PrintRow[] = [
    {
      id: "order",
      label: "Potwierdzenie zamówienia",
      icon: <ShoppingBag className="h-full w-full" strokeWidth={2} />,
      onClick: () => fire(() => onPrint({ kind: "order_confirmation", orderId: order.id })),
    },
    {
      id: "picking",
      label: "Picking list",
      icon: <Package className="h-full w-full" strokeWidth={2} />,
      onClick: () => fire(() => onPrint({ kind: "picking_list", orderId: order.id })),
    },
    {
      id: "packing",
      label: "Packing list",
      icon: <ScrollText className="h-full w-full" strokeWidth={2} />,
      onClick: () => fire(() => onPrint({ kind: "picking_list", orderId: order.id })),
    },
    {
      id: "invoice",
      label: "Faktura",
      icon: <FileText className="h-full w-full" strokeWidth={2} />,
      disabled: !(invoice?.sale_document_id || invoice?.id),
      onClick: () =>
        fire(() => {
          const docId = invoice?.sale_document_id ?? invoice?.id;
          if (docId == null) return;
          onPrint({
            kind: "sale_document",
            documentId: String(docId),
            kindCode: saleKindFromSubtype(invoice?.document_subtype ?? "INVOICE"),
          });
        }),
    },
    {
      id: "wz",
      label: "WZ",
      icon: <FileText className="h-full w-full" strokeWidth={2} />,
      disabled: !wz,
      onClick: () =>
        fire(() => {
          if (!wz) return;
          const stockId = wz.stock_document_id ?? Number(wz.id);
          if (!Number.isFinite(stockId)) return;
          onPrint({
            kind: "stock_document",
            documentId: stockId,
            kindCode: stockKindFromType(wz.document_type),
          });
        }),
    },
    {
      id: "receipt",
      label: "Paragon",
      icon: <Receipt className="h-full w-full" strokeWidth={2} />,
      disabled: !(receipt?.sale_document_id || receipt?.id),
      onClick: () =>
        fire(() => {
          const docId = receipt?.sale_document_id ?? receipt?.id;
          if (docId == null) return;
          onPrint({
            kind: "sale_document",
            documentId: String(docId),
            kindCode: saleKindFromSubtype(receipt?.document_subtype ?? "RECEIPT"),
          });
        }),
    },
    {
      id: "label",
      label: "Etykieta",
      icon: <Tags className="h-full w-full" strokeWidth={2} />,
      disabled: true,
      onClick: () => undefined,
    },
    {
      id: "custom",
      label: "Wydruk własny",
      icon: <StickyNote className="h-full w-full" strokeWidth={2} />,
      onClick: () => fire(() => onPrint({ kind: "order_confirmation", orderId: order.id })),
    },
  ];

  return (
    <div>
      {rows.map((row, idx) => (
        <div key={row.id}>
          {idx > 0 ? <div className={odHeaderActionMenuDividerClass} role="separator" /> : null}
          <OrderHeaderMenuItem
            icon={row.icon}
            label={row.label}
            disabled={busy || row.disabled}
            onClick={row.onClick}
            trailing={
              <Printer className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            }
          />
        </div>
      ))}
      <div className={odHeaderActionMenuDividerClass} role="separator" />
      <Link to="/templates/print" onClick={onClose} className={odHeaderActionFooterLinkClass}>
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          Zarządzaj szablonami
        </span>
      </Link>
    </div>
  );
}
