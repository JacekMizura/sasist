import { useMemo } from "react";

import type { InventoryAuditEventRead, InventoryDocumentTimelines } from "@/api/inventoryCountApi";
import {
  buildInventoryAuditTimeline,
  formatInventoryAuditTimestamp,
  type InventoryAuditTimelineEntry,
} from "../../inventoryAuditEventLabels";
import type { InventoryTableFilters } from "../../inventoryTableFilters";
import { filterAuditTimeline } from "../../inventoryTableFilters";
import { InventoryProductThumb } from "./InventoryLineBadges";
import { InventorySection } from "./InventoryPageShell";
import InventoryTableFilterBar from "./InventoryTableFilterBar";

type Props = {
  auditLog: InventoryAuditEventRead[];
  timelines: InventoryDocumentTimelines | null;
  loading?: boolean;
  filters?: InventoryTableFilters;
  onFiltersChange?: (filters: InventoryTableFilters) => void;
};

function TimelineRow({ entry }: { entry: InventoryAuditTimelineEntry }) {
  const hasProduct = Boolean(entry.productName || entry.productEan || entry.productImageUrl);
  const showThumb = hasProduct;

  return (
    <tr className="align-top hover:bg-slate-50/80">
      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
        {formatInventoryAuditTimestamp(entry.timestamp)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{entry.userName}</td>
      <td className="px-3 py-2">
        <p className="font-semibold text-slate-900">{entry.title}</p>
        {entry.locationCode ? (
          <p className="mt-0.5 text-[11px] text-slate-500">Lokalizacja: {entry.locationCode}</p>
        ) : null}
        {entry.note ? <p className="mt-0.5 text-[11px] text-slate-600">{entry.note}</p> : null}
      </td>
      <td className="px-3 py-2">
        {hasProduct ? (
          <div className="flex min-w-0 items-start gap-2">
            {showThumb ? (
              <InventoryProductThumb url={entry.productImageUrl} name={entry.productName} />
            ) : null}
            <div className="min-w-0">
              {entry.productName ? (
                <p className="line-clamp-2 font-medium text-slate-900">{entry.productName}</p>
              ) : null}
              {entry.productEan ? (
                <p className="text-[11px] text-slate-500">EAN: {entry.productEan}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {entry.qtyDelta ? (
          <span
            className={
              entry.qtyDelta.startsWith("+")
                ? "font-semibold tabular-nums text-emerald-700"
                : entry.qtyDelta.startsWith("−")
                  ? "font-semibold tabular-nums text-rose-700"
                  : "tabular-nums text-slate-700"
            }
          >
            {entry.qtyDelta}
          </span>
        ) : entry.qtyRange ? (
          <span className="tabular-nums text-slate-700">{entry.qtyRange}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

export default function InventoryAuditPanel({
  auditLog,
  timelines,
  loading,
  filters,
  onFiltersChange,
}: Props) {
  const entries = useMemo(() => {
    const built = buildInventoryAuditTimeline(auditLog, timelines);
    if (!filters) return built;
    return filterAuditTimeline(built, filters);
  }, [auditLog, timelines, filters]);

  if (loading) return <p className="py-3 text-xs text-slate-500">Wczytywanie kontroli…</p>;

  return (
    <InventorySection title="Oś czasu operacyjna">
      {filters && onFiltersChange ? (
        <InventoryTableFilterBar filters={filters} onChange={onFiltersChange} showDifferenceToggle={false} />
      ) : null}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="px-3 py-2 text-left font-bold">Czas</th>
              <th className="px-3 py-2 text-left font-bold">Operator</th>
              <th className="px-3 py-2 text-left font-bold">Operacja</th>
              <th className="px-3 py-2 text-left font-bold">Szczegóły</th>
              <th className="px-3 py-2 text-right font-bold">Ilość</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Brak zdarzeń w historii dokumentu.
                </td>
              </tr>
            ) : (
              entries.map((entry) => <TimelineRow key={entry.id} entry={entry} />)
            )}
          </tbody>
        </table>
      </div>
    </InventorySection>
  );
}
