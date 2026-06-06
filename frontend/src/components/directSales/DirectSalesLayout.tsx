import { OperationalStatusPanel } from "../operational/debug/OperationalStatusPanel";
import { DirectSalesUnavailable } from "../operational/fallbacks/DirectSalesUnavailable";
import type { DirectSalesTerminalState } from "../../hooks/directSales/useDirectSalesTerminal";
import { DirectSalesHistoryPanel } from "./history/DirectSalesHistoryPanel";
import { CustomerPanel } from "./CustomerPanel";
import { DocumentPanel } from "./DocumentPanel";
import { PaymentTerminalPanel } from "./payment/PaymentTerminalPanel";
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

  // Nowoczesny ekran wyboru magazynu (brak szarości)
  if (warehouseId == null) {
    return (
      <div className="flex h-full items-center justify-center bg-white p-6">
        <div className="text-blue-800 bg-blue-50 px-6 py-4 rounded-2xl font-bold border border-blue-100 shadow-sm">
          Wybierz magazyn, aby rozpocząć sprzedaż bezpośrednią.
        </div>
      </div>
    );
  }

  // Nowoczesny ekran ładowania
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
        {status.showDebug ? (
          <div className="border-b border-blue-50 p-4">
            <OperationalStatusPanel
              features={status.features}
              debugBundle={status.debugBundle}
              backendReachable={runtime.backendReachable}
              sseStatus={status.sseStatus}
              onRefresh={() => void handleRefresh()}
            />
          </div>
        ) : null}
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900 selection:bg-blue-100">
      
      {status.showDebug ? (
        <div className="shrink-0 border-b border-blue-50 p-2">
          <OperationalStatusPanel
            features={status.features}
            debugBundle={status.debugBundle}
            backendReachable={runtime.backendReachable}
            sseStatus={status.sseStatus}
            onRefresh={() => void status.refreshDebug()}
          />
        </div>
      ) : null}
      
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
        <div className="flex w-full shrink-0 flex-col lg:w-[24rem] lg:min-w-[24rem] border-b lg:border-b-0 lg:border-r border-blue-50 z-20 overflow-hidden">
          <ProductSearchPanel
            session={session}
            search={productSearch}
            busy={sessionState.busy}
            onAddProduct={(id, loc) => void sessionState.addByProductId(id, loc)}
            onScanCode={(code) => void sessionState.addByCode(code)}
            onSuspend={() => void sessionState.suspend()}
            onNewSession={handleNewSession}
          />
          {/* Przewijana dolna część lewej kolumny */}
          <div className="px-4 lg:px-6 pt-4 flex-1 overflow-y-auto custom-scrollbar">
            <SuspendedSessionsPanel
              rows={suspended.rows}
              loading={suspended.loading}
              busyId={suspended.busyId}
              onRestore={(id) => void handleRestoreSuspended(id)}
              onCancel={(id) => void suspended.cancel(id)}
            />
            <DirectSalesHistoryPanel
              rows={history.rows}
              loading={history.loading}
              todayOnly={history.todayOnly}
              onToggleToday={history.toggleToday}
              onSelect={(id) => void sessionState.showHistoricalCompletion(id)}
            />
          </div>
        </div>

        {/* ŚRODKOWA KOLUMNA: Koszyk */}
        <div className="flex min-h-0 flex-1 flex-col z-10 bg-white relative">
          <SessionLinesPanel
            session={session}
            warehouseId={warehouseId}
            busy={sessionState.busy}
            highlight={issueFlash}
            onQtyChange={(id, qty) => void sessionState.changeLineQty(id, qty)}
            onLocationChange={(id, loc) => void sessionState.changeLineLocation(id, loc)}
            onRemove={(id) => void sessionState.removeLine(id)}
          />
        </div>

        {/* PRAWA KOLUMNA: Klient, Dokument, Płatność */}
        <aside className="flex w-full shrink-0 flex-col lg:w-[26rem] lg:min-w-[26rem] border-t lg:border-t-0 lg:border-l border-blue-50 shadow-[-10px_0_30px_rgb(0,0,0,0.02)] z-0 bg-white">
          <div className="p-4 lg:p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-6">
            <CustomerPanel
              customer={customer}
              customerId={session?.customer_id ?? null}
              documentSubtype={sessionState.documentSubtype}
              disabled={sessionState.busy}
            />
            <DocumentPanel
              value={sessionState.documentSubtype}
              hasCustomer={session?.customer_id != null}
              onChange={sessionState.setDocumentSubtype}
              disabled={sessionState.busy}
            />
          </div>
          {/* Płatność na samym dole (nieprzewijana, zawsze widoczna na dużym ekranie) */}
          <div className="flex-shrink-0">
            <PaymentTerminalPanel
              total={sessionState.total}
              busy={sessionState.busy}
              hasSession={session != null}
              hasLines={hasLines}
              session={session}
              paymentMethod={sessionState.paymentMethod}
              cashReceived={sessionState.cashReceived}
              mixedCashAmount={sessionState.mixedCashAmount}
              mixedCardAmount={sessionState.mixedCardAmount}
              onCashReceivedChange={sessionState.setCashReceived}
              onMixedCashChange={sessionState.setMixedCashAmount}
              onMixedCardChange={sessionState.setMixedCardAmount}
              onPaymentMethodChange={sessionState.setPaymentMethod}
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