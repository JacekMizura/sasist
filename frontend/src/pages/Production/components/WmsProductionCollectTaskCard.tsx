import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, ScanLine, Star } from "lucide-react";

import type { CollectionTaskRead } from "@/api/productionApi";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { WmsProductTaskCard } from "@/components/wms/WmsProductTaskCard";
import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import { formatProductionQuantity } from "../productionUi";

type Props = {
  index: number;
  task: CollectionTaskRead;
  display: ProductionTerminalDisplaySettings;
  expanded: boolean;
  done: boolean;
  busy: boolean;
  onToggle: () => void;
  /** Qty is for THIS location pick only (appended on backend). */
  onConfirm: (
    locationId: number,
    pickQty: number,
    identity: { batchNumber?: string | null; lot?: string | null; serialNumber?: string | null },
  ) => void;
};

function fmtQty(n: number | null | undefined): string {
  return formatProductionQuantity(n);
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
  const remaining =
    task.remaining_qty != null
      ? Number(task.remaining_qty)
      : Math.max(0, Number(task.required_qty) - Number(task.collected_qty));

  const initialLoc =
    task.next_location_id ??
    task.selected_location_id ??
    (task.location_id > 0 ? task.location_id : null);
  const [selectedLocId, setSelectedLocId] = useState<number | null>(initialLoc);
  const [pickQty, setPickQty] = useState<number>(0);
  const [batchNumber, setBatchNumber] = useState(task.selected_batch_number ?? task.selected_lot ?? "");
  const [serialNumber, setSerialNumber] = useState(task.selected_serial_number ?? "");

  useEffect(() => {
    setSelectedLocId(
      task.next_location_id ??
        task.selected_location_id ??
        (task.location_id > 0 ? task.location_id : null),
    );
    setBatchNumber(task.selected_batch_number ?? task.selected_lot ?? "");
    setSerialNumber(task.selected_serial_number ?? "");
  }, [task.task_key, task.next_location_id, task.selected_location_id, task.location_id, task.collected_qty]);

  const selectedOption = useMemo(
    () => task.location_options.find((o) => o.location_id === selectedLocId) ?? null,
    [task.location_options, selectedLocId],
  );
  const identityOptions = selectedOption?.lots ?? [];
  const serialOptions = identityOptions.map((lot) => lot.serial_number).filter((v): v is string => Boolean(v));
  const requiresBatch = Boolean(task.production_trace_require_batch);
  const requiresSerial = Boolean(task.production_trace_require_serial);
  const effectiveBatchNumber =
    batchNumber || (identityOptions.length === 1 ? identityOptions[0].batch_number || identityOptions[0].lot || "" : "");
  const effectiveSerialNumber = serialNumber || (serialOptions.length === 1 ? serialOptions[0] : "");

  const locAvailable = selectedOption?.available_qty ?? task.available_qty;
  const whTotal = task.warehouse_total_available;
  const suggested = useMemo(() => {
    const avail = locAvailable == null ? remaining : Number(locAvailable);
    return Math.max(0, Math.min(remaining, avail));
  }, [locAvailable, remaining]);

  useEffect(() => {
    setPickQty(requiresSerial ? Math.min(1, suggested) : suggested);
  }, [suggested, selectedLocId, task.collected_qty, requiresSerial]);

  const maxAllowed = locAvailable == null ? remaining : Math.min(remaining, Number(locAvailable));
  const canConfirm =
    selectedLocId != null &&
    pickQty > 1e-9 &&
    pickQty <= maxAllowed + 1e-6 &&
    (!requiresSerial || Math.abs(pickQty - 1) <= 1e-6) &&
    (!requiresBatch || effectiveBatchNumber.trim().length > 0) &&
    (!requiresSerial || effectiveSerialNumber.trim().length > 0) &&
    remaining > 1e-9;

  const pickEvents = task.pick_events ?? [];

  const summary = (
    <>
      {fmtQty(task.collected_qty)} / {fmtQty(task.required_qty)} {unit}
      {task.shortage_reported ? " · BRAK" : task.location_code ? ` · ${task.location_code}` : ""}
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
            <p className={WMS_TERMINAL_LABEL}>Dostępne tu</p>
            <p className="mt-1 text-xl font-black tabular-nums text-slate-800">{fmtQty(locAvailable)}</p>
            {whTotal != null ? (
              <p className="mt-0.5 text-xs text-slate-500">({fmtQty(whTotal)} {unit} w magazynie)</p>
            ) : null}
          </div>
        ) : null}
        <div>
          <p className={WMS_TERMINAL_LABEL}>Pobrano / zostało</p>
          <p className="mt-1 text-xl font-black tabular-nums text-emerald-700">
            {fmtQty(task.collected_qty)}
            <span className="text-base font-bold text-slate-400"> / {fmtQty(task.required_qty)}</span>
          </p>
          <p className="mt-0.5 text-xs font-semibold text-amber-800">Zostało: {fmtQty(remaining)} {unit}</p>
        </div>
      </div>

      {pickEvents.length > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className={`${WMS_TERMINAL_LABEL} mb-1`}>Historia pobrań</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {pickEvents.map((ev) => (
              <li key={ev.event_id} className="flex flex-wrap justify-between gap-2 tabular-nums">
                <span className="font-mono font-semibold">{ev.location_code || `#${ev.location_id}`}</span>
                <span>
                  {fmtQty(ev.quantity)} {unit}
                  {ev.discrepancy && ev.discrepancy > 1e-6 ? (
                    <span className="ml-2 text-xs font-semibold text-rose-600">
                      (różnica {fmtQty(ev.discrepancy)})
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
            const depleted = Number(opt.available_qty) <= 1e-9;
            return (
              <button
                key={opt.location_id}
                type="button"
                disabled={busy || depleted}
                data-wms-card-no-nav=""
                onClick={() => setSelectedLocId(opt.location_id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                    : depleted
                      ? "border-slate-100 bg-slate-50 opacity-60"
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
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold uppercase text-violet-800">
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

        <div className="mt-4">
          <label className={WMS_TERMINAL_LABEL} htmlFor={`pick-qty-${task.task_key}`}>
            Ilość z tej lokalizacji
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id={`pick-qty-${task.task_key}`}
              type="number"
              min={0}
              max={maxAllowed}
              step="any"
              disabled={busy || selectedLocId == null}
              value={pickQty}
              data-wms-card-no-nav=""
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isNaN(v)) return;
                setPickQty(Math.max(0, Math.min(maxAllowed, v)));
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-lg font-bold tabular-nums text-slate-900"
            />
            <span className="shrink-0 text-sm font-semibold text-slate-500">{unit}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Podpowiedź: {fmtQty(suggested)} {unit} (min. z pozostało / stan lokalizacji). Możesz zmniejszyć,
            jeśli fizycznie jest mniej.
          </p>
        </div>

        {requiresBatch ? (
          <div className="mt-4">
            <label className={WMS_TERMINAL_LABEL}>Numer partii (LOT)</label>
            {identityOptions.length > 0 ? (
              <select
                value={effectiveBatchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <option value="">— wybierz —</option>
                {identityOptions.map((lot, idx) => {
                  const value = lot.batch_number || lot.lot || "";
                  return <option key={`${value}-${idx}`} value={value}>{value || "—"}</option>;
                })}
              </select>
            ) : (
              <input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
              />
            )}
          </div>
        ) : null}

        {requiresSerial ? (
          <div className="mt-4">
            <label className={WMS_TERMINAL_LABEL}>Numer seryjny (SN)</label>
            {serialOptions.length > 0 ? (
              <select
                value={effectiveSerialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <option value="">— wybierz —</option>
                {serialOptions.map((serial) => <option key={serial} value={serial}>{serial}</option>)}
              </select>
            ) : (
              <input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"
              />
            )}
            <p className="mt-1 text-xs text-slate-500">Dla numeru seryjnego ilość pobrania wynosi 1 szt.</p>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy || !canConfirm}
            data-wms-card-no-nav=""
            onClick={() => {
              if (canConfirm && selectedLocId != null) {
                onConfirm(selectedLocId, pickQty, {
                  batchNumber: effectiveBatchNumber || null,
                  lot: effectiveBatchNumber || null,
                  serialNumber: effectiveSerialNumber || null,
                });
              }
            }}
            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="h-5 w-5" aria-hidden />
            Potwierdź pobranie ({fmtQty(pickQty)} {unit})
          </button>
          <button
            type="button"
            disabled={busy || !canConfirm}
            data-wms-card-no-nav=""
            onClick={() => {
              if (canConfirm && selectedLocId != null) {
                onConfirm(selectedLocId, pickQty, {
                  batchNumber: effectiveBatchNumber || null,
                  lot: effectiveBatchNumber || null,
                  serialNumber: effectiveSerialNumber || null,
                });
              }
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
        {task.shortage_reported
          ? `Zgłoszono brak — pobrano ${fmtQty(task.collected_qty)} / ${fmtQty(task.required_qty)}`
          : `Pobrano ${fmtQty(task.collected_qty)} ${unit} (${pickEvents.length || 1} lokalizacji)`}
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
      accent={done ? (task.shortage_reported ? "amber" : "emerald") : "amber"}
      onToggle={onToggle}
    />
  );
}
