import { useEffect, useState } from "react";
import axios from "axios";
import { moveWmsCarrier, patchWmsCarrier, type WarehouseCarrierRead } from "../../../api/wmsCarrierApi";

function apiErrMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: unknown } | undefined;
    if (d?.detail != null) return typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    return e.message || "Błąd sieci";
  }
  return "Nieznany błąd";
}

type Props = {
  tenantId: number;
  open: boolean;
  carrier: WarehouseCarrierRead | null;
  onClose: () => void;
  onSaved: (row: WarehouseCarrierRead) => void;
};

export function CarrierMoveLocationModal({ tenantId, open, carrier, onClose, onSaved }: Props) {
  const [locationIdRaw, setLocationIdRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !carrier) return;
    setErr(null);
    setLocationIdRaw(carrier.current_location_id ? String(carrier.current_location_id) : "");
  }, [open, carrier]);

  if (!open || !carrier) return null;

  const submit = async () => {
    const loc = Number(locationIdRaw.trim());
    if (!Number.isFinite(loc) || loc < 1) {
      setErr("Podaj poprawne ID lokalizacji (≥ 1).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      let updated: WarehouseCarrierRead;
      const hasStock = (carrier.total_qty ?? 0) > 1e-6 || (carrier.sku_count ?? 0) > 0;
      if (hasStock) {
        updated = await moveWmsCarrier(tenantId, carrier.id, loc);
      } else {
        updated = await patchWmsCarrier(tenantId, carrier.id, { current_location_id: loc });
      }
      onSaved(updated);
      onClose();
    } catch (e) {
      setErr(apiErrMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-black text-slate-900">Zmień lokalizację</h2>
        <p className="mt-1 font-mono text-sm text-slate-600">{carrier.code}</p>
        <p className="mt-2 text-xs text-slate-500">
          Obecna: <span className="font-mono font-semibold">{(carrier.current_location_code || "").trim() || "—"}</span>
        </p>

        <label className="mt-4 block text-xs font-bold uppercase text-slate-500">ID lokalizacji docelowej</label>
        <input
          value={locationIdRaw}
          onChange={(e) => setLocationIdRaw(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
          placeholder="np. 4821"
        />

        {err ? <p className="mt-3 text-sm font-medium text-red-600">{err}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black uppercase text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Zapis…" : "Przenieś"}
          </button>
        </div>
      </div>
    </div>
  );
}
