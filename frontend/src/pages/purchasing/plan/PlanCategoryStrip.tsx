import { memo } from "react";

/** Szybkie filtry planu zakupów — bez segmentacji ABC/XYZ. */
export type PlanCategoryQuickFilter =
  | ""
  | "rising_demand"
  | "low_stock"
  | "dead_stock"
  | "low_cover_days"
  | "high_capital_locked";

type CategoryDef = {
  id: Exclude<PlanCategoryQuickFilter, "">;
  label: string;
  count: number;
};

type Props = {
  counts: {
    rising_demand: number;
    low_stock: number;
    dead_stock: number;
    low_cover_days: number;
    high_capital_locked: number;
  };
  active: PlanCategoryQuickFilter;
  onSelect: (next: PlanCategoryQuickFilter) => void;
};

function chipClass(active: boolean): string {
  return active
    ? "rounded-lg bg-orange-100 px-2.5 py-1.5 text-xs font-semibold text-orange-950 ring-1 ring-orange-200"
    : "rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50";
}

function PlanCategoryStripInner({ counts, active, onSelect }: Props) {
  const items: CategoryDef[] = [
    { id: "rising_demand", label: "Hity sprzedaży", count: counts.rising_demand },
    { id: "low_stock", label: "Niski zapas", count: counts.low_stock },
    { id: "dead_stock", label: "Martwy stock", count: counts.dead_stock },
    { id: "low_cover_days", label: "Ryzyko braku", count: counts.low_cover_days },
    { id: "high_capital_locked", label: "Wysoka wartość magazynu", count: counts.high_capital_locked },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Kategorie decyzji</p>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={chipClass(active === it.id)}
            onClick={() => onSelect(active === it.id ? "" : it.id)}
          >
            {it.label}
            <span className="ml-1.5 tabular-nums text-slate-500">({it.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export const PlanCategoryStrip = memo(PlanCategoryStripInner);
