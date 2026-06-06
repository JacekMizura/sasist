import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { paymentMethodPl, sessionStatusPl } from "./directSalesTerminology";

const METHODS = [
  { id: "CASH", label: "Gotówka", key: "F1" },
  { id: "CARD", label: "Karta", key: "F2" },
  { id: "BLIK", label: "BLIK", key: "F3" },
  { id: "MIXED", label: "Mieszana", key: "" },
] as const;

type Props = {
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  session: DirectSaleSession | null;
  paymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  onComplete: () => void;
};

function numFromCtx(ctx: Record<string, unknown> | null, key: string): number | null {
  if (!ctx) return null;
  const v = ctx[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function PaymentPanel({
  total,
  busy,
  hasSession,
  hasLines,
  session,
  paymentMethod,
  onPaymentMethodChange,
  onComplete,
}: Props) {
  const payCtx = session?.payment_context;
  const amount = numFromCtx(payCtx, "amount") ?? total;
  const paid = numFromCtx(payCtx, "paid_amount") ?? (session?.status === "CHECKOUT" ? 0 : null);
  const remaining = paid != null ? Math.max(0, amount - paid) : amount;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">Do zapłaty</div>
        <div className="text-2xl font-bold text-slate-900">{amount.toFixed(2)} zł</div>
        {session?.status === "CHECKOUT" ? (
          <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <dt>Wpłacono</dt>
              <dd>{(paid ?? 0).toFixed(2)} zł</dd>
            </div>
            <div className="flex justify-between font-medium text-slate-800">
              <dt>Pozostało</dt>
              <dd>{remaining.toFixed(2)} zł</dd>
            </div>
          </dl>
        ) : null}
        {session?.status ? (
          <div className="mt-1 text-[10px] text-slate-500">Status: {sessionStatusPl(session.status)}</div>
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
              {m.key ? <span className="ml-1 opacity-60">{m.key}</span> : null}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          Skróty: F1 gotówka · F2 karta · F3 BLIK · Ctrl+Enter zakończ
        </p>
        <p className="text-[10px] text-slate-500">Wybrano: {paymentMethodPl(paymentMethod)}</p>
      </div>
      <button
        type="button"
        disabled={busy || !hasSession || !hasLines}
        onClick={onComplete}
        className="w-full rounded-lg bg-emerald-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        Zakończ sprzedaż (Enter)
      </button>
    </div>
  );
}
