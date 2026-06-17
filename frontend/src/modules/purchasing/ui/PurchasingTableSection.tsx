import { memo, type ReactNode } from "react";
import { PurchasingDataPanel } from "./PurchasingDataPanel";

type Props = {
  title: string;
  subtitle?: string;
  indicatorClass?: string;
  action?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Tabela w ramce modułu — nagłówek sekcji + opcjonalny pasek nad tabelą. */
function PurchasingTableSectionInner({
  title,
  subtitle,
  indicatorClass,
  action,
  toolbar,
  children,
  className = "",
}: Props) {
  return (
    <PurchasingDataPanel
      title={title}
      subtitle={subtitle}
      indicatorClass={indicatorClass}
      action={action}
      className={className}
    >
      {toolbar ? <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-600">{toolbar}</div> : null}
      <div className="overflow-x-auto">{children}</div>
    </PurchasingDataPanel>
  );
}

export const PurchasingTableSection = memo(PurchasingTableSectionInner);
