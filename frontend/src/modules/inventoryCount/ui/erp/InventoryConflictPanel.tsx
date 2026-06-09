import type { InventoryConflictItem } from "@/api/inventoryCountApi";
import { InventoryConflictStatusBadge, InventoryLocationStack } from "./InventoryLineBadges";
import { InventorySection } from "./InventoryPageShell";

type Props = {
  items: InventoryConflictItem[];
  loading?: boolean;
  busy?: boolean;
  onAcceptQuantity?: (conflict: InventoryConflictItem, quantity: number) => void;
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

export default function InventoryConflictPanel({
  items,
  loading,
  busy,
  onAcceptQuantity,
  onRequestRecount,
}: Props) {
  if (loading) return <p className="px-4 py-4 text-sm text-slate-500">Wczytywanie konfliktów…</p>;

  if (items.length === 0) {
    return (
      <InventorySection title="Konflikty liczenia">
        <p className="px-4 py-4 text-sm text-slate-500">Brak konfliktów operatorów.</p>
      </InventorySection>
    );
  }

  return (
    <InventorySection title={`Konflikty liczenia (${items.length})`}>
      <div className="divide-y divide-slate-100">
        {items.map((c) => (
          <div key={c.line_id} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-base font-semibold text-slate-900">{c.product_name ?? c.sku ?? `#${c.product_id}`}</p>
                <InventoryLocationStack locationCode={c.location_name ?? `#${c.location_id}`} carrierCode={c.carrier_code} />
              </div>
              <InventoryConflictStatusBadge />
            </div>

            <div className="mt-3 space-y-2">
              {c.operators.map((op) => (
                <div key={`${op.user_id}-${op.operator_name}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{op.operator_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold tabular-nums text-slate-900">{fmtQty(op.quantity)} szt.</span>
                    <span className="text-xs tabular-nums text-slate-500">{fmtTime(op.counted_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {c.recount_state === "required" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {c.operators.map((op) => (
                  <button
                    key={`accept-${op.user_id}`}
                    type="button"
                    disabled={busy}
                    onClick={() => onAcceptQuantity?.(c, op.quantity)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Zatwierdź {fmtQty(op.quantity)}
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
            ) : null}
          </div>
        ))}
      </div>
    </InventorySection>
  );
}
