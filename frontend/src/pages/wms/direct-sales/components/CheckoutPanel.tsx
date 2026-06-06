import type { DirectSaleCompleteResult, DirectSaleSession } from "../services/directSalesApi";
import type { DocumentSubtype } from "../hooks/useDirectSalesSession";
import type { useDirectSalesCustomer } from "../hooks/useDirectSalesCustomer";
import { CustomerPanel } from "./CustomerPanel";
import { DocumentSelector } from "./DocumentSelector";
import { PaymentPanel } from "./PaymentPanel";
import { SessionSummaryBar } from "./SessionSummaryBar";

type CustomerState = ReturnType<typeof useDirectSalesCustomer>;

type Props = {
  total: number;
  busy: boolean;
  session: DirectSaleSession | null;
  customer: CustomerState;
  paymentMethod: string;
  documentSubtype: DocumentSubtype;
  lastComplete: DirectSaleCompleteResult | null;
  onPaymentMethodChange: (m: string) => void;
  onDocumentSubtypeChange: (d: DocumentSubtype) => void;
  onCheckout: () => void;
  onComplete: () => void;
  onSuspend: () => void;
  onNewSession: () => void;
};

export function CheckoutPanel({
  total,
  busy,
  session,
  customer,
  paymentMethod,
  documentSubtype,
  lastComplete,
  onPaymentMethodChange,
  onDocumentSubtypeChange,
  onCheckout,
  onComplete,
  onSuspend,
  onNewSession,
}: Props) {
  const hasSession = session != null;
  const hasLines = (session?.lines.length ?? 0) > 0;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 md:w-64">
      {lastComplete ? (
        <SessionSummaryBar
          result={lastComplete}
          onPrint={() => window.print()}
          onNewSession={onNewSession}
        />
      ) : null}
      <CustomerPanel customer={customer} customerId={session?.customer_id ?? null} disabled={busy} />
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <DocumentSelector
          value={documentSubtype}
          onChange={onDocumentSubtypeChange}
          disabled={busy}
        />
      </div>
      <PaymentPanel
        total={total}
        busy={busy}
        hasSession={hasSession}
        hasLines={hasLines}
        session={session}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={onPaymentMethodChange}
        onCheckout={onCheckout}
        onComplete={onComplete}
        onSuspend={onSuspend}
      />
    </aside>
  );
}
