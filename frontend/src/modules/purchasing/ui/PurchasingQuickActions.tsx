import { memo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Action = {
  label: string;
  to: string;
  description?: string;
  variant?: "primary" | "default";
};

type Props = {
  title?: string;
  actions: Action[];
  trailing?: ReactNode;
};

function PurchasingQuickActionsInner({ title = "Szybkie działania", actions, trailing }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</p>
        {trailing}
      </div>
      <div className="flex flex-wrap gap-3">
        {actions.map((a) => (
          <Link
            key={a.to + a.label}
            to={a.to}
            className={`inline-flex flex-col rounded-lg border px-4 py-3 text-sm font-semibold transition-shadow hover:shadow-md ${
              a.variant === "primary"
                ? "border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100/80"
                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            <span>{a.label}</span>
            {a.description ? <span className="mt-0.5 text-xs font-normal text-slate-500">{a.description}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export const PurchasingQuickActions = memo(PurchasingQuickActionsInner);
