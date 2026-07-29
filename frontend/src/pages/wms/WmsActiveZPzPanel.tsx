import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { closeActiveCollectiveZPz, getActiveCollectiveZPz, getWmsReturnsModeSettings } from "../../api/wmsReturnsApi";
import { printZPzLabel } from "../../api/zPzLabelPrintApi";
import { PrintFlowModals, usePrintMethodFlow } from "../../components/printing";
import { resolvePrintWorkstation } from "../../components/printing/resolvePrintWorkstation";
import type { ActiveZPzRead } from "../../types/wmsReturn";
import { displayWarehouseDocumentNumber } from "../../utils/warehouseDocumentNumberDisplay";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { formatWmsListDate } from "./wmsListFormatters";

type Props = {
  warehouseId: number | null;
  refreshKey?: number;
  onClosed?: (documentNumber: string) => void;
};

export function WmsActiveZPzPanel({ warehouseId, refreshKey = 0, onClosed }: Props) {
  const printFlow = usePrintMethodFlow({
    tenantId: DAMAGE_TENANT_ID,
    warehouseId,
    printerKind: "label",
  });
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

  const requestZPzLabelPrint = useCallback(
    (stockDocumentId: number, templateId: number) => {
      void printFlow.requestPrint({
        onCloudPrint: async (workstationId) => {
          await printZPzLabel(
            stockDocumentId,
            templateId,
            DAMAGE_TENANT_ID,
            warehouseId,
            workstationId,
          );
        },
        onBrowserPrint: async () => {
          await printZPzLabel(stockDocumentId, templateId, DAMAGE_TENANT_ID, warehouseId, null, {
            forceTransport: "browser",
          });
        },
        onDownloadPdf: async () => {
          await printZPzLabel(stockDocumentId, templateId, DAMAGE_TENANT_ID, warehouseId, null, {
            forceTransport: "download",
          });
        },
      });
    },
    [printFlow, warehouseId],
  );

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
          const resolution = await resolvePrintWorkstation(DAMAGE_TENANT_ID, warehouseId);
          if (resolution.kind === "session" || resolution.kind === "auto") {
            await printZPzLabel(
              res.stock_document_id,
              settings.z_pz_label_template_id,
              DAMAGE_TENANT_ID,
              warehouseId,
              resolution.workstationId,
            );
          } else if (resolution.kind === "picker") {
            requestZPzLabelPrint(res.stock_document_id, settings.z_pz_label_template_id);
          } else {
            toast.error("Brak przypisanego stanowiska — etykieta Z-PZ nie została wysłana.");
          }
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

  const modals = <PrintFlowModals flow={printFlow} />;
  const flowOpen = printFlow.stationPickerOpen || printFlow.methodOpen;

  if (loading && !doc) return flowOpen ? modals : null;
  if (!doc) {
    if (err) {
      return (
        <>
          {modals}
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {err}
          </div>
        </>
      );
    }
    return flowOpen ? modals : null;
  }

  const createdLabel = formatWmsListDate(doc.created_at ?? null);
  const unitSum = Math.round(doc.unit_sum * 100) / 100;
  const rmzCount = doc.rmz_count ?? 0;
  const docNumber = displayWarehouseDocumentNumber(doc.document_number);

  return (
    <>
      {modals}
      <section className="w-full text-left" aria-label="Aktywny dokument zwrotów">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Aktywny dokument zwrotów</h3>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-mono text-sm font-bold text-slate-900">{docNumber}</span>
                <span className="shrink-0 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                  Aktywny
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600">
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">RMZ</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">{rmzCount}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Pozycje</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">{doc.line_count}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Sztuki</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">{unitSum}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Data utworzenia</dt>
                  <dd className="tabular-nums">{createdLabel || "—"}</dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              disabled={closing}
              onClick={() => void handleClose()}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {closing ? "…" : "Zamknij dokument"}
            </button>
          </div>
          {err ? <p className="mt-2 text-xs text-rose-700">{err}</p> : null}
        </div>
      </section>
    </>
  );
}
