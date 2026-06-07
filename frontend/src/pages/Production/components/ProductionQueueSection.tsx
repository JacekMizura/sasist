import type { ProductionBatchSummaryRead } from "../../../api/productionApi";
import type { QueueSectionConfig } from "../productionTheme";
import { BatchCard } from "./BatchCard";
import { ProductionEmptyState } from "./ProductionEmptyState";

type Props = {
  config: QueueSectionConfig;
  batches: ProductionBatchSummaryRead[];
  showActions?: boolean;
  onCreateBatch?: () => void;
  onStartCollecting?: (id: number) => void;
  onContinue?: (id: number, status: string) => void;
};

export function ProductionQueueSection({
  config,
  batches,
  showActions = true,
  onCreateBatch,
  onStartCollecting,
  onContinue,
}: Props) {
  const Icon = config.icon;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100">
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 ${config.headerClass}`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
            <Icon className="h-5 w-5 text-violet-700" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">{config.title}</h2>
            <p className="text-xs text-slate-500">{config.subtitle}</p>
          </div>
        </div>
        <span
          className={`inline-flex min-w-[2rem] items-center justify-center rounded-full px-3 py-1 text-sm font-bold tabular-nums ${config.countClass}`}
        >
          {batches.length}
        </span>
      </div>

      {batches.length === 0 ? (
        <div className="p-5">
          <ProductionEmptyState
            icon={Icon}
            title={config.emptyTitle}
            description={config.emptyDescription}
            action={
              config.emptyCta && onCreateBatch ? (
                <button
                  type="button"
                  onClick={onCreateBatch}
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-violet-700"
                >
                  {config.emptyCta}
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {batches.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              showActions={showActions}
              onStartCollecting={onStartCollecting}
              onContinue={onContinue}
            />
          ))}
        </div>
      )}
    </section>
  );
}
