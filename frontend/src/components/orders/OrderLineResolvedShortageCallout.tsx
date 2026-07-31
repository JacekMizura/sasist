import type { ResolvedShortageLineMeta } from "./orderLineResolvedShortage";
import { fmtOmsQty } from "./omsFulfillmentLinePresentation";
import { resolvedShortageBadgeLabel, resolvedShortageHeadline } from "./orderLineResolvedShortage";

type Props = {
  meta: ResolvedShortageLineMeta;
  formatDetailDate: (iso: string | null | undefined) => string;
  compact?: boolean;
};

export function OrderLineResolvedShortageCallout({ meta, formatDetailDate, compact = false }: Props) {
  const badge = resolvedShortageBadgeLabel(meta);
  const dateLabel = meta.resolvedAt.trim() ? formatDetailDate(meta.resolvedAt) : null;

  return (
    <div
      className={`rounded-md border border-rose-200 bg-rose-50/95 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
      role="status"
    >
      <span className="inline-flex rounded-full border border-rose-300 bg-rose-100/90 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-950">
        {badge}
      </span>
      <p className={`mt-1.5 font-medium text-rose-950 ${compact ? "text-[11px]" : "text-xs"}`}>
        {resolvedShortageHeadline(meta)}
      </p>
      <dl
        className={`mt-1.5 grid gap-x-4 gap-y-1 text-rose-900/90 sm:grid-cols-2 ${compact ? "text-[10px]" : "text-[11px]"}`}
      >
        <div className="min-w-0">
          <dt className="inline text-rose-700/80">Powód: </dt>
          <dd className="inline font-medium text-rose-950">{meta.reason}</dd>
        </div>
        {meta.resolvedBy ? (
          <div className="min-w-0">
            <dt className="inline text-rose-700/80">Rozwiązane przez: </dt>
            <dd className="inline font-medium text-rose-950">{meta.resolvedBy}</dd>
          </div>
        ) : null}
        {dateLabel ? (
          <div className="min-w-0">
            <dt className="inline text-rose-700/80">Data rozwiązania: </dt>
            <dd className="inline font-medium text-rose-950">{dateLabel}</dd>
          </div>
        ) : null}
        {meta.removedQty != null && meta.removedQty > 0 ? (
          <div className="min-w-0">
            <dt className="inline text-rose-700/80">Usunięto z zamówienia: </dt>
            <dd className="inline font-medium tabular-nums text-rose-950">
              {fmtOmsQty(meta.removedQty)} szt.
              {meta.quantityBefore != null ? ` (z ${fmtOmsQty(meta.quantityBefore)} zamówionych)` : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
