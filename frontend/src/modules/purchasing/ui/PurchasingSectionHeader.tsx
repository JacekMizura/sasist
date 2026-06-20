import { memo, type ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  indicatorClass?: string;
  action?: ReactNode;
};

function PurchasingSectionHeaderInner({ title, subtitle, indicatorClass, action }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
      <h2 className="flex items-center text-base font-semibold text-slate-800">
        {indicatorClass ? <span className={`mr-2 h-2 w-2 rounded-full ${indicatorClass}`} /> : null}
        {title}
        {subtitle ? <span className="ml-2 font-normal text-slate-400">{subtitle}</span> : null}
      </h2>
      {action}
    </div>
  );
}

export const PurchasingSectionHeader = memo(PurchasingSectionHeaderInner);
