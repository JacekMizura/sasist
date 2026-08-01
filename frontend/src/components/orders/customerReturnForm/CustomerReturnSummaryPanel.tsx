import { PrimaryButton } from "../../../design-system/PrimaryButton";
import {
  CUSTOMER_REFUND_METHODS,
  CUSTOMER_RETURN_FIELD_CLASS,
  CUSTOMER_RETURN_LABEL_CLASS,
} from "./customerReturnFormConstants";
import { customerReturnMoney } from "./customerReturnFormUtils";
import type { CustomerReturnLineDraft, CustomerReturnMeta } from "./customerReturnFormTypes";

type Props = {
  lines: CustomerReturnLineDraft[];
  meta: CustomerReturnMeta;
  shippingCost: number;
  saleDocumentLabel: string;
  statusLabel: string;
  submitting: boolean;
  error: string | null;
  onChangeMeta: (patch: Partial<CustomerReturnMeta>) => void;
  onSubmit: () => void;
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span
        className={`text-right tabular-nums ${
          strong ? "text-[15px] font-semibold text-slate-900" : "text-[13px] font-medium text-slate-800"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function CustomerReturnSummaryPanel({
  lines,
  meta,
  shippingCost,
  saleDocumentLabel,
  statusLabel,
  submitting,
  error,
  onChangeMeta,
  onSubmit,
}: Props) {
  const productCount = lines.reduce((s, l) => s + l.returnQty, 0);
  const productsValue = lines.reduce((s, l) => s + l.returnQty * l.unitPrice, 0);
  const shippingRefund = meta.refundShipping ? shippingCost : 0;
  const total = productsValue + shippingRefund;
  const showBank = meta.refundMethod === "bank_transfer";

  return (
    <aside className="rounded-xl border border-slate-200/80 bg-white p-5 lg:sticky lg:top-6">
      <h2 className="text-[15px] font-semibold text-slate-900">Podsumowanie</h2>
      <p className="mt-1 text-[12px] text-slate-500">Aktualizuje się na żywo wraz z wyborem produktów.</p>

      <div className="mt-5 space-y-3">
        <Row label="Liczba produktów" value={`${productCount} szt.`} />
        <Row label="Wartość zwrotu" value={customerReturnMoney(productsValue)} />

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-100 px-3 py-2.5 transition-colors hover:bg-slate-50/80">
          <input
            type="checkbox"
            checked={meta.refundShipping}
            onChange={(e) => onChangeMeta({ refundShipping: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-slate-800">Zwrot kosztu dostawy</span>
              <span className="text-[13px] font-medium tabular-nums text-slate-800">
                {customerReturnMoney(shippingRefund)}
              </span>
            </span>
          </span>
        </label>

        <Row label="Koszt przesyłki" value={customerReturnMoney(shippingCost)} />

        <div className="border-t border-slate-100 pt-3">
          <Row label="Razem" value={customerReturnMoney(total)} strong />
        </div>

        <Row label="Dokument sprzedaży" value={saleDocumentLabel} />

        <div className="pt-1">
          <p className={CUSTOMER_RETURN_LABEL_CLASS}>Forma zwrotu środków</p>
          <div className="space-y-2" role="radiogroup" aria-label="Forma zwrotu środków">
            {CUSTOMER_REFUND_METHODS.map((m) => {
              const active = meta.refundMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChangeMeta({ refundMethod: m.id })}
                  className={`flex w-full flex-col rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
                    active
                      ? "border-slate-300 bg-slate-50"
                      : "border-slate-200/80 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="text-[13px] font-semibold text-slate-800">{m.label}</span>
                  <span className="text-[11px] text-slate-500">{m.hint}</span>
                </button>
              );
            })}
          </div>

          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              showBank ? "mt-3 grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              {showBank ? (
                <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
                  <label className="block">
                    <span className={CUSTOMER_RETURN_LABEL_CLASS}>Właściciel konta</span>
                    <input
                      type="text"
                      value={meta.bank.accountHolder}
                      onChange={(e) =>
                        onChangeMeta({
                          bank: { ...meta.bank, accountHolder: e.target.value },
                        })
                      }
                      placeholder="Imię i nazwisko"
                      className={CUSTOMER_RETURN_FIELD_CLASS}
                      autoComplete="name"
                    />
                  </label>
                  <label className="block">
                    <span className={CUSTOMER_RETURN_LABEL_CLASS}>Numer konta (IBAN)</span>
                    <input
                      type="text"
                      value={meta.bank.iban}
                      onChange={(e) =>
                        onChangeMeta({
                          bank: { ...meta.bank, iban: e.target.value },
                        })
                      }
                      placeholder="PL…"
                      className={`${CUSTOMER_RETURN_FIELD_CLASS} font-mono text-[12px]`}
                      autoComplete="off"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-[13px] text-slate-500">Status</span>
          <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700">
            {statusLabel}
          </span>
        </div>
      </div>

      {error ? <p className="mt-4 text-[13px] font-medium text-red-700">{error}</p> : null}

      <PrimaryButton
        type="button"
        className="mt-5 w-full justify-center"
        disabled={submitting || lines.length === 0}
        onClick={onSubmit}
      >
        {submitting ? "Wysyłanie…" : "Wyślij zgłoszenie"}
      </PrimaryButton>
    </aside>
  );
}
