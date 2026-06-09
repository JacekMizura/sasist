import { Clock, User } from "lucide-react";

import type {
  InventoryConflictCount,
  InventoryConflictItem,
  InventoryLineRead,
} from "@/api/inventoryCountApi";
import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "@/components/listPage/listSellasistTokens";
import {
  InventoryConflictStatusBadge,
  InventoryLineStatusBadge,
  InventoryLocationStack,
  InventoryProductThumb,
} from "./InventoryLineBadges";

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function conflictCounts(conflict?: InventoryConflictItem): InventoryConflictCount[] {
  if (!conflict) return [];
  if (conflict.counts?.length) return conflict.counts;
  return (conflict.operators ?? []).map((op, index) => ({
    count_id: index,
    user_id: op.user_id,
    operator_name: op.operator_name,
    counted_qty: op.quantity,
    created_at: op.counted_at,
  }));
}

function hasOperatorQuantityConflict(conflict?: InventoryConflictItem): boolean {
  const counts = conflictCounts(conflict);
  return counts.length >= 2 && new Set(counts.map((c) => c.counted_qty)).size > 1;
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
}

const thClass = `${listSellasistTableHeaderCellGrid} bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500`;
const tdClass = `${listSellasistTableBodyCellGrid} align-top !py-3.5`;
const rowClass = "group transition-colors hover:bg-slate-50/90";

function QtyCell({
  label,
  value,
  emphasis = "normal",
}: {
  label: string;
  value: string | number;
  emphasis?: "normal" | "strong" | "danger";
}) {
  const valueCls =
    emphasis === "danger"
      ? "text-lg font-bold tabular-nums text-red-700"
      : emphasis === "strong"
        ? "text-lg font-semibold tabular-nums text-slate-900"
        : "text-lg font-medium tabular-nums text-slate-700";

  return (
    <div className="inline-flex min-w-[4rem] flex-col items-end gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className={valueCls}>{value}</span>
    </div>
  );
}

