import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  FileText,
  Link2,
  Mail,
  Printer,
  RotateCcw,
} from "lucide-react";

import type { DocumentPrintRequest } from "../../../utils/documentTemplatePrint";
import { saleKindFromSubtype, stockKindFromType } from "../../../utils/documentTemplatePrint";
import type { DetailTabId } from "../orderDetailTabs";
import type { OrderDetail } from "../orderDetailPageTypes";
import { OrderHeaderActionIconButton } from "./OrderHeaderActionIconButton";
import { OrderHeaderPopoverFrame } from "./OrderHeaderPopoverFrame";
import { OrderCopyOrderModal } from "./panels/OrderCopyOrderModal";
import { OrderDocumentsQuickPanel } from "./panels/OrderDocumentsQuickPanel";
import { OrderLinkOrdersModal } from "./panels/OrderLinkOrdersModal";
import { OrderMessagesPreviewPanel } from "./panels/OrderMessagesPreviewPanel";
import { OrderPrintTemplatesPanel } from "./panels/OrderPrintTemplatesPanel";
import { OrderReturnsComplaintsPanel } from "./panels/OrderReturnsComplaintsPanel";
import { useOrderHeaderCases } from "./useOrderHeaderCases";

export type OrderHeaderActionsToolbarProps = {
  order: OrderDetail;
  warehouseId: number | null;
  printBusy?: boolean;
  onPrint: (req: DocumentPrintRequest) => void;
  onOpenComplaintWizard: () => void;
  onSetActiveTab: (tab: DetailTabId) => void;
};

type PanelId = "cases" | "messages" | "docs" | "print" | null;

/**
 * Mockup header action cluster: returns, messages, documents, link, copy, print.
 * Extensible — panels are isolated; copy/link adapters ready for backend APIs.
 */
export function OrderHeaderActionsToolbar({
  order,
  warehouseId,
  printBusy,
  onPrint,
  onOpenComplaintWizard,
  onSetActiveTab,
}: OrderHeaderActionsToolbarProps) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<PanelId>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const casesRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const cases = useOrderHeaderCases(order.id, order.number ?? null, warehouseId);

  const closePanels = useCallback(() => setPanel(null), []);

  const togglePanel = (id: PanelId) => {
    setPanel((prev) => (prev === id ? null : id));
  };

  const messagesBadge = order.has_customer_comment ? 1 : null;

  const printLinkedDoc = (doc: NonNullable<OrderDetail["linked_documents"]>[number]) => {
    if (doc.kind === "sale" || doc.sale_document_id) {
      const docId = doc.sale_document_id ?? doc.id;
      onPrint({
        kind: "sale_document",
        documentId: String(docId),
        kindCode: saleKindFromSubtype(doc.document_subtype ?? doc.document_type),
      });
      return;
    }
    const stockId = doc.stock_document_id ?? Number(doc.id);
    if (!Number.isFinite(stockId)) return;
    onPrint({
      kind: "stock_document",
      documentId: stockId,
      kindCode: stockKindFromType(doc.document_type),
    });
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5" role="toolbar" aria-label="Akcje zamówienia">
        <div className="relative" ref={casesRef}>
          <OrderHeaderActionIconButton
            label="Zwroty i reklamacje"
            active={panel === "cases"}
            badgeCount={cases.activeCount}
            onClick={() => {
              void cases.reload();
              togglePanel("cases");
            }}
          >
            <RotateCcw className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "cases"}
            onClose={closePanels}
            rootRef={casesRef}
            title="Zwroty i reklamacje"
            wide
          >
            <OrderReturnsComplaintsPanel
              loading={cases.loading}
              error={cases.error}
              returns={cases.returns}
              complaints={cases.complaints}
              onAddReturn={() => {
                closePanels();
                navigate(`/wms/returns/create/${order.id}`);
              }}
              onAddComplaint={() => {
                closePanels();
                onOpenComplaintWizard();
              }}
            />
          </OrderHeaderPopoverFrame>
        </div>

        <div className="relative" ref={messagesRef}>
          <OrderHeaderActionIconButton
            label="Wiadomości"
            active={panel === "messages"}
            badgeCount={messagesBadge}
            onClick={() => togglePanel("messages")}
          >
            <Mail className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "messages"}
            onClose={closePanels}
            rootRef={messagesRef}
            title="Wiadomości"
          >
            <OrderMessagesPreviewPanel
              orderId={order.id}
              customerPreview={order.latest_customer_comment_preview}
              hasCustomerComment={order.has_customer_comment}
              onGoToComms={() => {
                closePanels();
                onSetActiveTab("comms");
                window.setTimeout(() => {
                  document.getElementById("order-comms-note")?.focus();
                }, 0);
              }}
            />
          </OrderHeaderPopoverFrame>
        </div>

        <div className="relative" ref={docsRef}>
          <OrderHeaderActionIconButton
            label="Dokumenty"
            active={panel === "docs"}
            onClick={() => togglePanel("docs")}
          >
            <FileText className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "docs"}
            onClose={closePanels}
            rootRef={docsRef}
            title="Dokumenty"
            wide
          >
            <OrderDocumentsQuickPanel
              order={order}
              onGoToDocuments={() => {
                closePanels();
                onSetActiveTab("docs");
              }}
              onPrintLinked={printLinkedDoc}
              onPrintOrderConfirmation={() =>
                onPrint({ kind: "order_confirmation", orderId: order.id })
              }
            />
          </OrderHeaderPopoverFrame>
        </div>

        <OrderHeaderActionIconButton
          label="Połącz zamówienia"
          onClick={() => {
            closePanels();
            setLinkOpen(true);
          }}
        >
          <Link2 className="h-full w-full" strokeWidth={2} />
        </OrderHeaderActionIconButton>

        <OrderHeaderActionIconButton
          label="Kopiuj zamówienie"
          onClick={() => {
            closePanels();
            setCopyOpen(true);
          }}
        >
          <Copy className="h-full w-full" strokeWidth={2} />
        </OrderHeaderActionIconButton>

        <div className="relative" ref={printRef}>
          <OrderHeaderActionIconButton
            label="Drukowanie"
            active={panel === "print"}
            onClick={() => togglePanel("print")}
          >
            <Printer className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "print"}
            onClose={closePanels}
            rootRef={printRef}
            title="Drukowanie"
          >
            <OrderPrintTemplatesPanel order={order} busy={printBusy} onPrint={onPrint} />
          </OrderHeaderPopoverFrame>
        </div>
      </div>

      <OrderLinkOrdersModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        orderId={order.id}
        warehouseId={warehouseId}
      />
      <OrderCopyOrderModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        orderId={order.id}
        orderNumber={order.number ?? null}
      />
    </>
  );
}
