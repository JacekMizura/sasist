import { memo } from "react";

type Align = "left" | "right" | "center";

type Props = {
  headers: string[];
  align?: Align[];
  compact?: boolean;
};

function PurchasingTableHeaderInner({ headers, align = [], compact = false }: Props) {
  const thPad = compact ? "px-4 py-3" : "px-6 py-4";
  return (
    <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
      <tr>
        {headers.map((h, i) => {
          const a = align[i] ?? "left";
          return (
            <th key={`${h}-${i}`} className={`${thPad} text-${a}`}>
              {h}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export const PurchasingTableHeader = memo(PurchasingTableHeaderInner);
