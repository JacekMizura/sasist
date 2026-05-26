import { useCallback, useEffect, useMemo, useState } from "react";
import {
  inventoryTraceabilityErrorMessage,
  isInventoryIdentityConflict,
  patchProductInventoryTraceability,
} from "../../api/productInventoryApi";
import {
  formatExpiryDatePl,
  formatExpiryInputWhileTyping,
  parseExpiryInputPlToIso,
} from "../../pages/wms/putawayFormat";
import type { MagazynInvRowDisplay } from "./MagazynInventoryLine";

type Props = {
  open: boolean;
  tenantId: number;
  productId: number;
  row: MagazynInvRowDisplay | null;
  trackBatch: boolean;
  trackExpiry: boolean;
  trackSerial: boolean;
  onClose: () => void;
  onSaved: (inventory: MagazynInvRowDisplay[]) => void;
};

export function EditInventoryTraceabilityModal({
  open,
  tenantId,
  productId,
  row,
  trackBatch,
  trackExpiry,
  trackSerial,
  onClose,
  onSaved,
}: Props) {
  const [batch, setBatch] = useState("");
  const [expiry, setExpiry] = useState("");
  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergePrompt, setMergePrompt] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setBatch((row.batch ?? "").trim());
    setExpiry(formatExpiryDatePl(row.expiry) ?? "");
    const sns = row.serial_numbers ?? [];
    setSerial(sns.length === 1 ? sns[0] : (row.serial_range_label ?? "").trim());
    setError(null);
    setMergePrompt(false);
  }, [open, row]);

  const needsBatch = trackBatch;
  const needsExpiry = trackExpiry;
  const needsSerial = trackSerial;

  const validate = useCallback((): string | null => {
    if (needsBatch && !batch.trim()) return "Numer partii jest wymagany";
    if (needsExpiry) {
      if (!expiry.trim()) return "Data ważności jest wymagana";
      if (!parseExpiryInputPlToIso(expiry)) return "Wpisz poprawną datę (dd.mm.rrrr lub mm.rrrr)";
    }
    if (needsSerial && !serial.trim()) return "Numer seryjny jest wymagany";
    return null;
  }, [needsBatch, needsExpiry, needsSerial, batch, expiry, serial]);

  const submit = useCallback(
    async (confirmMerge: boolean) => {
      if (!row) return;
      const v = validate();
      if (v) {
        setError(v);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const expiryIso = needsExpiry ? parseExpiryInputPlToIso(expiry) : null;
        const inv = await patchProductInventoryTraceability(tenantId, productId, {
          inventory_id: row.inventory_id ?? undefined,
          inventory_serial_ids: row.inventory_serial_ids ?? [],
          batch_number: needsBatch ? batch.trim() : null,
          expiry_date: expiryIso,
          serial_number: needsSerial ? serial.trim() : null,
          confirm_merge: confirmMerge,
        });
        const mapped: MagazynInvRowDisplay[] = inv.map((r) => ({
          inventory_id: r.inventory_id ?? null,
          inventory_serial_ids: r.inventory_serial_ids ?? [],
          location_id: r.location_id,
          location_code: r.location_code,
          location_type: r.location_type,
          quantity: r.quantity,
          batch: r.batch ?? null,
          expiry: r.expiry ?? null,
          serial_range_label: r.serial_range_label ?? null,
          serial_numbers: r.serial_numbers,
          warehouse_id: r.warehouse_id,
          location_uuid: r.location_uuid ?? null,
          stock_disposition: r.stock_disposition ?? null,
          disposition_badge: r.disposition_badge ?? null,
          warehouse_carrier_id: r.warehouse_carrier_id ?? null,
          carrier_code: r.carrier_code ?? null,
          carrier_barcode: r.carrier_barcode ?? null,
          carrier_is_mixed: r.carrier_is_mixed ?? false,
        }));
        onSaved(mapped);
        onClose();
      } catch (e) {
        if (isInventoryIdentityConflict(e)) {
          setMergePrompt(true);
          setError(
            "Inna pozycja ma już tę samą partię, datę i nośnik. Scal ilości tylko jeśli to ten sam towar.",
          );
        } else {
          setMergePrompt(false);
          setError(inventoryTraceabilityErrorMessage(e, "Nie udało się zapisać"));
        }
      } finally {
        setBusy(false);
      }
    },
    [
      row,
      validate,
      tenantId,
      productId,
      needsBatch,
      needsExpiry,
      needsSerial,
      batch,
      expiry,
      serial,
      onSaved,
      onClose,
    ],
  );

  const title = useMemo(() => {
    if (!row) return "Edycja śledzenia";
    return `${row.location_code} — partia / ważność / serial`;
  }, [row]);

  if (!open || !row) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-labelledby="edit-trace-title"
      >
        <h2 id="edit-trace-title" className="text-lg font-black text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Korekta danych śledzenia na stanie magazynowym. Zmiana nie scala automatycznie innych wierszy.
        </p>

        <div className="mt-4 space-y-3">
          {needsBatch ? (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Numer partii</label>
              <input
                type="text"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </div>
          ) : null}
          {needsExpiry ? (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Data ważności</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd.mm.rrrr"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiryInputWhileTyping(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </div>
          ) : null}
          {needsSerial ? (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase text-slate-500">Numer seryjny</label>
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Anuluj
          </button>
          {mergePrompt ? (
            <button
              type="button"
              onClick={() => void submit(true)}
              disabled={busy}
              className="flex-[2] rounded-xl bg-amber-600 py-2.5 text-sm font-black uppercase text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Scal z istniejącą pozycją
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={busy}
            className="flex-[2] rounded-xl bg-indigo-600 py-2.5 text-sm font-black uppercase text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Zapis…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
