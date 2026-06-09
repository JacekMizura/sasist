import type { ReactNode } from "react";

import { appSectionTitleClass } from "./appShellTokens";

export type AppSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
};

export function AppSection({ title, children, className = "", action }: AppSectionProps) {
  return (
    <section className={`rounded-lg border border-slate-200/90 bg-white p-3 shadow-none ${className}`.trim()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className={appSectionTitleClass}>{title}</h3>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
