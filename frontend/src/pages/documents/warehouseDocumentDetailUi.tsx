import type { ReactNode } from "react";
import {
  listSellasistInputClass,
  listSellasistToolbarSquareBtn,
  listSellasistToolbarToggleBtn,
} from "../../components/listPage/listSellasistTokens";

export const warehouseDocInfoCardClass =
  "rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm";

export const warehouseDocPrimaryBtnClass =
  "inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

export const warehouseDocDetailScrollClass = "min-h-0 min-w-0 flex-1 overflow-auto pb-[72px]";

export const warehouseDocSecondaryBtnClass = listSellasistToolbarToggleBtn;

export const warehouseDocIconBtnClass = listSellasistToolbarSquareBtn;

export const warehouseDocIconBtnDangerClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-200/90 bg-white text-red-600 shadow-none transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30 disabled:cursor-not-allowed disabled:opacity-50";

export const warehouseDocFinancialInputClass = `${listSellasistInputClass} !h-9 !py-1.5 tabular-nums`;

export function WarehouseDocCompactRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 text-[13px] last:border-b-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <div className="min-w-0 text-right font-medium leading-snug text-slate-900">{value}</div>
    </div>
  );
}

export function WarehouseDocFinancialCompactBar({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-sm">
      {children}
    </div>
  );
}

export function WarehouseDocFinancialItem({
  label,
  value,
  tone,
  compact,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "diff";
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-600">
        <span className="text-[11px] text-slate-500">{label}</span>
        <span className={`text-[12px] font-semibold tabular-nums ${tone === "diff" ? "" : "text-slate-900"}`}>
          {value}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-600">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`font-semibold tabular-nums ${
          tone === "diff" ? "" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

export function WarehouseDocFinancialSeparator() {
  return <span className="hidden text-slate-300 sm:inline" aria-hidden>|</span>;
}

export function WarehouseDocSummaryBar({
  left,
  right,
  className = "",
}: {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/80 px-4 py-2.5 text-[13px] ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">{left}</div>
      {right ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600">{right}</div>
      ) : null}
    </div>
  );
}

export function WarehouseDocSummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "diff";
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${tone === "diff" ? "" : "text-slate-900"}`}>{value}</span>
    </span>
  );
}

export function WarehouseDocSummarySeparator() {
  return <span className="text-slate-300" aria-hidden>|</span>;
}