function ProductCell({ ln }: { ln: InventoryLineRead }) {
  const ean = ln.ean?.trim();
  const sku = ln.sku?.trim();
  const name = ln.product_name ?? ln.sku ?? `#${ln.product_id}`;

  return (
    <div className="flex min-w-[260px] max-w-[24rem] items-start gap-4">
      <InventoryProductThumb url={ln.product_image_url} name={ln.product_name} />
      <div className="min-w-0 flex flex-col gap-1">
        <p className="text-base font-semibold leading-snug text-slate-900">{name}</p>
        {ean ? <p className="font-mono text-sm text-slate-700">EAN {ean}</p> : null}
        {sku ? (
          <p className="truncate font-mono text-xs text-slate-500" title={sku}>
            SKU {sku}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CountedCell({
  ln,
  conflict,
  conflictBusy,
  onAcceptCount,
  onRequestRecount,
}: {
  ln: InventoryLineRead;
  conflict?: InventoryConflictItem;
  conflictBusy?: boolean;
  onAcceptCount?: (conflict: InventoryConflictItem, countId: number) => void;
  onRequestRecount?: (conflict: InventoryConflictItem) => void;
}) {
  const hasConflict = hasOperatorQuantityConflict(conflict);

  if (hasConflict) {
    const counts = conflictCounts(conflict);
    const unresolved = conflict?.conflict_status === "required" || conflict?.recount_state === "required";

    return (
      <div className="inline-flex min-w-[8rem] flex-col items-end gap-1.5 text-right">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Policz.</span>
        {counts.map((entry) => (
          <div key={entry.count_id} className="leading-tight">
            <span className="text-[11px] font-semibold uppercase text-slate-500">{entry.operator_name}</span>
            <span className="ml-2 text-lg font-bold tabular-nums text-slate-900">{fmtQty(entry.counted_qty)}</span>
          </div>
        ))}
        {unresolved ? (
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {counts.map((entry) => (
              <button
                key={`accept-${entry.count_id}`}
                type="button"
                disabled={conflictBusy}
                onClick={() => onAcceptCount?.(conflict!, entry.count_id)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Zatwierdź {fmtQty(entry.counted_qty)}
              </button>
            ))}
            <button
              type="button"
              disabled={conflictBusy}
              onClick={() => onRequestRecount?.(conflict!)}
              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Ponowne liczenie
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return <QtyCell label="Policz." value={ln.counted_quantity ?? "—"} emphasis="strong" />;
}

function DifferenceCell({ ln }: { ln: InventoryLineRead }) {
  const diff = ln.difference_quantity;
  const hasDiff = diff != null && Math.abs(diff) > 1e-9;

  return (
    <div className="inline-flex min-w-[4rem] flex-col items-end gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Różn.</span>
      {hasDiff ? (
        <span className="inline-flex rounded-full border border-red-200/90 bg-red-50 px-2.5 py-1 text-base font-bold tabular-nums text-red-800">
          {diff}
        </span>
      ) : (
        <span className="text-lg font-medium tabular-nums text-slate-500">{diff ?? "—"}</span>
      )}
    </div>
  );
}

function OperatorTimeCell({ ln, conflict }: { ln: InventoryLineRead; conflict?: InventoryConflictItem }) {
  const hasConflict = hasOperatorQuantityConflict(conflict);

  if (hasConflict) {
    const counts = conflictCounts(conflict);
    return (
      <div className="flex flex-col gap-2">
        <StackedLabels
          items={counts.map((entry) => ({
            key: entry.count_id,
            primary: entry.operator_name,
            secondary: fmtTime(entry.created_at),
          }))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {ln.last_counted_by_name ? (
        <span className="inline-flex items-center gap-1.5 text-xs leading-snug text-slate-600">
          <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="font-medium text-slate-700">{ln.last_counted_by_name}</span>
        </span>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      )}
      <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
        <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        {fmtTime(ln.last_counted_at)}
      </span>
    </div>
  );
}

function StackedLabels({
  items,
}: {
  items: Array<{ key: number; primary: string; secondary: string }>;
}) {
  return (
    <>
      {items.map((item) => (
        <div key={item.key} className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {item.primary}
          </span>
          <span className="inline-flex items-center gap-1.5 pl-5 text-xs tabular-nums text-slate-500">
            <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            {item.secondary}
          </span>
        </div>
      ))}
    </>
  );
}

function StatusCell({ ln, conflict }: { ln: InventoryLineRead; conflict?: InventoryConflictItem }) {
  const hasConflict = hasOperatorQuantityConflict(conflict);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasConflict ? (
        <>
          <InventoryConflictStatusBadge />
          {conflict?.quantity_diff_label ? (
            <span className="inline-flex rounded-full border border-amber-200/90 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900">
              {conflict.quantity_diff_label}
            </span>
          ) : null}
        </>
      ) : (
        <InventoryLineStatusBadge line={ln} />
      )}
      {ln.recount_count > 0 && ln.recount_state !== "required" ? (
        <span className="inline-flex items-center rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
          ×{ln.recount_count} ponowne
        </span>
      ) : null}
    </div>
  );
}

type Props = {
  lines: InventoryLineRead[];
  conflicts?: InventoryConflictItem[];
  loading?: boolean;
  conflictBusy?: boolean;
  emptyMessage?: string;
  onAcceptCount?: (conflict: InventoryConflictItem, countId: number) => void;
  onRequestRecount?: (conflict: InventoryConflictItem) => void;
};

/** Inventory lines — warehouse-native table (presentation only). */
export default function InventoryLineTable({
  lines,
  conflicts = [],
  loading,
  conflictBusy,
  emptyMessage = "Brak pozycji.",
  onAcceptCount,
  onRequestRecount,
}: Props) {
  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">Wczytywanie pozycji…</p>;
  }
  if (lines.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  const conflictByLineId = new Map(conflicts.map((c) => [c.line_id, c]));

  return (
    <div className="min-w-0 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr>
            <th className={`${thClass} min-w-[18rem] text-left`}>Produkt</th>
            <th className={`${thClass} text-left`}>Lokalizacja</th>
            <th className={`${thClass} text-right`}>Oczek.</th>
            <th className={`${thClass} text-right`}>Policz.</th>
            <th className={`${thClass} text-right`}>Różn.</th>
            <th className={`${thClass} text-left`}>Status</th>
            <th className={`${thClass} text-left`}>Operator / czas</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => {
            const conflict = conflictByLineId.get(ln.id);
            return (
              <tr key={ln.id} className={rowClass}>
                <td className={tdClass}>
                  <ProductCell ln={ln} />
                </td>
                <td className={tdClass}>
                  <InventoryLocationStack
                    locationCode={ln.location_name ?? `#${ln.location_id}`}
                    carrierCode={ln.carrier_code}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <QtyCell label="Oczek." value={ln.expected_quantity ?? "—"} />
                </td>
                <td className={`${tdClass} text-right`}>
                  <CountedCell
                    ln={ln}
                    conflict={conflict}
                    conflictBusy={conflictBusy}
                    onAcceptCount={onAcceptCount}
                    onRequestRecount={onRequestRecount}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <DifferenceCell ln={ln} />
                </td>
                <td className={tdClass}>
                  <StatusCell ln={ln} conflict={conflict} />
                </td>
                <td className={tdClass}>
                  <OperatorTimeCell ln={ln} conflict={conflict} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
