import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin, X } from "lucide-react";
import { extractApiErrorMessage } from "../../../api/authApi";
import {
  fetchWmsRelocationBatchContext,
  postWmsRelocationAddItems,
  postWmsRelocationStartSession,
  type WmsRelocationBatchContextApi,
} from "../../../api/wmsRelocationBatchApi";

export type RelocationBatchChoiceModalProps = {
  open: boolean;
  tenantId: number;
  warehouseId: number;
  orderId: number;
  onClose: () => void;
  /** Tylko dopisanie do ZWK — bez nawigacji. */
  onAddOnly: (result: { document_label: string; lines_added: number }) => void;
  /** Dopisanie + start sesji — nawigacja do zadania RELOCATION. */
  onAddAndGo: (result: { task_id: number; document_label: string | null }) => void;
};

export function RelocationBatchChoiceModal({
  open,
  tenantId,
  warehouseId,
  orderId,
  onClose,
  onAddOnly,
  onAddAndGo,
}: RelocationBatchChoiceModalProps) {
  const titleId = useId();
  const [ctx, setCtx] = useState<WmsRelocationBatchContextApi | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [acting, setActing] = useState<"add" | "go" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (typeof document !== "undefined") {
      document.body.setAttribute("data-modal-open", "true");
      return () => document.body.removeAttribute("data-modal-open");
    }
  }, [open]);

  const loadContext = useCallback(async () => {
    setLoadingCtx(true);
    setErr(null);
    try {
      const data = await fetchWmsRelocationBatchContext(tenantId, warehouseId, orderId);
      setCtx(data);
    } catch (e: unknown) {
      setErr(extractApiErrorMessage(e, "Nie udało się wczytać kontekstu rozlokowania."));
      setCtx(null);
    } finally {
      setLoadingCtx(false);
    }
  }, [orderId, tenantId, warehouseId]);

  useEffect(() => {
    if (open) void loadContext();
  }, [loadContext, open]);

  const handleAddOnly = async () => {
    setActing("add");
    setErr(null);
    try {
      const out = await postWmsRelocationAddItems(tenantId, warehouseId, { order_id: orderId });
      onAddOnly({ document_label: out.document_label, lines_added: out.lines_added });
      onClose();
    } catch (e: unknown) {
      setErr(extractApiErrorMessage(e, "Nie udało się dodać pozycji do dokumentu."));
    } finally {
      setActing(null);
    }
  };

  const handleAddAndGo = async () => {
    setActing("go");
    setErr(null);
    try {
      const added = await postWmsRelocationAddItems(tenantId, warehouseId, { order_id: orderId });
      const started = await postWmsRelocationStartSession(tenantId, warehouseId, {
        order_id: orderId,
        task_id: added.relocation_task_id ?? ctx?.relocation_task_id ?? undefined,
      });
      onAddAndGo({
        task_id: started.task_id,
        document_label: added.document_label ?? started.document_label,
      });
      onClose();
    } catch (e: unknown) {
      setErr(extractApiErrorMessage(e, "Nie udało się rozpocząć rozlokowania."));
    } finally {
      setActing(null);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const pending = acting !== null;
  const docLabel =
    ctx?.document_label ??
    (ctx?.has_active_document ? `ZWK (id ${ctx.document_id})` : null);

  const modal = (
    <div
      className="confirm-modal-layer fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-[3px]"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[510] w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-bold text-slate-900">
                Produkty wymagają rozlokowania
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Cel rozlokowania: nośnik logistyczny (paleta, skrzynia…) lub lokacja magazynowa. Możesz
                dodać produkty do ZWK teraz i wykonać rozlokowanie później.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loadingCtx ? (
          <div className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Ładowanie…
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-slate-700">
            {ctx && ctx.pending_lines > 0 ? (
              <p>
                Do rozlokowania produktów: <strong>{ctx.pending_lines}</strong>{" "}
                {ctx.pending_lines === 1 ? "pozycja" : "pozycji"}.
              </p>
            ) : null}
            {docLabel ? (
              <p className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-indigo-900">
                Produkty zostaną dodane do dokumentu <strong className="font-mono">{docLabel}</strong>
              </p>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                Zostanie utworzony nowy dokument roboczy ZWK.
              </p>
            )}
          </div>
        )}

        {err ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={pending || loadingCtx}
            onClick={() => void handleAddOnly()}
            className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {acting === "add" ? "Dodawanie…" : "Tylko dodaj do dokumentu"}
          </button>
          <button
            type="button"
            disabled={pending || loadingCtx}
            onClick={() => void handleAddAndGo()}
            className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
          >
            {acting === "go" ? "Przygotowanie…" : "Dodaj i przejdź do rozlokowania"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
