import { useCallback, useEffect, useState } from "react";
import {
  getOrderWmsValidation,
  postOrderWmsRevalidate,
  type WmsOrderValidationStateApi,
} from "../../api/wmsOrderValidationApi";

type Props = {
  tenantId: number;
  warehouseId: number;
  orderId: number;
};

export function WmsOrderValidationPanel({ tenantId, warehouseId, orderId }: Props) {
  const [state, setState] = useState<WmsOrderValidationStateApi | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = await getOrderWmsValidation(tenantId, warehouseId, orderId);
      setState(data);
    } catch {
      setErr("Nie udało się wczytać Walidacji WMS.");
      setState(null);
    }
  }, [tenantId, warehouseId, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRevalidate = async () => {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await postOrderWmsRevalidate(tenantId, warehouseId, orderId);
      if (res.validation_status === "PASS") {
        setMsg(
          res.needs_manual_status
            ? "PASS — ustaw status ręcznie (brak zapisanego poprzedniego statusu)."
            : res.status_changed
              ? "PASS — przywrócono poprzedni status."
              : "PASS — walidacja OK.",
        );
      } else {
        setMsg("FAIL — zamówienie nadal nie przechodzi walidacji.");
      }
      await load();
    } catch {
      setErr("Rewalidacja nie powiodła się.");
    } finally {
      setBusy(false);
    }
  };

  if (!state && !err) {
    return <p className="text-xs text-slate-500">Walidacja WMS…</p>;
  }

  const failed = state?.validation_status === "FAIL" || Boolean(state?.has_stored_failure);
  const issues = state?.issues ?? [];

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Walidacja WMS</h3>
          <p className={`mt-1 text-sm font-black ${failed ? "text-amber-800" : "text-emerald-700"}`}>
            Status: {failed ? "NIE PRZESZŁO" : "OK"}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRevalidate()}
          className="shrink-0 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-800 hover:bg-white disabled:opacity-40"
        >
          {busy ? "…" : "Sprawdź ponownie"}
        </button>
      </div>
      {err ? <p className="text-xs font-semibold text-red-700 mb-2">{err}</p> : null}
      {msg ? <p className="text-xs font-semibold text-slate-700 mb-2">{msg}</p> : null}
      {issues.length > 0 ? (
        <ul className="space-y-2">
          {issues.map((iss, idx) => (
            <li key={`${iss.reason_code}-${iss.product_id ?? idx}`} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs">
              <p className="font-bold text-slate-900">
                {iss.ean ? `EAN ${iss.ean}` : iss.sku ? `SKU ${iss.sku}` : iss.product_id ? `#${iss.product_id}` : "Pozycja"}
                {iss.product_name ? ` — ${iss.product_name}` : ""}
              </p>
              <p className="text-amber-900 mt-0.5">{iss.reason_label}</p>
              {iss.required_qty != null && iss.allocatable_qty != null ? (
                <p className="text-slate-600 mt-0.5 tabular-nums">
                  Dostępne {iss.allocatable_qty} / wymagane {iss.required_qty}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">Brak problemów walidacyjnych.</p>
      )}
    </div>
  );
}
