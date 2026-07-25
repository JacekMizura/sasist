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
    <div className={`flex flex-col min-w-0 overflow-hidden ${className}`.trim()}>
      <PurchasingSectionHeader
        title={title}
        subtitle={subtitle}
        indicatorClass={indicatorClass}
        action={action}
      />
      <div>{children}</div>
    </div>
  );
}

export const PurchasingDataPanel = memo(PurchasingDataPanelInner);
