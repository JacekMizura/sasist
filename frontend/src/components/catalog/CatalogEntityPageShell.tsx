import type { ReactNode } from "react";

import PageLayout from "../layout/PageLayout";
import { pageShellSurfaceClass } from "../../design-system/pageLayout";

/** @deprecated Prefer PageContainer / pageShellSurfaceClass — kept for callers that only need the class. */
const CARD_SHELL = `${pageShellSurfaceClass} overflow-hidden`;

type CatalogEntityPageShellProps = {
  children: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  loadingLabel?: string;
  /** Edge-to-edge main column (product edit HTML mock — no inset white card). */
  flush?: boolean;
};

/** Outer page chrome shared by product / bundle / future catalog entities — Layout 2.0 one shell. */
export function CatalogEntityPageShell({
  children,
  loading = false,
  error,
  loadingLabel = "Ładowanie…",
  flush = false,
}: CatalogEntityPageShellProps) {
  return (
    <PageLayout
      fullBleed
      flush={flush}
      className={flush ? "!p-0" : undefined}
      cardClassName={flush ? undefined : "overflow-hidden p-0 space-y-0"}
    >
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center gap-2 px-4 py-16 text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          {loadingLabel}
        </div>
      ) : error ? (
        <div className="p-4 sm:p-6">{error}</div>
      ) : (
        children
      )}
    </PageLayout>
  );
}

export { CARD_SHELL as catalogEntityCardShellClass };
