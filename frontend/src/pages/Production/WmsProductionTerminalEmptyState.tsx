import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
};

/** Centered empty queue — same vertical rhythm as other WMS terminal hub pages. */
export function WmsProductionTerminalEmptyState({ title, description, icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in duration-300">
      {icon ? (
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 text-slate-300 shadow-sm">
          {icon}
        </div>
      ) : null}
      <h3 className="mb-2 text-xl font-black text-slate-900">{title}</h3>
      {description ? (
        <p className="max-w-md text-sm font-medium text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}
