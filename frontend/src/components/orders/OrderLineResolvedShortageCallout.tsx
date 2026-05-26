import type { ResolvedShortageLineMeta } from "./orderLineResolvedShortage";
import { fmtOmsQty } from "./omsFulfillmentLinePresentation";
import { resolvedShortageBadgeLabel } from "./orderLineResolvedShortage";

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
      className={`rounded-lg border border-rose-200/90 bg-rose-50/90 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}
      role="status"
    >
      <span className="inline-flex rounded-full border border-rose-400 bg-rose-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-950">
        {badge}
      </span>
      <p className={`mt-1.5 font-medium text-rose-950 ${compact ? "text-[11px]" : "text-xs"}`}>
        Usunięto podczas obsługi braków.
      </p>
      <dl className={`mt-1 space-y-0.5 text-rose-900/90 ${compact ? "text-[10px]" : "text-[11px]"}`}>
        <div className="flex flex-wrap gap-x-1">
          <dt className="font-semibold">Powód:</dt>
          <dd>{meta.reason}</dd>
        </div>
        {meta.resolvedBy ? (
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-semibold">Rozwiązane przez:</dt>
            <dd>{meta.resolvedBy}</dd>
          </div>
        ) : null}
        {dateLabel ? (
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-semibold">Data rozwiązania:</dt>
            <dd>{dateLabel}</dd>
          </div>
        ) : null}
        {meta.removedQty != null && meta.removedQty > 0 ? (
          <div className="flex flex-wrap gap-x-1">
            <dt className="font-semibold">Usunięto z zamówienia:</dt>
            <dd className="tabular-nums">
              {fmtOmsQty(meta.removedQty)} szt.
              {meta.quantityBefore != null ? ` (z ${fmtOmsQty(meta.quantityBefore)} zamówionych)` : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
