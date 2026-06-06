import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { sessionStatusPl } from "./directSalesTerminology";
import { SessionLineCard } from "./SessionLineCard";

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
      className={`flex min-h-0 flex-1 flex-col bg-white z-10 transition-shadow ${
        highlight ? "ring-4 ring-emerald-300 rounded-3xl" : ""
      }`}
    >
      {/* Nagłówek sekcji */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 px-4 py-6 lg:px-8">
        <h2 className="text-2xl font-bold text-slate-800">
          Pozycje sprzedaży ({lines.length})
        </h2>
        {session?.status ? (
          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
            {sessionStatusPl(session.status)}
          </span>
        ) : null}
      </div>

      {/* Lista pozycji */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 lg:px-8 lg:pb-8">
        {lines.length ? (
          <ul className="flex flex-col gap-4">
            {lines.map((ln) => (
              <SessionLineCard
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
          <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center bg-blue-50/30 rounded-3xl border-2 border-blue-50/50 border-dashed">
            <p className="text-lg font-bold text-slate-700">Brak pozycji w sesji</p>
            <p className="mt-2 text-sm text-slate-500 font-medium">
              Zeskanuj kod lub wyszukaj produkt po lewej stronie.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}