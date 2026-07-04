import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, ScanLine, Star } from "lucide-react";

import type { CollectionTaskRead } from "@/api/productionApi";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { WmsProductTaskCard } from "@/components/wms/WmsProductTaskCard";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";

type Props = {
  index: number;
  task: CollectionTaskRead;
  display: ProductionTerminalDisplaySettings;
  expanded: boolean;
  done: boolean;
  busy: boolean;
  onToggle: () => void;
  onConfirm: (locationId: number, collectedQty: number) => void;
};

function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function WmsProductionCollectTaskCard({
  index,
  task,
  display,
  expanded,
  done,
  busy,
  onToggle,
  onConfirm,
}: Props) {
  const unit = (task.product_unit ?? "szt.").trim() || "szt.";
  const barcode = (task.product_ean ?? task.product_sku ?? "").trim();
  const initialLoc = task.selected_location_id ?? (task.location_id > 0 ? task.location_id : null);
  const [selectedLocId, setSelectedLocId] = useState<number | null>(initialLoc);

  useEffect(() => {
    setSelectedLocId(task.selected_location_id ?? (task.location_id > 0 ? task.location_id : null));
  }, [task.task_key, task.selected_location_id, task.location_id]);

  const selectedOption = useMemo(
    () => task.location_options.find((o) => o.location_id === selectedLocId) ?? null,
    [task.location_options, selectedLocId],
  );

  const locAvailable = selectedOption?.available_qty ?? task.available_qty;
  const whTotal = task.warehouse_total_available;

  const summary = (
    <>
      {fmtQty(task.collected_qty)} / {fmtQty(task.required_qty)} {unit}
      {task.location_code ? ` · ${task.location_code}` : ""}
    </>
  );

  const metaBody = (
    <>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
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

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <p className={WMS_TERMINAL_LABEL}>Do pobrania</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
            {fmtQty(task.required_qty)}
            {display.show_unit ? (
              <span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span>
            ) : null}
          </p>
        </div>
        {display.show_stock_level ? (
          <div>
            <p className={WMS_TERMINAL_LABEL}>Dostępne</p>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-800">{fmtQty(locAvailable)}</p>
            {whTotal != null ? (
              <p className="mt-0.5 text-xs text-slate-500">({fmtQty(whTotal)} {unit} w magazynie)</p>
            ) : null}
          </div>
        ) : null}
        <div>
          <p className={WMS_TERMINAL_LABEL}>Pobrano</p>
          <p className="mt-1 text-xl font-black tabular-nums text-emerald-700">
            {fmtQty(task.collected_qty)}
            <span className="text-base font-bold text-slate-400"> / {fmtQty(task.required_qty)}</span>
          </p>
        </div>
      </div>
    </>
  );

  const locationFooter =
    !done && expanded ? (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <p className={`${WMS_TERMINAL_LABEL} mb-2`}>Wybierz lokalizację pobrania</p>
        <div className="space-y-2">
          {(task.location_options ?? []).map((opt) => {
            const active = selectedLocId === opt.location_id;
            const lot = opt.lots?.[0];
            return (
              <button
                key={opt.location_id}
                type="button"
                disabled={busy}
                data-wms-card-no-nav=""
                onClick={() => setSelectedLocId(opt.location_id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <LocationBadge
                    code={opt.location_code}
                    type={opt.badge_kind ?? opt.operational_zone_type ?? "PICK"}
                    storageType={opt.storage_type ?? undefined}
                    quantity={opt.available_qty}
                    layoutSpread
                    className="max-w-full"
                  />
                  {opt.is_preferred ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-800">
                      <Star className="h-3 w-3" aria-hidden />
                      Preferowana
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-bold tabular-nums text-slate-900">
                  {fmtQty(opt.available_qty)} {unit} dostępne
                </p>
                {lot ? (
                  <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                    {lot.batch_number ? (
                      <div>
                        <span className="text-slate-400">Partia: </span>
                        {lot.batch_number}
                      </div>
                    ) : null}
                    {lot.lot ? (
                      <div>
                        <span className="text-slate-400">LOT: </span>
                        {lot.lot}
                      </div>
                    ) : null}
                    {lot.expiry_date ? (
                      <div>
                        <span className="text-slate-400">Ważność: </span>
                        {lot.expiry_date}
                      </div>
                    ) : null}
                    {lot.production_date ? (
                      <div>
                        <span className="text-slate-400">Prod.: </span>
                        {lot.production_date}
                      </div>
                    ) : null}
                    {lot.serial_number ? (
                      <div className="sm:col-span-2">
                        <span className="text-slate-400">S/N: </span>
                        {lot.serial_number}
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </button>
            );
          })}
        </div>

        {selectedOption && display.show_source_location ? (
          <p className="mt-4 inline-flex items-center gap-2 font-mono text-lg font-bold text-slate-800">
            <MapPin className="h-5 w-5 text-amber-600" aria-hidden />
            {selectedOption.location_code}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy || selectedLocId == null}
            data-wms-card-no-nav=""
            onClick={() => {
              if (selectedLocId != null) onConfirm(selectedLocId, task.required_qty);
            }}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="h-5 w-5" aria-hidden />
            Potwierdź pobranie
          </button>
          <button
            type="button"
            disabled={busy || selectedLocId == null}
            data-wms-card-no-nav=""
            onClick={() => {
              if (selectedLocId != null) onConfirm(selectedLocId, task.required_qty);
            }}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            Skanuj
          </button>
        </div>
      </div>
    ) : done ? (
      <p className="mt-4 inline-flex items-center gap-2 border-t border-slate-100 pt-4 text-sm font-bold text-emerald-700">
        <Check className="h-4 w-4" aria-hidden />
        Pobrano z {task.location_code || "lokalizacji"}
      </p>
    ) : null;

  return (
    <WmsProductTaskCard
      index={index}
      imageUrl={task.product_image_url}
      title={task.product_name}
      summary={summary}
      body={metaBody}
      footer={locationFooter}
      expanded={expanded}
      done={done}
      busy={busy}
      accent={done ? "emerald" : "amber"}
      onToggle={onToggle}
    />
  );
}
