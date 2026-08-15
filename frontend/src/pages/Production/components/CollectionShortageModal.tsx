import { AppOverlayPortal } from "@/components/overlay";
import type { CollectionPendingShortageRead } from "@/api/productionApi";
import { formatProductionQuantity } from "../productionUi";

type Props = {
  open: boolean;
  shortage: CollectionPendingShortageRead | null;
  unit?: string;
  hasOtherLocation: boolean;
  onCheckOtherLocation: () => void;
  onReportShortage: () => void;
  onCancel: () => void;
};

function fmtQty(n: number | null | undefined): string {
  return formatProductionQuantity(n);
}

/** Blocking WMS modal when remaining component qty cannot be covered. */
export function CollectionShortageModal({
  open,
  shortage,
  unit = "szt.",
  hasOtherLocation,
  onCheckOtherLocation,
  onReportShortage,
  onCancel,
}: Props) {
  if (!open || !shortage) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-shortage-title"
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-rose-200">
          <h2 id="collection-shortage-title" className="text-lg font-bold text-slate-900">
            Brakuje {fmtQty(shortage.missing_qty)} {unit} komponentu
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-800">{shortage.product_name}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Wymagane</dt>
              <dd className="font-bold tabular-nums text-slate-900">
                {fmtQty(shortage.required_qty)} {unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Pobrano</dt>
              <dd className="font-bold tabular-nums text-emerald-700">
                {fmtQty(shortage.collected_qty)} {unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Brakuje</dt>
              <dd className="font-bold tabular-nums text-rose-700">
                {fmtQty(shortage.missing_qty)} {unit}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Lokalizacja różnicy</dt>
              <dd className="font-mono font-bold text-slate-900">
                {shortage.location_code || "—"}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-col gap-2">
            {hasOtherLocation ? (
              <button
                type="button"
                className="w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700"
                onClick={onCheckOtherLocation}
              >
                Sprawdź inną lokalizację
              </button>
            ) : null}
            <button
              type="button"
              className="w-full rounded-lg bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700"
              onClick={onReportShortage}
            >
              Zgłoś brak
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onCancel}
            >
              Wróć
            </button>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
