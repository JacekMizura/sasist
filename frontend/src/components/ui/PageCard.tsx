import type { ReactNode } from "react";

export default function PageCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 ${className}`.trim()}>{children}</div>
  );
}
