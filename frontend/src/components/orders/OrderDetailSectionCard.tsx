import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
  contentClassName?: string;
  elevated?: boolean;
  /** Tighter padding / title gap for summary density. */
  dense?: boolean;
  /** Softer title/contrast for secondary blocks (Safe Order, extra fields). */
  quiet?: boolean;
};

/**
 * Shared order-detail card (summary / aside / bottom sections).
 */
export function OrderDetailSectionCard({
  title,
  children,
  right,
  className,
  contentClassName,
  elevated = false,
  dense = false,
  quiet = false,
}: Props) {
  const shellClass = elevated
    ? dense
      ? "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      : "rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    : dense
      ? "rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm"
      : "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
  const titleClass = quiet
    ? "text-[10px] font-bold uppercase tracking-wider text-slate-400"
    : "text-[11px] font-bold uppercase tracking-widest text-slate-500";
  return (
    <section className={className ?? `${shellClass} flex h-full flex-col`}>
      <div className={`flex items-center justify-between ${dense ? "mb-2" : "mb-4"}`}>
        <h3 className={titleClass}>{title}</h3>
        {right}
      </div>
      <div className={`flex-1 ${contentClassName ?? ""}`}>{children}</div>
    </section>
  );
}
