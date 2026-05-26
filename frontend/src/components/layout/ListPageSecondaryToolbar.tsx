import type { ReactNode } from "react";

/** Compact chip/action row below list filters (Orders-style). */
export function listPageSecondaryToolbarClass(extra = ""): string {
  return `rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm ${extra}`.trim();
}

export function ListPageSecondaryToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={listPageSecondaryToolbarClass(className)}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
