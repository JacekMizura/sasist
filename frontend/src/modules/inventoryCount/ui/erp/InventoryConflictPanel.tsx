import type { InventoryConflictCount, InventoryConflictItem } from "@/api/inventoryCountApi";
import {
  InventoryConflictProductMini,
  InventoryConflictStatusBadge,
  InventoryLocationStack,
} from "./InventoryLineBadges";
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

function fmtOperatorTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
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
  const status = String(conflict.conflict_status ?? "").toLowerCase();
  return status === "conflict_open" || status === "recount_requested" || status === "required";
}

/** Recount action only while conflict is open — not after recount already requested. */
function canRequestRecount(conflict: InventoryConflictItem): boolean {
  const status = String(conflict.conflict_status ?? "").toLowerCase();
  return status === "conflict_open" || status === "required";
}

function ConflictCard({
  conflict,
  busy,
  onAcceptCount,
  onRejectCount,
  onRequestRecount,
}: {
  conflict: InventoryConflictItem;
  busy?: boolean;
  onAcceptCount?: (conflict: InventoryConflictItem, countId: number) => void;
  onRejectCount?: (conflict: InventoryConflictItem, countId: number) => void;
  onRequestRecount?: (conflict: InventoryConflictItem) => void;
}) {
  const counts = conflictCounts(conflict);
  const unresolved = isUnresolved(conflict);
  const showRecount = canRequestRecount(conflict);
  const name = conflict.product_name ?? conflict.sku ?? `#${conflict.product_id}`;
  const ean = conflict.ean?.trim();
  const sku = conflict.sku?.trim();

  return (
    <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start gap-4 border-b border-slate-100 p-5">
        <InventoryConflictProductMini url={conflict.product_image_url} name={conflict.product_name} />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-bold leading-snug text-slate-900">{name}</h3>
          {ean ? <p className="font-mono text-sm text-slate-600">EAN {ean}</p> : null}
          {sku ? (
            <p className="font-mono text-xs text-slate-500" title={sku}>
              SKU {sku}
            </p>
          ) : null}
          {conflict.quantity_diff_label ? (
            <span className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900">
              {conflict.quantity_diff_label}
            </span>
          ) : null}
        </div>
        <InventoryLocationStack
          locationCode={conflict.location_name ?? `#${conflict.location_id}`}
          carrierCode={conflict.carrier_code}
        />
      </div>

      <div className="px-5">
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(5rem,auto)_minmax(4rem,auto)_auto] gap-4 border-b border-slate-100 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:grid">
          <span>Operator</span>
          <span>Ilość</span>
          <span>Czas</span>
          <span className="text-right">Akcje</span>
        </div>

        <ul className="divide-y divide-slate-100">
          {counts.map((entry) => {
            const rejected = Boolean(entry.rejected);
            const showActions = unresolved && !rejected;

            return (
              <li
                key={`${conflict.line_id}-${entry.count_id}`}
                className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(5rem,auto)_minmax(4rem,auto)_auto] sm:items-center sm:gap-4"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:hidden">
                    Operator
                  </p>
                  <p
                    className={`text-sm font-semibold ${rejected ? "text-slate-400 line-through" : "text-slate-900"}`}
                  >
                    {entry.operator_name}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:hidden">Ilość</p>
                  <p
                    className={`text-2xl font-black tabular-nums ${rejected ? "text-slate-400 line-through" : "text-slate-900"}`}
                  >
                    {fmtQty(entry.counted_qty)}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:hidden">Czas</p>
                  <p className="text-xs tabular-nums text-slate-400">{fmtOperatorTime(entry.created_at)}</p>
                </div>

                <div className="sm:text-right">
                  {showActions ? (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onAcceptCount?.(conflict, entry.count_id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Uznaj wynik
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRejectCount?.(conflict, entry.count_id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Odrzuć
                      </button>
                    </div>
                  ) : rejected ? (
                    <span className="text-xs font-medium text-slate-400">Odrzucono</span>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Status:</span>
          <InventoryConflictStatusBadge status={conflict.conflict_status} />
        </div>
        {showRecount ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRequestRecount?.(conflict)}
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Zleć ponowne liczenie
          </button>
        ) : null}
      </div>
    </article>
  );
}

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
        Panel decyzji supervisora — uznaj wynik operatora, odrzuć błędne liczenie lub zleć ponowne liczenie.
      </p>
      <div className="space-y-4 p-4">
        {items.map((c) => (
          <ConflictCard
            key={c.line_id}
            conflict={c}
            busy={busy}
            onAcceptCount={onAcceptCount}
            onRejectCount={onRejectCount}
            onRequestRecount={onRequestRecount}
          />
        ))}
      </div>
    </InventorySection>
  );
}
