import { useState } from "react";

import type { PurchaseHistoryQueryFilters } from "../../../api/customerPurchaseHistoryApi";

const inp =
  "mt-1 min-h-[36px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

const labelClass = "block text-xs font-medium text-slate-600";

type Props = {
  draft: PurchaseHistoryQueryFilters;
  onChange: (patch: Partial<PurchaseHistoryQueryFilters>) => void;
  onApply: () => void;
  onClear: () => void;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function applyQuickRange(days: number | "year"): Partial<PurchaseHistoryQueryFilters> {
  const to = new Date();
  const from = new Date();
  if (days === "year") {
    from.setMonth(0, 1);
  } else if (days === 0) {
    // dziś
  } else {
    from.setDate(from.getDate() - days + 1);
  }
  return { date_from: isoDate(from), date_to: isoDate(to) };
}

const QUICK_RANGES: { label: string; range: Partial<PurchaseHistoryQueryFilters> }[] = [
  { label: "Dziś", range: applyQuickRange(0) },
  { label: "7 dni", range: applyQuickRange(7) },
  { label: "30 dni", range: applyQuickRange(30) },
  { label: "90 dni", range: applyQuickRange(90) },
  { label: "Cały rok", range: applyQuickRange("year") },
];

export function CustomerPurchaseHistoryFilters({ draft, onChange, onApply, onClear }: Props) {
  const [pendingRange, setPendingRange] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-none">
      <div className="flex flex-wrap gap-2">
        {QUICK_RANGES.map(({ label, range }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onChange(range);
              setPendingRange(label);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
              pendingRange === label
                ? "border-orange-400 bg-orange-50 text-orange-900"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>
          Data od
          <input
            type="date"
            className={inp}
            value={draft.date_from ?? ""}
            onChange={(e) => {
              setPendingRange(null);
              onChange({ date_from: e.target.value || undefined });
            }}
          />
        </label>
        <label className={labelClass}>
          Data do
          <input
            type="date"
            className={inp}
            value={draft.date_to ?? ""}
            onChange={(e) => {
              setPendingRange(null);
              onChange({ date_to: e.target.value || undefined });
            }}
          />
        </label>
        <label className={labelClass}>
          Kwota brutto od
          <input
            type="number"
            min={0}
            step="0.01"
            className={inp}
            placeholder="0,00"
            value={draft.gross_min ?? ""}
            onChange={(e) =>
              onChange({ gross_min: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className={labelClass}>
          Kwota brutto do
          <input
            type="number"
            min={0}
            step="0.01"
            className={inp}
            placeholder="0,00"
            value={draft.gross_max ?? ""}
            onChange={(e) =>
              onChange({ gross_max: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Filtruj
        </button>
        <button
          type="button"
          onClick={() => {
            setPendingRange(null);
            onClear();
          }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Wyczyść filtry
        </button>
      </div>
    </section>
  );
}
