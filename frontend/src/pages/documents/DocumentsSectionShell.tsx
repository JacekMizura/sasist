import type { ReactNode } from "react";

import { PageHeader, typography } from "@/design-system";

type Props = {
  title: string;
  subtitle?: string;
  /** Right side: primary actions (e.g. dodaj, import). */
  actions?: ReactNode;
  /** Optional analytics row below header (KPI). */
  kpi?: ReactNode;
  /** Filters / search row. */
  toolbar?: ReactNode;
  children: ReactNode;
};

/**
 * Documents section chrome — same vertical rhythm as Design System {@link PageHeader}:
 * Title + Actions → Separator → KPI / Toolbar → Content.
 */
export function DocumentsSectionShell({ title, subtitle, actions, kpi, toolbar, children }: Props) {
  const belowSeparator =
    kpi || toolbar ? (
      <div className={kpi && toolbar ? "space-y-4" : undefined}>
        {kpi}
        {toolbar}
      </div>
    ) : null;

  return (
    <PageHeader
      title={
        <div className="min-w-0">
          <h2 className={typography.h1}>{title}</h2>
          {subtitle ? <p className={`mt-1 ${typography.pageDesc}`}>{subtitle}</p> : null}
        </div>
      }
      actions={actions}
      toolbar={belowSeparator}
    >
      {children}
    </PageHeader>
  );
}
