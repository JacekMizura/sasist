import type { ReactNode } from "react";

export type AppCardProps = {
  children: ReactNode;
  className?: string;
};

/** Karta formularza / sekcji — spójna z modułami ERP. */
export function AppCard({ children, className = "" }: AppCardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}>{children}</div>
  );
}
