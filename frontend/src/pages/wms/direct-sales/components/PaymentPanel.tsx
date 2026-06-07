import { safeDisplay } from "../../../../utils/safeStrings";
import type { DirectSaleSession } from "../services/directSalesApi";

const METHODS = [
  { id: "CASH", label: "Gotówka" },
  { id: "CARD", label: "Karta" },
  { id: "BLIK", label: "BLIK" },
  { id: "MIXED", label: "Mieszana" },
] as const;

type Props = {
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  session: DirectSaleSession | null;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  onCheckout: () => void;
  onComplete: () => void;
  onSuspend: () => void;
};

export function PaymentPanel({
  total,
  busy,
  hasSession,
  hasLines,
  session,
  paymentMethod,
  onPaymentMethodChange,
  onCheckout,
  onComplete,
  onSuspend,
}: Props) {
  const payCtx = session?.payment_context;
  const authRef =
    payCtx && typeof payCtx.authorization_reference === "string"
      ? payCtx.authorization_reference
      : payCtx && typeof payCtx.external_ref === "string"
        ? payCtx.external_ref
        : null;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">Do zapłaty</div>
        <div className="text-2xl font-bold text-slate-900">{total.toFixed(2)} zł</div>
        {session?.status ? (
          <div className="mt-1 text-[10px] uppercase text-slate-500">Status: {session.status}</div>
        ) : null}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-1 text-xs font-medium text-slate-600">Płatność</div>
        <div className="grid grid-cols-2 gap-1">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy}
              onClick={() => onPaymentMethodChange(m.id)}
              className={`rounded-lg px-2 py-1.5 text-xs font-medium ${
                paymentMethod === m.id
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50"
              } disabled:opacity-50`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {session?.status === "CHECKOUT" && payCtx ? (
          <dl className="mt-2 space-y-0.5 text-[10px] text-slate-600">
            <div className="flex justify-between">
              <dt>Kwota</dt>
              <dd>{safeDisplay(payCtx.amount, "—")}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Autoryzacja</dt>
              <dd>{authRef ?? "oczekuje"}</dd>
            </div>
          </dl>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy || !hasSession || !hasLines}
        onClick={onCheckout}
        className="w-full rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Rozpocznij płatność
      </button>
      <button
        type="button"
        disabled={busy || !hasSession || !hasLines}
        onClick={onComplete}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Realizuj
      </button>
      <button
        type="button"
        disabled={busy || !hasSession}
        onClick={onSuspend}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
      >
        Zawieś sesję
      </button>
    </div>
  );
}
