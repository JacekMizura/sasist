import { useEffect, useMemo, useState } from "react";
import {
  bulkCreateWmsCarriers,
  createWmsCarrier,
  type WarehouseCarrierBulkCreateResult,
  type WarehouseCarrierGroupRead,
  type WarehouseCarrierRead,
} from "../../../api/wmsCarrierApi";
import axios from "axios";
import {
  CARRIER_PREFIXES,
  CARRIER_PREFIX_META,
  carrierStatusOptions,
  type CarrierPrefix,
} from "./carrierConstants";
import {
  wmsInputClass,
  wmsSectionTitle,
  wmsSegmentedBtn,
  wmsSegmentedWrap,
  wmsSelectClass,
  wmsBtnPrimary,
  wmsBtnSecondary,
} from "../../../modules/carts/wmsOperationalUi";

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
  const [prefix, setPrefix] = useState<CarrierPrefix>("PAL");
  const [quantity, setQuantity] = useState(10);
  const [status, setStatus] = useState<string>("ACTIVE");
  const [locationIdRaw, setLocationIdRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const statusOptions = useMemo(() => carrierStatusOptions(), []);

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
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/50 p-3 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
        <h2 className="text-[17px] font-black text-slate-900">Dodaj nośniki</h2>

        <div className={`${wmsSegmentedWrap} mt-3`}>
          <button type="button" onClick={() => setMode("bulk")} className={wmsSegmentedBtn(mode === "bulk")}>
            Seria
          </button>
          <button type="button" onClick={() => setMode("single")} className={wmsSegmentedBtn(mode === "single")}>
            1 nośnik
          </button>
        </div>

        <label className={`${wmsSectionTitle} mt-4 block`}>Grupa nośników</label>
        <select
          value={groupId || ""}
          onChange={(e) => setGroupId(Number(e.target.value) || 0)}
          className={`${wmsSelectClass} mt-1.5`}
        >
          {groups.length === 0 ? <option value="">— najpierw utwórz grupę —</option> : null}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.name || "").trim() || g.code} ({g.code})
            </option>
          ))}
        </select>

        <p className={`${wmsSectionTitle} mt-3`}>Prefiks</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CARRIER_PREFIXES.map((p) => {
            const meta = CARRIER_PREFIX_META[p];
            const active = prefix === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPrefix(p)}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-bold transition ${
                  active ? "ring-2 ring-slate-400 ring-offset-1" : "opacity-80 hover:opacity-100"
                }`}
                style={{ borderColor: meta.border, backgroundColor: meta.bg, color: meta.fg }}
              >
                <span className="font-mono">{p}</span>
                <span className="font-normal">{meta.label}</span>
              </button>
            );
          })}
        </div>

        {mode === "bulk" ? (
          <>
            <label className={`${wmsSectionTitle} mt-3 block`}>Ilość</label>
            <input
              type="number"
              min={1}
              max={5000}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(5000, Math.max(1, Number(e.target.value) || 1)))}
              className={`${wmsInputClass} mt-1.5 font-mono tabular-nums`}
            />
          </>
        ) : null}

        <label className={`${wmsSectionTitle} mt-3 block`}>Status początkowy</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${wmsSelectClass} mt-1.5`}>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <label className={`${wmsSectionTitle} mt-3 block`}>
          Lokalizacja <span className="font-normal normal-case text-slate-400">(ID, opcjonalnie)</span>
        </label>
        <input
          value={locationIdRaw}
          onChange={(e) => setLocationIdRaw(e.target.value)}
          className={`${wmsInputClass} mt-1.5 font-mono`}
          placeholder="np. 4821"
        />

        <label className={`${wmsSectionTitle} mt-3 block`}>
          Opis <span className="font-normal normal-case text-slate-400">(opcjonalnie)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={`${wmsInputClass} mt-1.5 resize-none`}
          placeholder={mode === "bulk" ? "Wspólny opis partii" : "Opis nośnika"}
        />

        {err ? <p className="mt-3 text-[14px] font-medium text-red-600">{err}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={wmsBtnSecondary}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || groups.length === 0 || (mode === "bulk" ? !canSubmitBulk : !canSubmitSingle)}
            onClick={submit}
            className={wmsBtnPrimary}
          >
            {busy ? "Tworzenie…" : mode === "bulk" ? `Utwórz ${quantity}` : "Utwórz 1 nośnik"}
          </button>
        </div>
      </div>
    </div>
  );
}
