import { useMemo } from "react";

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250] as const;

type Props = {
  value: number;
  onChange: (next: number) => void;
  options?: readonly number[];
  className?: string;
};

export function DataTablePageSizeSelect({
  value,
  onChange,
  options = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: Props) {
  const normalized = useMemo(() => {
    const uniq = Array.from(new Set(options.filter((x) => Number.isFinite(x) && x > 0)));
    uniq.sort((a, b) => a - b);
    return uniq.length > 0 ? uniq : [25];
  }, [options]);

  return (
    <div className={className ?? "flex items-center gap-2"}>
      <span className="text-sm text-slate-600">Pokaż na stronie</span>
      <select
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {normalized.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

