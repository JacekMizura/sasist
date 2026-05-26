/** Shared with product edit modal and carton detail — same visual as assortment „Card”. */
export function WarehouseFormCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: import("react").ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-100 bg-slate-50/70 p-3.5 sm:p-4 ${className}`}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
