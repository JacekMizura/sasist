import type { ReactNode } from "react";

import PageLayout from "../../components/layout/PageLayout";

type WarehouseEntityPageShellProps = {
  children: ReactNode;
  loading?: boolean;
  error?: ReactNode;
  loadingLabel?: string;
};

/**
 * Shell encji magazynu — Layout 2.0: jeden PageContainer (jak katalog produktów).
 */
export function WarehouseEntityPageShell({
  children,
  loading = false,
  error,
  loadingLabel = "Ładowanie…",
}: WarehouseEntityPageShellProps) {
  return (
    <PageLayout fullBleed cardClassName="overflow-hidden p-0 space-y-0">
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center gap-2 px-4 py-16 text-slate-500">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
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
