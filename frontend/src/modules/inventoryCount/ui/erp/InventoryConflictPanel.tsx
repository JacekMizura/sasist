import type { InventoryConflictCount, InventoryConflictItem } from "@/api/inventoryCountApi";
import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "@/components/listPage/listSellasistTokens";
import { InventoryConflictStatusBadge, InventoryLocationStack } from "./InventoryLineBadges";
import { InventorySection } from "./InventoryPageShell";

type Props = {
  items: InventoryConflictItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  busy?: boolean;
  onAcceptCount?: (conflict: InventoryConflictItem, countId: number) => void;
  onRejectCount?: (conflict: InventoryConflictItem, countId: number) => void;
  onRequestRecount?: (conflict: InventoryConflictItem) => void;
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

function conflictCounts(item: InventoryConflictItem): InventoryConflictCount[] {
  if (item.counts?.length) return item.counts;
  return (item.operators ?? []).map((op, index) => ({
    count_id: index,
    user_id: op.user_id,
    operator_name: op.operator_name,
    counted_qty: op.quantity,
    created_at: op.counted_at,
    rejected: false,
  }));
}

function isUnresolved(conflict: InventoryConflictItem): boolean {
  const status = conflict.conflict_status;
  return status === "conflict_open" || status === "recount_requested" || status === "required";
}

const thClass = `${listSellasistTableHeaderCellGrid} bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500`;
const tdClass = `${listSellasistTableBodyCellGrid} align-top !py-3.5`;
const rowClass = "group transition-colors hover:bg-slate-50/90";

export default function InventoryConflictPanel({
  items,
  loading,
  error,
  onRetry,
  busy,
  onAcceptCount,
  onRejectCount,
  onRequestRecount,
}: Props) {
  if (loading) return <p className="px-4 py-4 text-sm text-slate-500">Wczytywanie konfliktów…</p>;

  if (error) {
    return (
      <InventorySection title="Konflikty liczenia">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="text-sm text-amber-800">{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Spróbuj ponownie
            </button>
          ) : null}
        </div>
      </InventorySection>
    );
  }

  if (items.length === 0) {
    return (
      <InventorySection title="Konflikty liczenia">
        <p className="px-4 py-4 text-sm text-slate-500">Brak konfliktów operatorów.</p>
      </InventorySection>
    );
  }

  return (
    <InventorySection title={`Konflikty liczenia (${items.length})`}>
      <p className="border-b border-slate-100 px-4 pb-3 text-sm text-slate-600">
        Panel decyzji supervisora — uznaj wynik operatora, odrzuć błędne liczenie lub wymuś ponowne liczenie.
      </p>
      <div className="min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr>
              <th className={`${thClass} min-w-[14rem] text-left`}>Produkt</th>
              <th className={`${thClass} text-left`}>Lokalizacja</th>
              <th className={`${thClass} text-left`}>Operator</th>
              <th className={`${thClass} text-right`}>Policzone</th>
              <th className={`${thClass} text-left`}>Czas</th>
              <th className={`${thClass} text-left`}>Akcje</th>
              <th className={`${thClass} text-left`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const counts = conflictCounts(c);
              const unresolved = isUnresolved(c);
              const rowSpan = Math.max(counts.length, 1);

              return counts.map((entry, index) => (
                <tr key={`${c.line_id}-${entry.count_id}`} className={rowClass}>
                  {index === 0 ? (
                    <>
                      <td className={tdClass} rowSpan={rowSpan}>
                        <div className="min-w-0 space-y-1">
                          <p className="text-base font-semibold text-slate-900">
                            {c.product_name ?? c.sku ?? `#${c.product_id}`}
                          </p>
                          {c.quantity_diff_label ? (
                            <span className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-900">
                              {c.quantity_diff_label}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={tdClass} rowSpan={rowSpan}>
                        <InventoryLocationStack
                          locationCode={c.location_name ?? `#${c.location_id}`}
                          carrierCode={c.carrier_code}
                        />
                      </td>
                    </>
                  ) : null}
                  <td className={tdClass}>
                    <span
                      className={`text-sm font-medium ${entry.rejected ? "text-slate-400 line-through" : "text-slate-800"}`}
                    >
                      {entry.operator_name}
                    </span>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <span
                      className={`text-lg font-bold tabular-nums ${entry.rejected ? "text-slate-400 line-through" : "text-slate-900"}`}
                    >
                      {fmtQty(entry.counted_qty)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <span className="text-xs tabular-nums text-slate-500">{fmtTime(entry.created_at)}</span>
                  </td>
                  <td className={tdClass}>
                    {unresolved && !entry.rejected ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAcceptCount?.(c, entry.count_id)}
                          className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Uznaj wynik
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRejectCount?.(c, entry.count_id)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Odrzuć
                        </button>
                      </div>
                    ) : entry.rejected ? (
                      <span className="text-xs text-slate-400">Odrzucono</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  {index === 0 ? (
                    <td className={tdClass} rowSpan={rowSpan}>
                      <div className="flex flex-col gap-2">
                        <InventoryConflictStatusBadge status={c.conflict_status} />
                        {unresolved ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onRequestRecount?.(c)}
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Wymuś ponowne liczenie
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </InventorySection>
  );
}
