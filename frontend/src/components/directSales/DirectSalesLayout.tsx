import { DirectSalesUnavailable } from "../operational/fallbacks/DirectSalesUnavailable";
import { STATIONARY_SALE_TITLE } from "./directSalesTerminology";
import type { DirectSalesTerminalState } from "../../hooks/directSales/useDirectSalesTerminal";
import { DirectSalesHistoryPanel } from "./history/DirectSalesHistoryPanel";
import { CustomerPanel } from "./CustomerPanel";
import { DirectSalesTotalsPanel } from "./DirectSalesTotalsPanel";
import { DocumentPanel } from "./DocumentPanel";
import { FulfillmentModePanel } from "./fulfillment/FulfillmentModePanel";
import { ShippingDetailsPanel } from "./fulfillment/ShippingDetailsPanel";
import { OrderDiscountPanel } from "./OrderDiscountPanel";
import { RetailCustomerBadge } from "./RetailCustomerBadge";
import { PaymentTerminalPanel } from "./payment/PaymentTerminalPanel";
import { DirectSalesSidebarActions } from "./DirectSalesSidebarActions";
import { ProductSearchPanel } from "./ProductSearchPanel";
import { SessionLinesPanel } from "./SessionLinesPanel";
import { SuspendedSessionsPanel } from "./SuspendedSessionsPanel";
import { CompleteErrorModal } from "./overlays/CompleteErrorModal";
import { TerminalStatusBar } from "./terminal/TerminalStatusBar";
import { DirectSalesConfirmationScreen } from "./traceability/DirectSalesConfirmationScreen";

type Terminal = DirectSalesTerminalState;

type Props = {
  terminal: Terminal;
};

