import { useEffect, useMemo, useState } from "react";

import type { CollectionTaskRead } from "@/api/productionApi";
import { PrimaryButton } from "@/design-system";
import { formatProductionQuantity } from "../productionUi";
import { ProductThumb } from "./ProductThumb";

type ConfirmPayload = {
  locationId: number;
  collectedQty: number;
  batchNumber?: string | null;
  lot?: string | null;
  serialNumber?: string | null;
};

type Props = {
  task: CollectionTaskRead;
  expanded: boolean;
  done: boolean;
  busy: boolean;
  onToggle: () => void;
  onConfirm: (payload: ConfirmPayload) => void;
};

function fmtQty(n: number | null | undefined): string {
  return formatProductionQuantity(n);
}

function formatExpiry(raw?: string | null): string {
  if (!raw) return "—";
  const d = String(raw).slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

function lotLabel(l: { lot?: string | null; batch_number?: string | null }): string {
  return (l.lot || l.batch_number || "").trim();
}

export function PaperCollectTaskCard({ task, expanded, done, busy, onToggle, onConfirm }: Props) {
  const unit = (task.product_unit ?? "szt.").trim() || "szt.";
  const requiresBatch = Boolean(task.production_trace_require_batch);
  const requiresSerial = Boolean(task.production_trace_require_serial);
  const [selectedLocId, setSelectedLocId] = useState<number | null>(
    task.selected_location_id ?? (task.location_id > 0 ? task.location_id : null),
  );
  const [batchNumber, setBatchNumber] = useState(task.selected_batch_number ?? "");
  const [lot, setLot] = useState(task.selected_lot ?? "");
  const [serialNumber, setSerialNumber] = useState(task.selected_serial_number ?? "");

  useEffect(() => {
    setSelectedLocId(task.selected_location_id ?? (task.location_id > 0 ? task.location_id : null));
    setBatchNumber(task.selected_batch_number ?? "");
    setLot(task.selected_lot ?? "");
    setSerialNumber(task.selected_serial_number ?? "");
  }, [
    task.task_key,
    task.selected_location_id,
    task.location_id,
    task.selected_batch_number,
    task.selected_lot,
    task.selected_serial_number,
  ]);

  const selectedOption = useMemo(
    () => task.location_options.find((o) => o.location_id === selectedLocId) ?? null,
    [task.location_options, selectedLocId],
  );

  const lotOptions = selectedOption?.lots ?? [];

  const applyLot = (value: string) => {
    const match = lotOptions.find(
      (l) => (l.lot ?? l.batch_number ?? "") === value || (l.batch_number ?? "") === value,
    );
    setLot(value);
    if (match?.batch_number) setBatchNumber(match.batch_number);
    else if (match?.lot) setBatchNumber(match.lot);
  };

  // Single lot → no dropdown; lock values from that lot.
  useEffect(() => {
    if (!selectedOption || selectedOption.lots.length !== 1) return;
    const only = selectedOption.lots[0];
    const label = lotLabel(only);
    setLot(label);
    setBatchNumber(only.batch_number || only.lot || "");
  }, [selectedOption]);

  const serialOptions = lotOptions.flatMap((l) =>
    l.serial_number ? [{ serial: l.serial_number, lot: l.lot ?? l.batch_number }] : [],
  );

  useEffect(() => {
    if (serialOptions.length === 1) setSerialNumber(serialOptions[0].serial);
  }, [selectedLocId, serialOptions.length]);

  const selectLocation = (locationId: number) => {
    setSelectedLocId(locationId);
    const opt = task.location_options.find((o) => o.location_id === locationId);
    if (opt && opt.lots.length === 1) {
      const only = opt.lots[0];
      setLot(lotLabel(only));
      setBatchNumber(only.batch_number || only.lot || "");
    } else if (opt && opt.lots.length === 0) {
      setLot("");
      setBatchNumber("");
    }
  };

  return (
    <div className={`rounded-xl border bg-white shadow-sm ${done ? "border-emerald-200" : "border-slate-200"}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-4 text-left">
        <ProductThumb imageUrl={task.product_image_url} name={task.product_name} size="md" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-semibold text-slate-900">{task.product_name}</p>
          <p className="text-lg font-bold tabular-nums text-slate-900">
            {fmtQty(task.collected_qty)} / {fmtQty(task.required_qty)} {unit}
          </p>
          {task.location_code ? (
            <p className="text-sm text-slate-600">
              Lokalizacja: <span className="font-semibold text-slate-800">{task.location_code}</span>
            </p>
          ) : null}
          {(task.product_sku || task.product_ean) && (
            <p className="text-xs text-slate-400">
              {[task.product_sku ? `SKU ${task.product_sku}` : null, task.product_ean ? `EAN ${task.product_ean}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        {done ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">OK</span>
        ) : null}
      </button>

      {expanded && !done ? (
        <div className="space-y-5 border-t border-slate-100 px-4 py-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Dostępne lokalizacje</h3>
            <div className="space-y-2.5">
              {task.location_options.map((opt) => {
                const active = selectedLocId === opt.location_id;
                const primaryLot = opt.lots[0];
                const lotText = primaryLot ? lotLabel(primaryLot) : "";
                return (
                  <button
                    key={opt.location_id}
                    type="button"
                    onClick={() => selectLocation(opt.location_id)}
                    className={[
                      "w-full rounded-xl border px-4 py-3.5 text-left transition",
                      active
                        ? "border-orange-500 bg-orange-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                    ].join(" ")}
                    aria-pressed={active}
                  >
                    <p className="font-mono text-base font-bold text-slate-900">{opt.location_code}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Dostępne{" "}
                      <span className="font-semibold tabular-nums text-slate-900">
                        {fmtQty(opt.available_qty)} {unit}
                      </span>
                    </p>
                    {lotText ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Partia: <span className="font-medium text-slate-800">{lotText}</span>
                      </p>
                    ) : null}
                    {primaryLot?.expiry_date ? (
                      <p className="mt-0.5 text-sm text-slate-600">
                        Data ważności:{" "}
                        <span className="font-medium text-slate-800">{formatExpiry(primaryLot.expiry_date)}</span>
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {(requiresBatch || lotOptions.length > 0) && lotOptions.length === 1 ? (
            <div>
              <p className="text-xs font-medium text-slate-500">Numer partii (LOT)</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{lotLabel(lotOptions[0]) || "—"}</p>
            </div>
          ) : null}

          {(requiresBatch || lotOptions.length > 0) && lotOptions.length > 1 ? (
            <div>
              <label className="text-xs font-medium text-slate-500">Numer partii (LOT)</label>
              <select
                value={lot || batchNumber}
                onChange={(e) => applyLot(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">— wybierz —</option>
                {lotOptions.map((l, i) => {
                  const val = lotLabel(l);
                  return (
                    <option key={i} value={val}>
                      {val || "—"}
                      {l.expiry_date ? ` · ${formatExpiry(l.expiry_date)}` : ""}
                      {` · ${fmtQty(l.available_qty)} ${unit}`}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {requiresBatch && lotOptions.length === 0 ? (
            <div>
              <label className="text-xs font-medium text-slate-500">Numer partii (LOT)</label>
              <input
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          ) : null}

          {requiresSerial && serialOptions.length > 1 ? (
            <div>
              <label className="text-xs font-medium text-slate-500">Numer seryjny (SN)</label>
              <select
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">— wybierz —</option>
                {serialOptions.map((s) => (
                  <option key={s.serial} value={s.serial}>
                    {s.serial}
                  </option>
                ))}
              </select>
            </div>
          ) : requiresSerial && serialOptions.length === 1 ? (
            <div>
              <p className="text-xs font-medium text-slate-500">Numer seryjny (SN)</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{serialOptions[0].serial}</p>
            </div>
          ) : requiresSerial ? (
            <div>
              <label className="text-xs font-medium text-slate-500">Numer seryjny (SN)</label>
              <input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          ) : null}

          <PrimaryButton
            type="button"
            density="comfortable"
            className="w-full py-3.5 text-base"
            disabled={
              busy ||
              !selectedLocId ||
              selectedLocId < 1 ||
              (requiresBatch && !(batchNumber || lot).trim()) ||
              (requiresSerial && !(serialOptions.length === 1 ? serialOptions[0].serial : serialNumber).trim())
            }
            onClick={() => {
              const sn =
                requiresSerial && serialOptions.length === 1
                  ? serialOptions[0].serial
                  : serialNumber || null;
              onConfirm({
                locationId: selectedLocId!,
                collectedQty: requiresSerial ? 1 : task.required_qty,
                batchNumber: batchNumber || null,
                lot: lot || null,
                serialNumber: sn,
              });
            }}
          >
            Potwierdź pobranie ({fmtQty(requiresSerial ? 1 : task.required_qty)} {unit})
          </PrimaryButton>
        </div>
      ) : null}
    </div>
  );
}
