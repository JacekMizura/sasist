import { Check, MapPin, ScanLine } from "lucide-react";

import type { CollectionTaskRead } from "@/api/productionApi";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import { ProductThumb } from "./ProductThumb";

type Props = {
  task: CollectionTaskRead;
  display: ProductionTerminalDisplaySettings;
  done: boolean;
  busy: boolean;
  onConfirm: () => void;
};

function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function WmsProductionCollectTaskCard({ task, display, done, busy, onConfirm }: Props) {
  const unit = (task.product_unit ?? "szt.").trim() || "szt.";
  const barcode = (task.product_ean ?? task.product_sku ?? "").trim();

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm ${
        done ? "border-emerald-200" : "border-slate-200"
      }`}
    >
      <div
        className={`absolute bottom-0 left-0 top-0 w-1 ${done ? "bg-emerald-400" : "bg-amber-400"}`}
        aria-hidden
      />
      <div className="pl-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {display.show_product_image ? (
            <ProductThumb imageUrl={task.product_image_url} name={task.product_name} size="lg" />
          ) : null}
          <div className="min-w-0 flex-1">
            {display.show_name ? (
              <p className="text-xl font-bold leading-snug text-slate-900">{task.product_name}</p>
            ) : null}
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {display.show_sku && task.product_sku ? (
                <div>
                  <dt className={WMS_TERMINAL_LABEL}>SKU</dt>
                  <dd className="font-mono font-semibold text-slate-800">{task.product_sku}</dd>
                </div>
              ) : null}
              {display.show_ean && task.product_ean ? (
                <div>
                  <dt className={WMS_TERMINAL_LABEL}>EAN</dt>
                  <dd className="font-mono font-semibold text-slate-800">{task.product_ean}</dd>
                </div>
              ) : null}
              {display.show_catalog_number && task.product_catalog_number ? (
                <div>
                  <dt className={WMS_TERMINAL_LABEL}>Nr katalogowy</dt>
                  <dd className="font-mono font-semibold text-slate-800">{task.product_catalog_number}</dd>
                </div>
              ) : null}
              {display.show_barcode && barcode ? (
                <div>
                  <dt className={WMS_TERMINAL_LABEL}>Kod kreskowy</dt>
                  <dd className="font-mono font-semibold text-slate-800">{barcode}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        {display.show_source_location ? (
          <div className="mt-5">
            <p className={WMS_TERMINAL_LABEL}>Lokalizacja źródłowa</p>
            <p className="mt-1 inline-flex items-center gap-2 font-mono text-2xl font-black text-slate-900">
              <MapPin className="h-6 w-6 text-amber-600" aria-hidden />
              {task.location_code}
            </p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className={WMS_TERMINAL_LABEL}>Do pobrania</p>
            <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
              {fmtQty(task.required_qty)}
              {display.show_unit ? (
                <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>
              ) : null}
            </p>
          </div>
          {display.show_stock_level ? (
            <div>
              <p className={WMS_TERMINAL_LABEL}>Dostępne</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-700">{fmtQty(task.available_qty)}</p>
            </div>
          ) : null}
          <div>
            <p className={WMS_TERMINAL_LABEL}>Postęp</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700">
              {fmtQty(task.collected_qty)}
              <span className="text-lg font-bold text-slate-400"> / {fmtQty(task.required_qty)}</span>
            </p>
          </div>
        </div>

        {!done ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="h-5 w-5" aria-hidden />
              Potwierdź pobranie
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <ScanLine className="h-4 w-4" aria-hidden />
              Skanuj
            </button>
          </div>
        ) : (
          <p className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
            <Check className="h-4 w-4" aria-hidden />
            Pobrano
          </p>
        )}
      </div>
    </div>
  );
}
