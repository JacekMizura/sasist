import { useCallback, useEffect, useState } from "react";

import { closeActiveCollectiveZPz, getActiveCollectiveZPz, getWmsReturnsModeSettings } from "../../api/wmsReturnsApi";
import { printZPzLabel } from "../../api/zPzLabelPrintApi";
import type { ActiveZPzRead } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { formatWmsListDate } from "./wmsListFormatters";

type Props = {
  warehouseId: number | null;
  refreshKey?: number;
  onClosed?: (documentNumber: string) => void;
};

export function WmsActiveZPzPanel({ warehouseId, refreshKey = 0, onClosed }: Props) {
  const [doc, setDoc] = useState<ActiveZPzRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setDoc(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const row = await getActiveCollectiveZPz({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setDoc(row);
    } catch {
      setErr("Nie udało się wczytać aktywnego Z-PZ.");
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleClose = async () => {
    if (warehouseId == null || warehouseId <= 0 || closing) return;
    const ok = window.confirm("Zamknąć aktywny dokument Z-PZ?");
    if (!ok) return;
    setClosing(true);
    setErr(null);
    try {
      const settings = await getWmsReturnsModeSettings({ warehouseId });
      const res = await closeActiveCollectiveZPz({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setDoc(null);
      onClosed?.(res.document_number);
      if (settings.z_pz_print_label_on_close && settings.z_pz_label_template_id != null) {
        try {
          await printZPzLabel(res.stock_document_id, settings.z_pz_label_template_id, DAMAGE_TENANT_ID);
        } catch {
          setErr("Dokument zamknięty, ale wydruk etykiety nie powiódł się.");
        }
      }
      void load();
    } catch (e: unknown) {
      let msg = "Nie udało się zamknąć dokumentu Z-PZ.";
      if (typeof e === "object" && e !== null && "response" in e) {
        const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
        if (typeof d === "string" && d.trim()) msg = d.trim();
      }
      setErr(msg);
    } finally {
      setClosing(false);
    }
  };

  if (loading && !doc) return null;
  if (!doc) {
    if (err) {
      return (
        <div className="mx-auto mb-2 w-full max-w-5xl rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </div>
      );
    }
    return null;
  }

  const createdLabel = formatWmsListDate(doc.created_at ?? null);
  const lineLabel =
    doc.line_count === 1 ? "pozycja" : doc.line_count >= 2 && doc.line_count <= 4 ? "pozycje" : "pozycji";
  const unitSum = Math.round(doc.unit_sum * 100) / 100;

  return (
    <section
      className="mx-auto mb-3 w-full max-w-5xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
      aria-label="Aktywny dokument zwrotów"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-900">{doc.document_number}</span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
              AKTYWNY
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            {doc.line_count} {lineLabel} · {unitSum} szt.
          </p>
          {createdLabel ? <p className="text-xs text-slate-500">utworzono {createdLabel}</p> : null}
        </div>
        <button
          type="button"
          disabled={closing}
          onClick={() => void handleClose()}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {closing ? "Zamykanie…" : "Zamknij dokument"}
        </button>
      </div>
      {err ? <p className="mt-2 text-xs text-rose-700">{err}</p> : null}
    </section>
  );
}
