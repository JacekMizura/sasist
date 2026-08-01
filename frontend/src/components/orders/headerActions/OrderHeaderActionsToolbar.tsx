import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
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
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import type { DetailTabId } from "../orderDetailTabs";
import type { OrderDetail } from "../orderDetailPageTypes";
import { OrderHeaderActionIconButton } from "./OrderHeaderActionIconButton";
import { OrderHeaderPopoverFrame } from "./OrderHeaderPopoverFrame";
import { OrderCopyMenuPanel, type OrderCopyMenuChoice } from "./panels/OrderCopyMenuPanel";
import { OrderCopyOrderModal } from "./panels/OrderCopyOrderModal";
import { OrderDocumentsQuickPanel } from "./panels/OrderDocumentsQuickPanel";
import { OrderLinkOrdersModal } from "./panels/OrderLinkOrdersModal";
import { OrderLinkOrdersPanel } from "./panels/OrderLinkOrdersPanel";
import { OrderMessagesPreviewPanel } from "./panels/OrderMessagesPreviewPanel";
import { OrderPrintTemplatesPanel } from "./panels/OrderPrintTemplatesPanel";
import { OrderReturnsComplaintsPanel } from "./panels/OrderReturnsComplaintsPanel";
import {
  readLinkedOrders,
  unlinkOrderLocally,
  type OrderHeaderLinkedOrder,
} from "./orderHeaderLinkStore";
import { useOrderHeaderCases } from "./useOrderHeaderCases";

export type OrderHeaderActionsToolbarProps = {
  order: OrderDetail;
  warehouseId: number | null;
  printBusy?: boolean;
  onPrint: (req: DocumentPrintRequest) => void;
  onOpenComplaintWizard: () => void;
  onSetActiveTab: (tab: DetailTabId) => void;
};

type PanelId = "cases" | "messages" | "docs" | "link" | "copy" | "print" | null;

/**
 * Order header actions — Sellasist UX: most icons open anchored popovers;
 * modals only when data entry is required.
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
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [copyMode, setCopyMode] = useState<OrderCopyMenuChoice | null>(null);
  const [linked, setLinked] = useState<OrderHeaderLinkedOrder[]>(() => readLinkedOrders(order.id));

  const casesRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const docsRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const cases = useOrderHeaderCases(order.id, order.number ?? null, warehouseId);

  const closePanels = useCallback(() => setPanel(null), []);

  const togglePanel = (id: PanelId) => {
    setPanel((prev) => (prev === id ? null : id));
  };

  useEffect(() => {
    setLinked(readLinkedOrders(order.id));
  }, [order.id]);

  useEffect(() => {
    if (panel === "link") setLinked(readLinkedOrders(order.id));
  }, [panel, order.id]);

  const messagesBadge = order.has_customer_comment ? 1 : null;
  const customerName =
    (order.customer?.display_name || "").trim() ||
    [order.first_name, order.last_name].filter(Boolean).join(" ").trim() ||
    null;

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

  const goToDocs = (hint?: string) => {
    closePanels();
    onSetActiveTab("docs");
    if (hint) toast(hint, { duration: 2800 });
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5" role="toolbar" aria-label="Akcje zamówienia">
        <div className="relative" ref={casesRef}>
          <OrderHeaderActionIconButton
            label="Reklamacje i zwroty"
            active={panel === "cases"}
            badgeCount={cases.activeCount}
            aria-expanded={panel === "cases"}
            aria-haspopup="menu"
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
            title="Reklamacje i zwroty"
          >
            <OrderReturnsComplaintsPanel
              loading={cases.loading}
              error={cases.error}
              returns={cases.returns}
              complaints={cases.complaints}
              onClose={closePanels}
              onAddReturn={() => navigate(`/wms/returns/create/${order.id}`)}
              onAddComplaint={onOpenComplaintWizard}
              onOpenReturnForm={() =>
                navigate(WMS_ROUTES.returns, { state: { preselectOrderId: order.id } })
              }
            />
          </OrderHeaderPopoverFrame>
        </div>

        <div className="relative" ref={messagesRef}>
          <OrderHeaderActionIconButton
            label="Wiadomości"
            active={panel === "messages"}
            badgeCount={messagesBadge}
            aria-expanded={panel === "messages"}
            aria-haspopup="menu"
            onClick={() => togglePanel("messages")}
          >
            <Mail className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "messages"}
            onClose={closePanels}
            rootRef={messagesRef}
            title="Wiadomości"
            wide
          >
            <OrderMessagesPreviewPanel
              orderId={order.id}
              customerName={customerName}
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
            aria-expanded={panel === "docs"}
            aria-haspopup="menu"
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
              onGoToDocuments={() => goToDocs()}
              onIssueSaleDocument={() =>
                goToDocs("Przejdź do zakładki Dokumenty, aby wystawić dokument sprzedażowy.")
              }
              onIssueStockDocument={() =>
                goToDocs("Przejdź do zakładki Dokumenty, aby wystawić dokument magazynowy.")
              }
              onPrintLinked={printLinkedDoc}
            />
          </OrderHeaderPopoverFrame>
        </div>

        <div className="relative" ref={linkRef}>
          <OrderHeaderActionIconButton
            label="Połącz zamówienia"
            active={panel === "link"}
            badgeCount={linked.length || null}
            aria-expanded={panel === "link"}
            aria-haspopup="menu"
            onClick={() => {
              setLinked(readLinkedOrders(order.id));
              togglePanel("link");
            }}
          >
            <Link2 className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "link"}
            onClose={closePanels}
            rootRef={linkRef}
            title="Połącz zamówienia"
          >
            <OrderLinkOrdersPanel
              linked={linked}
              onClose={closePanels}
              onUnlink={(targetId) => {
                const next = unlinkOrderLocally(order.id, targetId);
                setLinked(next);
                toast.success("Rozłączono zamówienie.");
              }}
              onLinkNew={() => setLinkModalOpen(true)}
            />
          </OrderHeaderPopoverFrame>
        </div>

        <div className="relative" ref={copyRef}>
          <OrderHeaderActionIconButton
            label="Skopiuj"
            active={panel === "copy"}
            aria-expanded={panel === "copy"}
            aria-haspopup="menu"
            onClick={() => togglePanel("copy")}
          >
            <Copy className="h-full w-full" strokeWidth={2} />
          </OrderHeaderActionIconButton>
          <OrderHeaderPopoverFrame
            open={panel === "copy"}
            onClose={closePanels}
            rootRef={copyRef}
            title="Skopiuj"
            wide
          >
            <OrderCopyMenuPanel
              onChoose={(choice) => {
                closePanels();
                setCopyMode(choice);
              }}
            />
          </OrderHeaderPopoverFrame>
        </div>

        <div className="relative" ref={printRef}>
          <OrderHeaderActionIconButton
            label="Drukowanie"
            active={panel === "print"}
            aria-expanded={panel === "print"}
            aria-haspopup="menu"
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
            <OrderPrintTemplatesPanel
              order={order}
              busy={printBusy}
              onPrint={onPrint}
              onClose={closePanels}
            />
          </OrderHeaderPopoverFrame>
        </div>
      </div>

      <OrderLinkOrdersModal
        open={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false);
          setLinked(readLinkedOrders(order.id));
        }}
        orderId={order.id}
        warehouseId={warehouseId}
      />
      <OrderCopyOrderModal
        open={copyMode != null}
        mode={copyMode}
        onClose={() => setCopyMode(null)}
        orderId={order.id}
        orderNumber={order.number ?? null}
      />
    </>
  );
}
