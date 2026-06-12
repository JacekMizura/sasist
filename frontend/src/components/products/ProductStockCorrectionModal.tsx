import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { postManualStockCorrection } from "../../api/inventoryManagementPolicyApi";
import type { MagazynInvRowDisplay } from "./MagazynInventoryLine";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: number;
  warehouseId: number;
  productId: number;
  productName?: string | null;
  inventoryRows: MagazynInvRowDisplay[];
};

export function ProductStockCorrectionModal({
  open,
  onClose,
  onSuccess,
  tenantId,
  warehouseId,
  productId,
  productName,
  inventoryRows,
}: Props) {
  const locationOptions = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<{ locationId: number; label: string }> = [];
    for (const row of inventoryRows) {
      const lid = row.location_id != null ? Number(row.location_id) : 0;
      if (!Number.isFinite(lid) || lid <= 0 || seen.has(lid)) continue;
      seen.add(lid);
      const name = (row.location_code || `Lokalizacja #${lid}`).trim();
      out.push({ locationId: lid, label: name });
    }
    return out;
  }, [inventoryRows]);

  const [locationId, setLocationId] = useState<number | "">("");
  const [quantityDelta, setQuantityDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocationId(locationOptions[0]?.locationId ?? "");
    setQuantityDelta("");
    setReason("");
  }, [open, locationOptions]);

  if (!open) return null;

  const submit = async () => {
    if (locationId === "" || locationId <= 0) {
      toast.error("Wybierz lokalizację.");
      return;
    }
    const delta = Number(String(quantityDelta).trim().replace(",", "."));
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-9) {
      toast.error("Podaj niezerową korektę ilości (np. +10 lub -2).");
      return;
    }
    const reasonTrim = reason.trim();
    if (reasonTrim.length < 3) {
      toast.error("Podaj powód korekty (min. 3 znaki).");
      return;
    }
    setSaving(true);
    try {
      await postManualStockCorrection({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        product_id: productId,
        location_id: locationId,
        quantity_delta: delta,
        reason: reasonTrim,
      });
      toast.success("Zapisano korektę stanu (dokument RK).");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response
          ? JSON.stringify((err.response as { data?: unknown }).data)
          : "Nie udało się wykonać korekty.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4">
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-correction-title"
      >
        <h2 id="stock-correction-title" className="text-lg font-semibold text-slate-900">
          Korekta stanu
        </h2>
        {productName ? <p className="mt-1 text-sm text-slate-600">{productName}</p> : null}
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Lokalizacja</label>
            {locationOptions.length === 0 ? (
              <p className="mt-1 text-sm text-amber-700">
                Brak wierszy stanu — dodaj stan przez dokument magazynowy lub wybierz lokalizację po pierwszym przyjęciu.
              </p>
            ) : (
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={locationId === "" ? "" : String(locationId)}
                onChange={(e) => setLocationId(Number(e.target.value))}
              >
                {locationOptions.map((o) => (
                  <option key={o.locationId} value={o.locationId}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Korekta ilości (delta)</label>
            <input
              type="text"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
              placeholder="np. +10 lub -2"
              value={quantityDelta}
              onChange={(e) => setQuantityDelta(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Wartość ze znakiem — dodatnia zwiększa stan, ujemna zmniejsza.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Powód korekty</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Wymagany opis operacji (audyt)"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Anuluj
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={saving || locationOptions.length === 0}
          >
            {saving ? "Zapisywanie…" : "Zapisz korektę"}
          </button>
        </div>
      </div>
    </div>
  );
}
