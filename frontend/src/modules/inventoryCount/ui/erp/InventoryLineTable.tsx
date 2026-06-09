import { Clock, User } from "lucide-react";

import type { InventoryConflictItem, InventoryLineRead } from "@/api/inventoryCountApi";
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
  onAcceptQuantity,
  onRequestRecount,
}: {
  ln: InventoryLineRead;
  conflict?: InventoryConflictItem;
  conflictBusy?: boolean;
  onAcceptQuantity?: (conflict: InventoryConflictItem, quantity: number) => void;
  onRequestRecount?: (conflict: InventoryConflictItem) => void;
}) {
  const operators = conflict?.operators ?? [];
  const hasConflict = operators.length >= 2 && new Set(operators.map((o) => o.quantity)).size > 1;

  if (hasConflict) {
    return (
      <div className="inline-flex min-w-[8rem] flex-col items-end gap-1.5 text-right">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Policz.</span>
        {operators.map((op) => (
          <div key={`${op.user_id}-${op.operator_name}`} className="leading-tight">
            <span className="text-[11px] font-semibold uppercase text-slate-500">{op.operator_name}</span>
            <span className="ml-2 text-lg font-bold tabular-nums text-slate-900">{fmtQty(op.quantity)}</span>
          </div>
        ))}
        {conflict?.recount_state === "required" ? (
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {operators.map((op) => (
              <button
                key={`accept-${op.user_id}`}
                type="button"
                disabled={conflictBusy}
                onClick={() => onAcceptQuantity?.(conflict, op.quantity)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Zatwierdź {fmtQty(op.quantity)}
              </button>
            ))}
            <button
              type="button"
              disabled={conflictBusy}
              onClick={() => onRequestRecount?.(conflict)}
              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              Recount
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

function OperatorCell({ ln, conflict }: { ln: InventoryLineRead; conflict?: InventoryConflictItem }) {
  const operators = conflict?.operators ?? [];
  const hasConflict = operators.length >= 2 && new Set(operators.map((o) => o.quantity)).size > 1;

  if (hasConflict) {
    return (
      <div className="space-y-1 text-xs text-slate-600">
        {operators.map((op) => (
          <div key={`${op.user_id}-${op.operator_name}`} className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="font-medium text-slate-700">{op.operator_name}</span>
          </div>
        ))}
      </div>
    );
  }

  if (ln.last_counted_by_name) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs leading-snug text-slate-600">
        <User className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        <span className="font-medium text-slate-700">{ln.last_counted_by_name}</span>
      </span>
    );
  }

  return <span className="text-xs text-slate-400">—</span>;
}

type Props = {
  lines: InventoryLineRead[];
  conflicts?: InventoryConflictItem[];
  loading?: boolean;
  conflictBusy?: boolean;
  emptyMessage?: string;
  onAcceptQuantity?: (conflict: InventoryConflictItem, quantity: number) => void;
  onRequestRecount?: (conflict: InventoryConflictItem) => void;
};

/** Inventory lines — warehouse-native table (presentation only). */
export default function InventoryLineTable({
  lines,
  conflicts = [],
  loading,
  conflictBusy,
  emptyMessage = "Brak pozycji.",
  onAcceptQuantity,
  onRequestRecount,
}: Props) {
  const conflictByLineId = new Map(conflicts.map((c) => [c.line_id, c]));

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-500">Wczytywanie pozycji…</p>;
  }
  if (lines.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

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
            <th className={`${thClass} text-left`}>Operator</th>
            <th className={`${thClass} text-left`}>Czas</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((ln) => {
            const conflict = conflictByLineId.get(ln.id);
            const operators = conflict?.operators ?? [];
            const hasConflict = operators.length >= 2 && new Set(operators.map((o) => o.quantity)).size > 1;

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
                    onAcceptQuantity={onAcceptQuantity}
                    onRequestRecount={onRequestRecount}
                  />
                </td>
                <td className={`${tdClass} text-right`}>
                  <DifferenceCell ln={ln} />
                </td>
                <td className={tdClass}>
                  <div className="flex flex-wrap gap-1.5">
                    {hasConflict ? <InventoryConflictStatusBadge /> : <InventoryLineStatusBadge line={ln} />}
                    {ln.recount_count > 0 && ln.recount_state !== "required" ? (
                      <span className="inline-flex items-center rounded-full border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        ×{ln.recount_count} ponowne
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className={tdClass}>
                  <OperatorCell ln={ln} conflict={conflict} />
                </td>
                <td className={tdClass}>
                  <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    {fmtTime(ln.last_counted_at)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
