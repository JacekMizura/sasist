import { useState } from "react";

import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";

type Props = {
  disabled?: boolean;
  discountType: string | null;
  discountValue: number;
  onApply: (type: "percent" | "amount" | null, value: number) => void;
};

export function OrderDiscountPanel({ disabled, discountType, discountValue, onApply }: Props) {
  const settings = useResolvedDirectSalesSettings();
  const [mode, setMode] = useState<"percent" | "amount">(
    discountType === "amount" ? "amount" : "percent",
  );
  const [draft, setDraft] = useState(discountValue > 0 ? String(discountValue) : "");

  if (!settings.discounts?.allow_order_discounts) return null;

  const quick = settings.discounts?.quick_discount_percents ?? [5, 10, 15, 20];

  return (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4 space-y-2">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-900/70">Rabat całego zamówienia</h4>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold ${mode === "percent" ? "bg-white text-amber-900 shadow-sm" : ""}`}
        >
          Procent
        </button>
        <button
          type="button"
          onClick={() => setMode("amount")}
          className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold ${mode === "amount" ? "bg-white text-amber-900 shadow-sm" : ""}`}
        >
          Kwota
        </button>
      </div>
      <input
        type="number"
        disabled={disabled}
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="no-number-spinner w-full rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm"
        placeholder={mode === "percent" ? "Rabat %" : "Rabat zł"}
      />
      <div className="flex flex-wrap gap-1">
        {quick.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(String(p));
              onApply("percent", p);
            }}
            className="rounded-md bg-white border border-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900"
          >
            {p}%
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const v = Number(draft);
          if (!Number.isFinite(v) || v <= 0) {
            onApply(null, 0);
            return;
          }
          onApply(mode, v);
        }}
        className="w-full rounded-lg bg-amber-600 py-2 text-xs font-bold text-white disabled:opacity-40"
      >
        Zastosuj rabat
      </button>
    </div>
  );
}
