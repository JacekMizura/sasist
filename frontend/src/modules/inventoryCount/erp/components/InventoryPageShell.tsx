import { PageModuleHeader } from "../../../../components/layout/PageModuleHeader";

type Props = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

/** Nagłówek strony modułu inwentaryzacji — ten sam rytm co Documents / listy ERP. */
export function InventoryPageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
      <PageModuleHeader title={title} subtitle={subtitle} />
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function InventorySection({
  title,
  actions,
  children,
  className = "",
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`.trim()}>
      {title ? (
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</h3>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function InventoryKpiTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
