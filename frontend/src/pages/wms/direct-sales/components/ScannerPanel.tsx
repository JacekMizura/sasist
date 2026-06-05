import type { DirectSaleSession } from "../services/directSalesApi";

type Props = {
  session: DirectSaleSession | null;
  paymentMethod: string;
  error: string | null;
  onPaymentMethodChange: (method: string) => void;
};

export function ScannerPanel({ session, paymentMethod, error, onPaymentMethodChange }: Props) {
  return (
    <aside className="w-full shrink-0 space-y-2 md:w-56">
      <h1 className="text-lg font-semibold text-slate-900">Sprzedaż bezpośrednia</h1>
      <p className="text-xs text-slate-500">Skanuj produkty — bez przeładowań strony.</p>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
        <div>Sesja: {session ? `#${session.id}` : "—"}</div>
        <div>Status: {session?.status ?? "—"}</div>
      </div>
      <label className="block text-xs font-medium text-slate-700">
        Płatność
        <select
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={paymentMethod}
          onChange={(e) => onPaymentMethodChange(e.target.value)}
        >
          <option value="CASH">Gotówka</option>
          <option value="CARD">Karta</option>
          <option value="BLIK">BLIK</option>
        </select>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </aside>
  );
}
