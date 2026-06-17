import { memo, type ReactNode } from "react";
import { PurchasingSectionHeader } from "./PurchasingSectionHeader";

type Props = {
  title: string;
  subtitle?: string;
  indicatorClass?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

function PurchasingDataPanelInner({
  title,
  subtitle,
  indicatorClass,
  action,
  children,
  className = "",
}: Props) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`.trim()}>
      <PurchasingSectionHeader
        title={title}
        subtitle={subtitle}
        indicatorClass={indicatorClass}
        action={action}
      />
      <div className="flex-grow">{children}</div>
    </div>
  );
}

export const PurchasingDataPanel = memo(PurchasingDataPanelInner);
