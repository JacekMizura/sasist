import { PrimaryButton } from "../../../design-system/PrimaryButton";
import type { OrderCaseDraftMeta, OrderCaseKind, OrderCaseLineDraft } from "./orderCaseCreateTypes";
import { ORDER_CASE_SETTLEMENTS } from "./orderCaseCreateConstants";

type Props = {
  kind: OrderCaseKind;
  lines: OrderCaseLineDraft[];
  meta: OrderCaseDraftMeta;
  shippingCost: number;
  saleDocumentLabel: string;
  statusLabel: string;
  submitting: boolean;
  error: string | null;
  onChangeMeta: (patch: Partial<OrderCaseDraftMeta>) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

function money(n: number): string {
  return `${n.toFixed(2)} zł`;
}

export function OrderCaseCreateSummaryPanel({
  kind,
  lines,
  meta,
  shippingCost,
  saleDocumentLabel,
  statusLabel,
  submitting,
  error,
  onChangeMeta,
  onSubmit,
  onCancel,
}: Props) {
  const productCount = lines.reduce((s, l) => s + l.returnQty, 0);
  const productsValue = lines.reduce((s, l) => s + l.returnQty * l.unitPrice, 0);
  const shippingRefund = meta.refundShipping ? shippingCost : 0;
  const total = productsValue + shippingRefund;
  const cta = kind === "return" ? "Utwórz zwrot" : "Utwórz reklamację";
  const title = kind === "return" ? "Podsumowanie zwrotu" : "Podsumowanie reklamacji";

  return (
    <aside className="flex w-full flex-col rounded-xl border border-slate-200 bg-white lg:w-[300px] lg:shrink-0">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-[13px] font-bold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">Draft — widoczny tylko w Panelu do zapisania.</p>
      </div>

      <div className="space-y-3 px-4 py-3 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Liczba produktów</span>
          <span className="font-semibold tabular-nums text-slate-900">{productCount} szt.</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Wartość {kind === "return" ? "zwrotu" : "reklamacji"}</span>
          <span className="font-semibold tabular-nums text-slate-900">{money(productsValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Koszt wysyłki</span>
          <span className="font-medium tabular-nums text-slate-800">{money(shippingCost)}</span>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
          <input
            type="checkbox"
            checked={meta.refundShipping}
            onChange={(e) => onChangeMeta({ refundShipping: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
          />
          <span className="min-w-0">
            <span className="block font-medium text-slate-800">Zwrot kosztu dostawy</span>
            <span className="text-[11px] text-slate-500">{money(shippingRefund)}</span>
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Sposób rozliczenia
          </span>
          <select
            value={meta.settlement}
            onChange={(e) =>
              onChangeMeta({ settlement: e.target.value as OrderCaseDraftMeta["settlement"] })
            }
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
          >
            {ORDER_CASE_SETTLEMENTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="text-slate-500">Dokument sprzedaży</span>
          <span className="max-w-[55%] truncate text-right font-medium text-slate-800">{saleDocumentLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">Status</span>
          <span className="inline-flex h-[22px] items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[10px] font-semibold text-slate-700">
            {statusLabel}
          </span>
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Notatka
          </span>
          <textarea
            value={meta.note}
            onChange={(e) => onChangeMeta({ note: e.target.value })}
            rows={3}
            placeholder="Opcjonalna notatka do karty…"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
          />
        </label>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="font-semibold text-slate-900">Razem</span>
          <span className="text-base font-bold tabular-nums text-slate-900">{money(total)}</span>
        </div>

        {error ? <p className="text-xs font-medium text-red-700">{error}</p> : null}
      </div>

      <div className="mt-auto space-y-2 border-t border-slate-100 px-4 py-3">
        <PrimaryButton
          type="button"
          className="w-full"
          disabled={submitting || lines.length === 0}
          onClick={onSubmit}
        >
          {submitting ? "Zapisywanie…" : cta}
        </PrimaryButton>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-[34px] w-full items-center justify-center rounded-lg text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
        >
          Anuluj
        </button>
      </div>
    </aside>
  );
}
