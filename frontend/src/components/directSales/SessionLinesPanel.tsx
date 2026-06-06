import type { DirectSalesSettingsConfig } from "../../modules/wmsSettings/directSales/schemas/directSalesSettingsSchema";
import type { DirectSaleSession } from "../../utils/normalizeDirectSales";
import { sessionStatusPl } from "./directSalesTerminology";
import { SessionLineCard } from "./SessionLineCard";

type Props = {
  session: DirectSaleSession | null;
  warehouseId: number;
  settings: DirectSalesSettingsConfig;
  busy: boolean;
  highlight?: boolean;
  onQtyChange: (lineId: number, qty: number) => void;
  onLocationChange: (lineId: number, locationId: number | null) => void;
  onRemove: (lineId: number) => void;
};

export function SessionLinesPanel({
  session,
  warehouseId,
  settings,
  busy,
  highlight,
  onQtyChange,
  onLocationChange,
  onRemove,
}: Props) {
  const lines = session?.lines ?? [];

  return (
    <main
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${
        highlight ? "ring-2 ring-emerald-300" : ""
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-800">Pozycje sprzedaży ({lines.length})</h2>
        {session?.status ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
            {sessionStatusPl(session.status)}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {lines.length ? (
          <ul>
            {lines.map((ln) => (
              <SessionLineCard
                key={ln.id}
                settings={settings}
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
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-slate-700">Brak pozycji w sesji</p>
            <p className="mt-1 text-xs text-slate-500">Zeskanuj kod lub wyszukaj produkt po lewej stronie.</p>
          </div>
        )}
      </div>
    </main>
  );
}
