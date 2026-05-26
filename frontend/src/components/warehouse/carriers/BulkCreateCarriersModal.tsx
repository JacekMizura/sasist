import { useEffect, useMemo, useState } from "react";
import {
  bulkCreateWmsCarriers,
  createWmsCarrier,
  type WarehouseCarrierBulkCreateResult,
  type WarehouseCarrierGroupRead,
  type WarehouseCarrierRead,
} from "../../../api/wmsCarrierApi";
import axios from "axios";
import { CARRIER_CREATE_STATUSES, CARRIER_PREFIXES } from "./carrierConstants";

function apiErrMessage(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data as { detail?: unknown } | undefined;
    if (d?.detail != null) return typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail);
    return e.message || "Błąd sieci";
  }
  return "Nieznany błąd";
}

type Mode = "bulk" | "single";

type Props = {
  tenantId: number;
  open: boolean;
  groups: WarehouseCarrierGroupRead[];
  initialGroupId?: number | null;
  /** Otwórz od razu w trybie pojedynczym. */
  initialMode?: Mode;
  onClose: () => void;
  onSuccess: (result: WarehouseCarrierBulkCreateResult | WarehouseCarrierRead) => void;
};

export function BulkCreateCarriersModal({
  tenantId,
  open,
  groups,
  initialGroupId,
  initialMode = "bulk",
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [groupId, setGroupId] = useState<number>(0);
  const [prefix, setPrefix] = useState<(typeof CARRIER_PREFIXES)[number]>("PAL");
  const [quantity, setQuantity] = useState(10);
  const [status, setStatus] = useState<string>("ACTIVE");
  const [locationIdRaw, setLocationIdRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setMode(initialMode);
    const g =
      initialGroupId && groups.some((x) => x.id === initialGroupId) ? initialGroupId : (groups[0]?.id ?? 0);
    setGroupId(g);
  }, [open, initialGroupId, groups, initialMode]);

  const parsedLocationId = useMemo(() => {
    const loc = locationIdRaw.trim() ? Number(locationIdRaw) : NaN;
    return Number.isFinite(loc) && loc >= 1 ? loc : null;
  }, [locationIdRaw]);

  const canSubmitBulk = useMemo(
    () => groupId >= 1 && quantity >= 1 && quantity <= 5000,
    [groupId, quantity],
  );
  const canSubmitSingle = useMemo(() => groupId >= 1, [groupId]);

  if (!open) return null;

  const submitBulk = async () => {
    if (!canSubmitBulk) {
      setErr("Wybierz grupę i poprawną ilość (1–5000).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await bulkCreateWmsCarriers(tenantId, {
        group_id: groupId,
        prefix,
        quantity,
        status,
        location_id: parsedLocationId,
        notes: notes.trim() || null,
      });
      onSuccess(res);
      setLocationIdRaw("");
      setNotes("");
      onClose();
    } catch (e) {
      setErr(apiErrMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitSingle = async () => {
    if (!canSubmitSingle) {
      setErr("Wybierz grupę nośników.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const c = await createWmsCarrier(tenantId, {
        barcode_prefix: prefix,
        carrier_group_id: groupId,
        status,
        current_location_id: parsedLocationId,
        notes: notes.trim() || null,
      });
      onSuccess(c);
      setLocationIdRaw("");
      setNotes("");
      onClose();
    } catch (e) {
      setErr(apiErrMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => void (mode === "bulk" ? submitBulk() : submitSingle());

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-black text-slate-900">Dodaj nośniki</h2>

        <div className="mt-4 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMode("bulk")}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide ${
              mode === "bulk" ? "bg-white text-amber-900 shadow" : "text-slate-600"
            }`}
          >
            Seria
          </button>
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide ${
              mode === "single" ? "bg-white text-amber-900 shadow" : "text-slate-600"
            }`}
          >
            1 nośnik
          </button>
        </div>

        <label className="mt-4 block text-xs font-bold uppercase text-slate-500">Grupa nośników</label>
        <select
          value={groupId || ""}
          onChange={(e) => setGroupId(Number(e.target.value) || 0)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        >
          {groups.length === 0 ? <option value="">— najpierw utwórz grupę —</option> : null}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.name || "").trim() || g.code} ({g.code})
            </option>
          ))}
        </select>

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Prefiks</label>
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

        {mode === "bulk" ? (
          <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Ilość do wygenerowania</label>
        ) : null}
        {mode === "bulk" ? (
          <input
            type="number"
            min={1}
            max={5000}
            value={quantity}
            onChange={(e) => setQuantity(Math.min(5000, Math.max(1, Number(e.target.value) || 1)))}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums"
          />
        ) : null}

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">Status początkowy</label>
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

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
          Lokalizacja <span className="font-normal normal-case text-slate-400">(opcjonalnie, ID)</span>
        </label>
        <input
          value={locationIdRaw}
          onChange={(e) => setLocationIdRaw(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
          placeholder="np. 4821"
        />

        <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
          Notatki <span className="font-normal normal-case text-slate-400">(opcjonalnie)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder={mode === "bulk" ? "Wspólna notatka dla całej partii" : "Notatka nośnika"}
        />

        {err ? <p className="mt-3 text-sm font-medium text-red-600">{err}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || groups.length === 0 || (mode === "bulk" ? !canSubmitBulk : !canSubmitSingle)}
            onClick={submit}
            className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black uppercase text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? "Tworzenie…" : mode === "bulk" ? `Utwórz ${quantity}` : "Utwórz 1 nośnik"}
          </button>
        </div>
      </div>
    </div>
  );
}
