import { useEffect, useState } from "react";
import axios from "axios";
import { patchWmsCarrier, type WarehouseCarrierGroupRead, type WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { CARRIER_CREATE_STATUSES } from "./carrierConstants";

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
  groups: WarehouseCarrierGroupRead[];
  onClose: () => void;
  onSaved: (row: WarehouseCarrierRead) => void;
};

export function CarrierEditModal({ tenantId, open, carrier, groups, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [groupId, setGroupId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !carrier) return;
    setErr(null);
    setName((carrier.name || "").trim());
    setStatus((carrier.status || "ACTIVE").trim().toUpperCase());
    setGroupId(carrier.carrier_group_id && carrier.carrier_group_id >= 1 ? carrier.carrier_group_id : "");
    setNotes((carrier.notes || "").trim());
  }, [open, carrier]);

  if (!open || !carrier) return null;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const updated = await patchWmsCarrier(tenantId, carrier.id, {
        name: name.trim() || null,
        status,
        ...(groupId !== "" ? { carrier_group_id: Number(groupId) } : {}),
        notes: notes.trim() || null,
      });
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
        <h2 className="text-lg font-black text-slate-900">Edytuj nośnik</h2>
        <p className="mt-1 font-mono text-sm text-slate-600">{carrier.code}</p>

        <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Nazwa (opcjonalnie)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Grupa</label>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="">— bez grupy —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.name || "").trim() || g.code}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          {CARRIER_CREATE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Notatki</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black uppercase text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Zapis…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
