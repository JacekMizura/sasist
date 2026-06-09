import type { ReactNode } from "react";

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
  }));
}

const thClass = `${listSellasistTableHeaderCellGrid} bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500`;
const tdClass = `${listSellasistTableBodyCellGrid} align-top !py-3.5`;
const rowClass = "group transition-colors hover:bg-slate-50/90";

function StackedCell({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

export default function InventoryConflictPanel({
  items,
  loading,
  error,
  onRetry,
  busy,
  onAcceptCount,
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
      <div className="min-w-0 overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr>
              <th className={`${thClass} min-w-[14rem] text-left`}>Produkt</th>
              <th className={`${thClass} text-left`}>Lokalizacja</th>
              <th className={`${thClass} text-left`}>Operatorzy</th>
              <th className={`${thClass} text-right`}>Policzone</th>
              <th className={`${thClass} text-left`}>Czas</th>
              <th className={`${thClass} text-left`}>Status</th>
              <th className={`${thClass} text-left`}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const counts = conflictCounts(c);
              const unresolved = c.conflict_status === "required" || c.recount_state === "required";

              return (
                <tr key={c.line_id} className={rowClass}>
                  <td className={tdClass}>
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
                  <td className={tdClass}>
                    <InventoryLocationStack
                      locationCode={c.location_name ?? `#${c.location_id}`}
                      carrierCode={c.carrier_code}
                    />
                  </td>
                  <td className={tdClass}>
                    <StackedCell>
                      {counts.map((entry) => (
                        <span key={entry.count_id} className="text-sm font-medium text-slate-700">
                          {entry.operator_name}
                        </span>
                      ))}
                    </StackedCell>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <StackedCell>
                      {counts.map((entry) => (
                        <span
                          key={entry.count_id}
                          className="text-right text-lg font-bold tabular-nums text-slate-900"
                        >
                          {fmtQty(entry.counted_qty)}
                        </span>
                      ))}
                    </StackedCell>
                  </td>
                  <td className={tdClass}>
                    <StackedCell>
                      {counts.map((entry) => (
                        <span key={entry.count_id} className="text-xs tabular-nums text-slate-500">
                          {fmtTime(entry.created_at)}
                        </span>
                      ))}
                    </StackedCell>
                  </td>
                  <td className={tdClass}>
                    <InventoryConflictStatusBadge />
                  </td>
                  <td className={tdClass}>
                    {unresolved ? (
                      <div className="flex flex-wrap gap-2">
                        {counts.map((entry) => (
                          <button
                            key={`accept-${entry.count_id}`}
                            type="button"
                            disabled={busy}
                            onClick={() => onAcceptCount?.(c, entry.count_id)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Zatwierdź {fmtQty(entry.counted_qty)}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onRequestRecount?.(c)}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Wymuś ponowne liczenie
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Rozwiązany</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </InventorySection>
  );
}