export function DirectSalesLayout({ terminal }: Props) {
  const {
    warehouse,
    warehouseId,
    runtime,
    status,
    salesEnabled,
    unavailableReason,
    sessionState,
    productSearch,
    customer,
    suspended,
    history,
    issueFlash,
    handleComplete,
    handleNewSession,
    handleRefresh,
    handleRestoreSuspended,
  } = terminal;

  if (warehouseId == null) {
    return (
      <div className="flex h-full items-center justify-center bg-white p-6">
        <div className="text-blue-800 bg-blue-50 px-6 py-4 rounded-2xl font-bold border border-blue-100 shadow-sm">
          Wybierz magazyn, aby rozpocząć {STATIONARY_SALE_TITLE.toLowerCase()}.
        </div>
      </div>
    );
  }

  if (!runtime.featuresLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-white p-6">
        <div className="text-blue-600 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
          <span className="font-bold tracking-wide">Sprawdzanie dostępności modułu…</span>
        </div>
      </div>
    );
  }

  if (!salesEnabled || sessionState.unavailable) {
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex-1 flex items-center justify-center p-6">
          <DirectSalesUnavailable reason={unavailableReason ?? "off"} onRefresh={handleRefresh} />
        </div>
      </div>
    );
  }

  if (sessionState.completionView) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <DirectSalesConfirmationScreen
          completion={sessionState.completionView}
          onNewSale={handleNewSession}
          onRefreshCompletion={() =>
            void sessionState.refreshCompletion(sessionState.completionView!.session_id)
          }
        />
        <TerminalStatusBar
          health={runtime.health}
          connected={runtime.connected}
          scannerReady
          warehouseName={warehouse?.name}
          sessionStatus="COMPLETED"
        />
      </div>
    );
  }

  const session = sessionState.session;
  const hasLines = (session?.lines.length ?? 0) > 0;
  const fulfillment = session?.fulfillment ?? {
    mode: "PICKUP" as const,
    shipping_address: null,
    customer_address_id: null,
    shipping_method_id: null,
    pickup_point_code: null,
    pickup_point_label: null,
    payment_terms_mode: "IMMEDIATE" as const,
    payment_terms_days: null,
  };
  const showCustomer =
    sessionState.documentSubtype === "INVOICE" ||
    fulfillment.mode === "DELIVERY" ||
    (session?.customer_id != null && !(session.customer_is_retail ?? false));

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900 selection:bg-blue-100">
      
      {sessionState.completeError ? (
        <CompleteErrorModal
          error={sessionState.completeError}
          onRetry={() => void handleComplete()}
          onNewSale={handleNewSession}
          onDismiss={sessionState.dismissCompleteError}
        />
      ) : null}
      
      {/* GŁÓWNY UKŁAD 3-KOLUMNOWY POS */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        
        {/* LEWA KOLUMNA: Wyszukiwarka, Zawieszone, Historia */}
        <div className="flex h-full min-h-0 w-full shrink-0 flex-col lg:w-[24rem] lg:min-w-[24rem] border-b border-blue-50 lg:border-b-0 lg:border-r z-20 overflow-hidden">
          <ProductSearchPanel
            session={session}
            search={productSearch}
            busy={sessionState.busy}
            onAddProduct={(id, loc, offerId) => void sessionState.addByProductId(id, loc, offerId)}
            onScanCode={(code) => void sessionState.addByCode(code)}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 lg:px-6">
            <DirectSalesHistoryPanel
              rows={history.rows}
              loading={history.loading}
              todayOnly={history.todayOnly}
              onToggleToday={history.toggleToday}
              onSelect={(id) => void sessionState.showHistoricalCompletion(id)}
            />
            <SuspendedSessionsPanel
              rows={suspended.rows}
              loading={suspended.loading}
              busyId={suspended.busyId}
              onRestore={(id) => void handleRestoreSuspended(id)}
              onCancel={(id) => void suspended.cancel(id)}
            />
          </div>
          <DirectSalesSidebarActions
            busy={sessionState.busy}
            hasSession={session != null}
            onSuspend={() => void sessionState.suspend()}
            onNewSession={handleNewSession}
          />
        </div>

        {/* ŚRODKOWA KOLUMNA: Koszyk */}
        <div className="flex min-h-0 flex-1 flex-col z-10 bg-white relative">
          <SessionLinesPanel
            session={session}
            warehouseId={warehouseId}
            busy={sessionState.busy}
            removingLineId={sessionState.removingLineId}
            highlight={issueFlash}
            onQtyChange={(id, qty) => void sessionState.changeLineQty(id, qty)}
            onLocationChange={(id, loc) => void sessionState.changeLineLocation(id, loc)}
            onRemove={(id) => void sessionState.removeLine(id)}
            onLineDiscount={(id, type, value) => void sessionState.changeLineDiscount(id, type, value)}
          />
        </div>

        {/* PRAWA KOLUMNA: Klient, Dokument, Płatność */}
        <aside className="flex w-full shrink-0 flex-col lg:w-[26rem] lg:min-w-[26rem] border-t lg:border-t-0 lg:border-l border-blue-50 shadow-[-10px_0_30px_rgb(0,0,0,0.02)] z-0 bg-white">
          {/* Zlikwidowany sztuczny podział! Wszystko jest w jednym równym strumieniu. */}
          <div className="p-4 lg:p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            <DocumentPanel
              value={sessionState.documentSubtype}
              onChange={(v) => void sessionState.changeDocumentSubtype(v)}
              disabled={sessionState.busy}
            />
            {sessionState.documentSubtype === "RECEIPT" && !showCustomer ? (
              <RetailCustomerBadge />
            ) : (
              <CustomerPanel
                customer={customer}
                customerId={session?.customer_id ?? null}
                customerIsRetail={session?.customer_is_retail ?? false}
                sessionId={session?.id ?? null}
                warehouseId={warehouseId ?? 0}
                disabled={sessionState.busy}
                onSessionUpdated={sessionState.applySession}
              />
            )}
            <FulfillmentModePanel
              mode={fulfillment.mode}
              disabled={sessionState.busy || session == null}
              onChange={(mode) => void sessionState.changeFulfillment({ mode })}
            />
            {fulfillment.mode === "DELIVERY" ? (
              <ShippingDetailsPanel
                warehouseId={warehouseId}
                fulfillment={fulfillment}
                customerAddresses={customer.detail?.addresses ?? []}
                customerPhone={customer.detail?.phone}
                customerEmail={customer.detail?.email}
                disabled={sessionState.busy || session == null}
                onPatch={(patch) => void sessionState.changeFulfillment(patch)}
              />
            ) : null}
            <DirectSalesTotalsPanel totals={session?.totals} loading={sessionState.busy} />
            <OrderDiscountPanel
              disabled={sessionState.busy}
              discountType={session?.order_discount_type ?? null}
              discountValue={session?.order_discount_value ?? 0}
              onApply={(type, value) => void sessionState.changeOrderDiscount(type, value)}
            />
            <PaymentTerminalPanel
              total={sessionState.total}
              busy={sessionState.busy}
              hasSession={session != null}
              hasLines={hasLines}
              session={session}
              fulfillment={fulfillment}
              customerPaymentTermsDays={customer.detail?.payment_terms_days ?? null}
              paymentMethod={sessionState.paymentMethod}
              cashReceived={sessionState.cashReceived}
              mixedCashAmount={sessionState.mixedCashAmount}
              mixedCardAmount={sessionState.mixedCardAmount}
              onCashReceivedChange={sessionState.setCashReceived}
              onMixedCashChange={sessionState.setMixedCashAmount}
              onMixedCardChange={sessionState.setMixedCardAmount}
              onPaymentMethodChange={sessionState.setPaymentMethod}
              onPaymentTermsChange={(mode, days) =>
                void sessionState.changeFulfillment({
                  paymentTermsMode: mode,
                  paymentTermsDays: days,
                })
              }
              onComplete={() => void handleComplete()}
            />
          </div>
        </aside>
        
      </div>
      
      <TerminalStatusBar
        health={runtime.health}
        connected={runtime.connected}
        scannerReady={!sessionState.busy}
        warehouseName={warehouse?.name}
        sessionStatus={session?.status ?? null}
      />
      
    </div>
  );
}