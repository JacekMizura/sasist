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
        <div className="mx-auto mb-2 w-full max-w-sm rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {err}
        </div>
      );
    }
    return null;
  }

  const createdLabel = formatWmsListDate(doc.created_at ?? null);
  const unitSum = Math.round(doc.unit_sum * 100) / 100;
  const rmzCount = doc.rmz_count ?? 0;

  return (
    <section
      className="mx-auto mb-2 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
      aria-label="Aktywny dokument zwrotów"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-mono text-sm font-bold text-slate-900">{doc.document_number}</span>
            <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">
              AKTYWNY
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] leading-snug text-slate-600">
            <div>
              <dt className="sr-only">Liczba RMZ</dt>
              <dd>
                RMZ: <span className="font-semibold tabular-nums text-slate-800">{rmzCount}</span>
              </dd>
            </div>
            <div>
              <dt className="sr-only">Liczba pozycji</dt>
              <dd>
                Pozycje: <span className="font-semibold tabular-nums text-slate-800">{doc.line_count}</span>
              </dd>
            </div>
            <div>
              <dt className="sr-only">Liczba sztuk</dt>
              <dd>
                Sztuki: <span className="font-semibold tabular-nums text-slate-800">{unitSum}</span>
              </dd>
            </div>
            <div>
              <dt className="sr-only">Data utworzenia</dt>
              <dd className="tabular-nums">{createdLabel || "—"}</dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          disabled={closing}
          onClick={() => void handleClose()}
          className="inline-flex h-7 shrink-0 items-center justify-center rounded-md bg-slate-800 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {closing ? "…" : "Zamknij dokument"}
        </button>
      </div>
      {err ? <p className="mt-1.5 text-[11px] text-rose-700">{err}</p> : null}
    </section>
  );
}
