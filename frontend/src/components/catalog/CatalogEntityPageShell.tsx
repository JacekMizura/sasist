import type { ReactNode } from "react";

import PageLayout from "../layout/PageLayout";

const CARD_SHELL =
  "overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_40px_-12px_rgba(15,23,42,0.07)]";

type CatalogEntityPageShellProps = {
  children: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  loadingLabel?: string;
};

/** Outer page chrome shared by product / bundle / future catalog entities. */
export function CatalogEntityPageShell({
  children,
  loading = false,
  error,
  loadingLabel = "Ładowanie…",
}: CatalogEntityPageShellProps) {
  return (
    <PageLayout omitCard fullBleed>
      <div className="w-full bg-white pb-8 pt-2 font-sans text-base antialiased">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className={CARD_SHELL}>
              <div className="flex min-h-[40vh] items-center justify-center gap-2 px-4 py-16 text-slate-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                {loadingLabel}
              </div>
            </div>
          ) : error ? (
            <div className={`${CARD_SHELL} p-4 sm:p-6`}>{error}</div>
          ) : (
            <div className={CARD_SHELL}>{children}</div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export { CARD_SHELL as catalogEntityCardShellClass };
