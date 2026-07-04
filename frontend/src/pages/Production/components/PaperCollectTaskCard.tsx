import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import type { CollectionTaskRead } from "@/api/productionApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
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
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function PaperCollectTaskCard({ task, expanded, done, busy, onToggle, onConfirm }: Props) {
  const unit = (task.product_unit ?? "szt.").trim() || "szt.";
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
  }, [task.task_key, task.selected_location_id, task.location_id, task.selected_batch_number, task.selected_lot, task.selected_serial_number]);

  const selectedOption = useMemo(
    () => task.location_options.find((o) => o.location_id === selectedLocId) ?? null,
    [task.location_options, selectedLocId],
  );

  const lotOptions = selectedOption?.lots ?? [];
  const serialOptions = lotOptions.flatMap((l) =>
    l.serial_number ? [{ serial: l.serial_number, lot: l.lot ?? l.batch_number }] : [],
  );

  const applyLot = (value: string) => {
    const match = lotOptions.find(
      (l) => (l.lot ?? l.batch_number ?? "") === value || (l.batch_number ?? "") === value,
    );
    setLot(value);
    if (match?.batch_number) setBatchNumber(match.batch_number);
  };

  return (
    <div className={`rounded-xl border bg-white ${done ? "border-emerald-200" : "border-slate-200"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ProductThumb imageUrl={task.product_image_url} name={task.product_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{task.product_name}</p>
          <p className="text-sm text-slate-500">
            {fmtQty(task.collected_qty)} / {fmtQty(task.required_qty)} {unit}
            {task.location_code ? ` · ${task.location_code}` : ""}
          </p>
        </div>
        {done ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">OK</span>
        ) : null}
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {task.product_sku ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">SKU</p>
                <p className="font-mono text-sm">{task.product_sku}</p>
              </div>
            ) : null}
            {task.product_ean ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">EAN</p>
                <p className="font-mono text-sm">{task.product_ean}</p>
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Lokalizacja</p>
            <div className="space-y-2">
              {task.location_options.map((opt) => (
                <label
                  key={opt.location_id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    selectedLocId === opt.location_id ? "border-violet-400 bg-violet-50/50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name={`loc-${task.task_key}`}
                    checked={selectedLocId === opt.location_id}
                    onChange={() => setSelectedLocId(opt.location_id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <LocationBadge
                      code={opt.location_code}
                      type={opt.badge_kind ?? opt.operational_zone_type ?? "PICK"}
                    />
                    <p className="mt-1 text-sm text-slate-600">
                      Dostępne: <strong>{fmtQty(opt.available_qty)}</strong> {unit}
                    </p>
                    {opt.lots.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-500">
                        {opt.lots.slice(0, 4).map((l, i) => (
                          <li key={i}>
                            Partia: {l.batch_number || "—"} · LOT: {l.lot || "—"} · ważność: {l.expiry_date || "—"} ·{" "}
                            {fmtQty(l.available_qty)} {unit}
                            {l.serial_number ? ` · SN: ${l.serial_number}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {lotOptions.length > 0 ? (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Partia / LOT</label>
              <select
                value={lot || batchNumber}
                onChange={(e) => applyLot(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— wybierz —</option>
                {lotOptions.map((l, i) => {
                  const val = l.lot ?? l.batch_number ?? "";
                  return (
                    <option key={i} value={val}>
                      {l.batch_number || "—"} · {l.expiry_date || "—"} · {fmtQty(l.available_qty)} {unit}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {task.track_serial && serialOptions.length > 0 ? (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Numer seryjny</label>
              <select
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">— wybierz —</option>
                {serialOptions.map((s) => (
                  <option key={s.serial} value={s.serial}>
                    {s.serial}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            type="button"
            disabled={busy || !selectedLocId || selectedLocId < 1}
            onClick={() =>
              onConfirm({
                locationId: selectedLocId!,
                collectedQty: task.required_qty,
                batchNumber: batchNumber || null,
                lot: lot || null,
                serialNumber: serialNumber || null,
              })
            }
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            <Check className="h-4 w-4" aria-hidden />
            Potwierdź pobranie ({fmtQty(task.required_qty)} {unit})
          </button>
        </div>
      ) : null}
    </div>
  );
}
