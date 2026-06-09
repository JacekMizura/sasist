import type { ReactNode } from "react";

import PageLayout from "../../components/layout/PageLayout";
import { catalogEntityCardShellClass } from "../../components/catalog/CatalogEntityPageShell";

type WarehouseEntityPageShellProps = {
  children: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  loadingLabel?: string;
};

/**
 * Biały shell karty encji — jak produkt/zestaw, bez szarego tła strony.
 */
export function WarehouseEntityPageShell({
  children,
  loading = false,
  error,
  loadingLabel = "Ładowanie…",
}: WarehouseEntityPageShellProps) {
  return (
    <PageLayout omitCard fullBleed>
      <div className="w-full bg-white pb-6 pt-1 font-sans text-base antialiased">
        <div className="w-full max-w-none px-2 sm:px-3 lg:px-4">
          {loading ? (
            <div className={catalogEntityCardShellClass}>
              <div className="flex min-h-[40vh] items-center justify-center gap-2 px-4 py-16 text-slate-500">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                {loadingLabel}
              </div>
            </div>
          ) : error ? (
            <div className={`${catalogEntityCardShellClass} p-4 sm:p-6`}>{error}</div>
          ) : (
            <div className={catalogEntityCardShellClass}>{children}</div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
