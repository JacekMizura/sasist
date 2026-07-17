import { DEV_SCANNER_CATEGORIES, type DevScannerCategoryId } from "./categories";

type Props = {
  active: DevScannerCategoryId;
  counts: Record<DevScannerCategoryId, number>;
  onChange: (id: DevScannerCategoryId) => void;
  compact?: boolean;
};

export function DevScannerCategoryStrip({ active, counts, onChange, compact }: Props) {
  return (
    <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
      <div className="flex min-w-max gap-1.5 px-1">
        {DEV_SCANNER_CATEGORIES.map((cat) => {
          const count = counts[cat.id] ?? 0;
          const isActive = active === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onChange(cat.id)}
              className={`shrink-0 rounded-xl border px-3 font-bold transition-colors ${
                compact ? "min-h-11 py-2 text-[11px]" : "min-h-10 py-1.5 text-[10px]"
              } ${
                isActive
                  ? "border-sky-500 bg-sky-50 text-sky-900 ring-1 ring-sky-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="whitespace-nowrap">{cat.label}</span>
              <span
                className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-md px-1 text-[10px] font-black ${
                  isActive ? "bg-sky-200/80 text-sky-900" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
