import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { SessionLineCard } from "./SessionLineCard";

type Props = {
  session: DirectSaleSession | null;
  warehouseId: number;
  busy: boolean;
  highlight?: boolean;
  onQtyChange: (lineId: number, qty: number) => void;
  onLocationChange: (lineId: number, locationId: number | null) => void;
  onRemove: (lineId: number) => void;
  onLineDiscount?: (lineId: number, type: "percent" | "amount" | null, value: number) => void;
};

export function SessionLinesPanel({
  session,
  warehouseId,
  busy,
  highlight,
  onQtyChange,
  onLocationChange,
  onRemove,
  onLineDiscount,
}: Props) {
  const lines = session?.lines ?? [];

  return (
    <main
      className={`min-h-0 flex-1 overflow-auto px-4 py-4 lg:px-6 ${
        highlight ? "ring-2 ring-inset ring-emerald-300" : ""
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold text-slate-800">Koszyk ({lines.length})</h2>
        {session?.status === "CHECKOUT" ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Płatność</span>
        ) : null}
      </div>
      {lines.length ? (
        <ul className="space-y-3">
          {lines.map((ln) => (
            <SessionLineCard
              key={ln.id}
              line={ln}
              warehouseId={warehouseId}
              busy={busy}
              onQtyChange={onQtyChange}
              onLocationChange={onLocationChange}
              onRemove={onRemove}
              onLineDiscount={onLineDiscount}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500 py-8 text-center">Zeskanuj lub wyszukaj pierwszy produkt.</p>
      )}
    </main>
  );
}
