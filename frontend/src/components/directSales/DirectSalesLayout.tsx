import { OperationalStatusPanel } from "../operational/debug/OperationalStatusPanel";
import { DirectSalesUnavailable } from "../operational/fallbacks/DirectSalesUnavailable";
import type { useDirectSalesTerminal } from "../../hooks/directSales/useDirectSalesTerminal";
import { DirectSalesHistoryPanel } from "./history/DirectSalesHistoryPanel";
import { CustomerPanel } from "./CustomerPanel";
import { DocumentPanel } from "./DocumentPanel";
import { PaymentPanel } from "./PaymentPanel";
import { ProductSearchPanel } from "./ProductSearchPanel";
import { ScannerStatusBar } from "./ScannerStatusBar";
import { SessionLinesPanel } from "./SessionLinesPanel";
import { SuspendedSessionsPanel } from "./SuspendedSessionsPanel";
import { CompleteErrorRecovery } from "./traceability/CompleteErrorRecovery";
import { DirectSalesConfirmationScreen } from "./traceability/DirectSalesConfirmationScreen";

type Terminal = ReturnType<typeof useDirectSalesTerminal>;

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
    return <div className="p-4 text-slate-600">Wybierz magazyn, aby rozpocząć sprzedaż bezpośrednią.</div>;
  }

  if (!runtime.featuresLoaded) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Sprawdzanie dostępności modułu…
      </div>
    );
  }

  if (!salesEnabled || sessionState.unavailable) {
    return (
      <div className="flex h-full flex-col gap-2 p-2">
        {status.showDebug ? (
          <OperationalStatusPanel
            features={status.features}
            debugBundle={status.debugBundle}
            backendReachable={runtime.backendReachable}
            sseStatus={status.sseStatus}
            onRefresh={() => void handleRefresh()}
          />
        ) : null}
        <DirectSalesUnavailable reason={unavailableReason ?? "off"} onRefresh={handleRefresh} />
      </div>
    );
  }

  if (sessionState.completionView) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-slate-100">
        <DirectSalesConfirmationScreen
          completion={sessionState.completionView}
          onNewSale={handleNewSession}
          onRefreshCompletion={() =>
            void sessionState.refreshCompletion(sessionState.completionView!.session_id)
          }
        />
        <ScannerStatusBar
          health={runtime.health}
          connected={runtime.connected}
          scannerReady
          warehouseName={warehouse?.name}
        />
      </div>
    );
  }

  const session = sessionState.session;
  const hasLines = (session?.lines.length ?? 0) > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-100">
      {status.showDebug ? (
        <div className="shrink-0 px-2 pt-2">
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
        <div className="shrink-0 p-3">
          <CompleteErrorRecovery
            error={sessionState.completeError}
            onRetry={() => void handleComplete()}
            onNewSale={handleNewSession}
          />
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row">
        <div className="flex shrink-0 flex-col gap-2 lg:w-72">
          <ProductSearchPanel
            session={session}
            search={productSearch}
            busy={sessionState.busy}
            onAddProduct={(id, loc) => void sessionState.addByProductId(id, loc)}
            onScanCode={(code) => void sessionState.addByCode(code)}
            onSuspend={() => void sessionState.suspend()}
            onNewSession={handleNewSession}
          />
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
        <SessionLinesPanel
          session={session}
          warehouseId={warehouseId}
          busy={sessionState.busy}
          highlight={issueFlash}
          error={sessionState.error}
          onQtyChange={(id, qty) => void sessionState.changeLineQty(id, qty)}
          onLocationChange={(id, loc) => void sessionState.changeLineLocation(id, loc)}
          onRemove={(id) => void sessionState.removeLine(id)}
        />
        <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-72">
          <CustomerPanel
            customer={customer}
            customerId={session?.customer_id ?? null}
            documentSubtype={sessionState.documentSubtype}
            disabled={sessionState.busy}
          />
          <DocumentPanel
            value={sessionState.documentSubtype}
            onChange={sessionState.setDocumentSubtype}
            disabled={sessionState.busy}
          />
          <PaymentPanel
            total={sessionState.total}
            busy={sessionState.busy}
            hasSession={session != null}
            hasLines={hasLines}
            session={session}
            paymentMethod={sessionState.paymentMethod}
            onPaymentMethodChange={sessionState.setPaymentMethod}
            onComplete={() => void handleComplete()}
          />
        </aside>
      </div>
      <ScannerStatusBar
        health={runtime.health}
        connected={runtime.connected}
        scannerReady={!sessionState.busy}
        warehouseName={warehouse?.name}
      />
    </div>
  );
}
