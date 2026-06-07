import { useState } from "react";
import { Percent, Tag } from "lucide-react";

import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";

type Props = {
  disabled?: boolean;
  currentType: string | null;
  currentValue: number;
  onApply: (type: "percent" | "amount" | null, value: number) => void;
};

export function LineDiscountPopover({ disabled, currentType, currentValue, onApply }: Props) {
  const settings = useResolvedDirectSalesSettings();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"percent" | "amount">(
    currentType === "amount" ? "amount" : "percent",
  );
  const [draft, setDraft] = useState(String(currentValue > 0 ? currentValue : ""));

  if (!settings.discounts?.allow_line_discounts) return null;

  const quick = settings.discounts?.quick_discount_percents ?? [5, 10, 15, 20];

  const apply = (type: "percent" | "amount" | null, value: number) => {
    onApply(type, value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
        title="Rabat pozycji"
      >
        <Tag size={12} />
        {currentValue > 0 ? `−${currentValue}${currentType === "percent" ? "%" : " zł"}` : "Rabat"}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex gap-1">
            <button
              type="button"
              onClick={() => setMode("percent")}
              className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold ${mode === "percent" ? "bg-blue-100 text-blue-800" : "bg-slate-50"}`}
            >
              <Percent size={10} className="inline" /> %
            </button>
            <button
              type="button"
              onClick={() => setMode("amount")}
              className={`flex-1 rounded-lg px-2 py-1 text-[10px] font-bold ${mode === "amount" ? "bg-blue-100 text-blue-800" : "bg-slate-50"}`}
            >
              zł
            </button>
          </div>
          <input
            type="number"
            min={0}
            step={mode === "percent" ? 1 : 0.01}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
            placeholder={mode === "percent" ? "np. 10" : "np. 5.00"}
          />
          <div className="mb-2 flex flex-wrap gap-1">
            {quick.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => apply("percent", p)}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                const v = Number(draft);
                if (!Number.isFinite(v) || v <= 0) return;
                const max = settings.discounts?.max_discount_percent ?? 50;
                if (mode === "percent" && v > max) return;
                apply(mode, v);
              }}
              className="flex-1 rounded-lg bg-blue-600 py-1.5 text-[10px] font-bold text-white"
            >
              Zastosuj
            </button>
            <button
              type="button"
              onClick={() => apply(null, 0)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-600"
            >
              Usuń
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
