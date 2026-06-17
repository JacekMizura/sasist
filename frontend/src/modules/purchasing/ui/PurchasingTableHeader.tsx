import { memo, type ReactNode } from "react";

type Align = "left" | "right" | "center";

type Props = {
  headers?: string[];
  align?: Align[];
  compact?: boolean;
  /** Własny wiersz nagłówka (checkbox, sortowanie) — zamiast headers/align. */
  children?: ReactNode;
  className?: string;
  sticky?: boolean;
};

const ALIGN_CLASS: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function PurchasingTableHeaderInner({
  headers = [],
  align = [],
  compact = false,
  children,
  className = "",
  sticky = false,
}: Props) {
  const thPad = compact ? "px-3 py-3" : "px-6 py-4";
  const theadClass = [
    "border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500",
    sticky ? "sticky top-0 z-10 shadow-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (children) {
    return <thead className={theadClass}>{children}</thead>;
  }

  return (
    <thead className={theadClass}>
      <tr>
        {headers.map((h, i) => {
          const a = align[i] ?? "left";
          return (
            <th key={`${h}-${i}`} className={`${thPad} ${ALIGN_CLASS[a]}`}>
              {h}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export const PurchasingTableHeader = memo(PurchasingTableHeaderInner);
