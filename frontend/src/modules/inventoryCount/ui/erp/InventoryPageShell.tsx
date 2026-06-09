import { PageModuleHeader } from "@/components/layout/PageModuleHeader";
import { erpKpiCard, erpKpiLabel, erpKpiValue, erpSectionCard, erpSectionHeader } from "./theme";

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
    <section className={`${erpSectionCard} ${className}`.trim()}>
      {title ? (
        <div className={`${erpSectionHeader} flex items-center justify-between gap-2`}>
          <span>{title}</span>
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
    <div className={erpKpiCard}>
      <p className={erpKpiLabel}>{label}</p>
      <p className={erpKpiValue}>{value}</p>
      {hint ? <p className="mt-1 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}
