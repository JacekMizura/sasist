type Props = {
  total: number;
  busy: boolean;
  hasSession: boolean;
  hasLines: boolean;
  sessionStatus?: string | null;
  documentHint?: string | null;
  onCheckout: () => void;
  onComplete: () => void;
  onSuspend: () => void;
};

export function PaymentPanel({
  total,
  busy,
  hasSession,
  hasLines,
  sessionStatus,
  documentHint,
  onCheckout,
  onComplete,
  onSuspend,
}: Props) {
  return (
    <aside className="w-full shrink-0 space-y-2 md:w-52">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs text-slate-500">Suma</div>
        <div className="text-2xl font-bold text-slate-900">{total.toFixed(2)} zł</div>
        {sessionStatus ? (
          <div className="mt-1 text-[10px] uppercase text-slate-500">Status: {sessionStatus}</div>
        ) : null}
        {documentHint ? (
          <div className="mt-0.5 text-[10px] text-emerald-700">{documentHint}</div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={busy || !hasSession || !hasLines}
        onClick={onCheckout}
        className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Płatność
      </button>
      <button
        type="button"
        disabled={busy || !hasSession || !hasLines}
        onClick={onComplete}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Zakończ sprzedaż
      </button>
      <button
        type="button"
        disabled={busy || !hasSession}
        onClick={onSuspend}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
      >
        Zawieś
      </button>
    </aside>
  );
}
