import type { ReactNode } from "react";

import {
  brandLinkButtonClass,
  brandOutlineButtonClass,
  brandSoftRowHoverClass,
  brandTextAccentClass,
} from "../../../../design-system/brandUi";

/** Soft brand chrome for printing module tables (hover). */
export const printingTableRowHoverClass = brandSoftRowHoverClass;

export function PrintingPageBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 space-y-4 ${className}`.trim()}>{children}</div>;
}

type KpiItem = {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "danger" | "warning" | "primary";
};

const kpiToneClass: Record<NonNullable<KpiItem["tone"]>, string> = {
  neutral: "text-slate-900",
  success: "text-green-600",
  danger: "text-red-600",
  warning: "text-amber-600",
  primary: brandTextAccentClass,
};

export function PrintingKpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${kpiToneClass[item.tone ?? "neutral"]}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PrintingAlert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-green-200 bg-green-50 text-green-700";
  return <p className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

export function PrintingEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function PrintingLoadingState({ label = "Ładowanie…" }: { label?: string }) {
  return <p className="text-sm text-slate-500">{label}</p>;
}

type PrintingDataTableProps = {
  children: ReactNode;
  className?: string;
};

export function PrintingDataTable({ children, className = "" }: PrintingDataTableProps) {
  return (
    <div
      className={`min-w-0 overflow-hidden border-t border-slate-100 pt-4 ${className}`.trim()}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function PrintingTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 text-left text-slate-600 backdrop-blur-sm">
      {children}
    </thead>
  );
}

export function PrintingTableHeadCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${className}`.trim()}>{children}</th>;
}

export function PrintingTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function PrintingTableRow({ children }: { children: ReactNode }) {
  return <tr className={`align-top transition-colors even:bg-slate-50/40 ${printingTableRowHoverClass}`}>{children}</tr>;
}

export function PrintingTableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`.trim()}>{children}</td>;
}

export function PrintingStatusBadge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{children}</span>
  );
}

/** Brand text action in printing tables — uses Design System link token. */
export function PrintingLinkButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${brandLinkButtonClass} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

/** Brand outline for secondary printing actions. */
export const printingOutlineButtonClass = brandOutlineButtonClass;
