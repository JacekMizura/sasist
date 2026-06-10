import { useState } from "react";
import axios from "axios";
import { createWmsCarrier } from "../../../api/wmsCarrierApi";

import { CARRIER_PREFIXES } from "./carrierConstants";

function apiErrMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: unknown } | undefined;
    if (d?.detail != null) return typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    if (e.response?.status === 401) return "Brak autoryzacji — zaloguj się ponownie.";
    return e.message || "Błąd sieci";
  }
  return "Nieznany błąd";
}
type Props = {
  tenantId: number;
  open: boolean;
  onClose: () => void;
  onCreated: (carrier: { id: number; code: string; barcode: string }) => void;
};

export function CarrierCreateModal({ tenantId, open, onClose, onCreated }: Props) {
  const [prefix, setPrefix] = useState<(typeof CARRIER_PREFIXES)[number]>("PAL");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await createWmsCarrier(tenantId, { barcode_prefix: prefix });
      onCreated({ id: c.id, code: c.code, barcode: c.barcode });
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
        <h2 className="text-lg font-black text-slate-900">Nowy nośnik</h2>
        <p className="mt-1 text-sm text-slate-600">Kod zostanie nadany automatycznie (np. PAL-1, BOX-2).</p>
        <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Prefiks</label>
        <select
          value={prefix}
          onChange={(e) => setPrefix(e.target.value as (typeof CARRIER_PREFIXES)[number])}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
        >
          {CARRIER_PREFIXES.map((p) => (
            <option key={p} value={p}>
              {p}-
            </option>
          ))}
        </select>
        {err ? <p className="mt-3 text-sm font-medium text-red-600">{err}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black uppercase text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Tworzenie…" : "Utwórz"}
          </button>
        </div>
      </div>
    </div>
  );
}
