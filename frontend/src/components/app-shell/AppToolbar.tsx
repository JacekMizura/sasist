import type { ReactNode } from "react";

export type AppToolbarProps = {
  children: ReactNode;
  className?: string;
};

/** Horizontal action bar under page header or above table. */
export function AppToolbar({ children, className = "" }: AppToolbarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-slate-50/80 px-3 py-2 sm:px-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
