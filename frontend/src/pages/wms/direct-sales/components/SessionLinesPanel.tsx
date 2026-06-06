import type { DirectSaleSession } from "../services/directSalesApi";
import { SessionLineRow } from "./SessionLineRow";

type Props = {
  session: DirectSaleSession | null;
  warehouseId: number;
  busy: boolean;
  highlight?: boolean;
  onQtyChange: (lineId: number, qty: number) => void;
  onLocationChange: (lineId: number, locationId: number | null) => void;
  onRemove: (lineId: number) => void;
};

export function SessionLinesPanel({
  session,
  warehouseId,
  busy,
  highlight,
  onQtyChange,
  onLocationChange,
  onRemove,
}: Props) {
  const lines = session?.lines ?? [];

  return (
    <main
      className={`min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white p-3 ${
        highlight ? "ring-2 ring-emerald-300" : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Pozycje ({lines.length})</h2>
        {session?.status === "CHECKOUT" ? (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
            Płatność
          </span>
        ) : null}
        {session?.reservation_scope ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
            {session.reservation_scope}
          </span>
        ) : null}
      </div>
      {lines.length ? (
        <ul>
          {lines.map((ln) => (
            <SessionLineRow
              key={ln.id}
              line={ln}
              warehouseId={warehouseId}
              busy={busy}
              onQtyChange={onQtyChange}
              onLocationChange={onLocationChange}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Zeskanuj lub wyszukaj pierwszy produkt.</p>
      )}
    </main>
  );
}
