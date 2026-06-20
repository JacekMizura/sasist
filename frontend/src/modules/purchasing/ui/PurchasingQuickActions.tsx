import { memo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { purchasingBtnPrimary, purchasingBtnSecondary } from "./purchasingButtonTokens";

type Action = {
  label: string;
  to: string;
  variant?: "primary" | "secondary";
};

type Props = {
  title?: string;
  actions: Action[];
  trailing?: ReactNode;
};

function PurchasingQuickActionsInner({ title = "Szybkie działania", actions, trailing }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <Link
            key={a.to + a.label}
            to={a.to}
            className={a.variant === "primary" ? purchasingBtnPrimary : purchasingBtnSecondary}
          >
            {a.label}
          </Link>
        ))}
        {trailing}
      </div>
    </div>
  );
}

export const PurchasingQuickActions = memo(PurchasingQuickActionsInner);
