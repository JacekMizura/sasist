import { useState } from "react";
import { createWmsCarrierGroup } from "../../../api/wmsCarrierApi";
import axios from "axios";

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
  onClose: () => void;
  onCreated: () => void;
};

export function CreateCarrierGroupModal({ tenantId, open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    const n = name.trim();
    const c = code.trim().toUpperCase().replace(/\s+/g, "_");
    if (!n || !c) {
      setErr("Podaj nazwę i kod grupy.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createWmsCarrierGroup(tenantId, { name: n, code: c });
      setName("");
      setCode("");
      onCreated();
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
        <h2 className="text-lg font-black text-slate-900">Nowa grupa nośników</h2>
        <p className="mt-1 text-sm text-slate-600">Np. „Palety euro” — tak jak grupy wózków w module wózków.</p>
        <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Nazwa</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="Palety EURO"
        />
        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Kod (skrót)</label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm uppercase"
          placeholder="PAL_EURO"
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
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black uppercase text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Tworzenie…" : "Utwórz grupę"}
          </button>
        </div>
      </div>
    </div>
  );
}
