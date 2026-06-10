import { useEffect, useState } from "react";
import axios from "axios";
import { patchWmsCarrier, type WarehouseCarrierGroupRead, type WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { carrierStatusOptions } from "./carrierConstants";
import { CarrierIdentity } from "./CarrierIdentity";
import {
  wmsBtnPrimary,
  wmsBtnSecondary,
  wmsInputClass,
  wmsSectionTitle,
  wmsSelectClass,
} from "../../../modules/carts/wmsOperationalUi";

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

  const statusOptions = carrierStatusOptions();

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
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
        <h2 className="text-[17px] font-black text-slate-900">Edytuj nośnik</h2>
        <div className="mt-2">
          <CarrierIdentity carrier={carrier} size="md" />
        </div>

        <label className={`${wmsSectionTitle} mt-4 block`}>Nazwa wyświetlana</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${wmsInputClass} mt-1.5`}
          placeholder="np. Niebieska paleta outlet"
        />

        <label className={`${wmsSectionTitle} mt-3 block`}>Opis / alias operacyjny</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${wmsInputClass} mt-1.5 resize-none`}
          placeholder="np. Mix promocji"
        />

        <label className={`${wmsSectionTitle} mt-3 block`}>Grupa</label>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : "")}
          className={`${wmsSelectClass} mt-1.5`}
        >
          <option value="">— bez grupy —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.name || "").trim() || g.code}
            </option>
          ))}
        </select>

        <label className={`${wmsSectionTitle} mt-3 block`}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${wmsSelectClass} mt-1.5`}>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {err ? <p className="mt-3 text-[14px] font-medium text-red-600">{err}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={wmsBtnSecondary}>
            Anuluj
          </button>
          <button type="button" disabled={busy} onClick={() => void submit()} className={wmsBtnPrimary}>
            {busy ? "Zapis…" : "Zapisz"}
          </button>
        </div>
      </div>
    </div>
  );
}
