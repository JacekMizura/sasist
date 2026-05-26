import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  getWmsOrderIssueTask,
  resolveWmsOrderIssueTaskScan,
  type OrderIssueDetailLineApi,
  type OrderIssueOrderContextApi,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { OrderIssueDetailLineRow } from "../../components/wms/OrderIssueDetailLineRow";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { WMS_ROUTES } from "./wmsRoutes";

function brakiQueueBucketLabel(bucket: string | undefined): string {
  const b = (bucket ?? "").trim();
  if (b === "waiting_customer") return "Oczekuje na klienta";
  if (b === "recovery_ready") return "Gotowe do dogrywki zbierki";
  return "Oczekuje na decyzję OMS";
}

function emptyContext(ctx: OrderIssueOrderContextApi | undefined): OrderIssueOrderContextApi {
  return ctx ?? { collected_lines: [], shortage_decision_lines: [], remaining_pick_lines: [] };
}

function totalContextLines(ctx: OrderIssueOrderContextApi): number {
  return (ctx.collected_lines?.length ?? 0) + (ctx.remaining_pick_lines?.length ?? 0);
}

function IssueDetailSection({
  title,
  lines,
  variant,
}: {
  title: string;
  lines: OrderIssueDetailLineApi[];
  variant: "collected" | "remaining";
}) {
  if (!lines.length) return null;
  const titleClass = variant === "collected" ? "text-emerald-800" : "text-amber-900";
  return (
    <section className="mt-8">
      <h2 className={`text-sm font-extrabold uppercase tracking-wide ${titleClass}`}>{title}</h2>
      <div className="mt-3 space-y-2">
        {lines.map((line, idx) => (
          <OrderIssueDetailLineRow
            key={`${line.order_item_id}-${line.product_id}-${idx}`}
            line={line}
            variant={variant}
          />
        ))}
      </div>
    </section>
  );
}

/** Szczegóły pozycji kolejki braków — widok operacyjny dla magazynu. */
export default function WmsOrderIssueDetailPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const {
    registerScanHandler,
    showScannerError,
    appendScanToHistory,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const [task, setTask] = useState<OrderIssueTaskListItemApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (warehouseId == null || !Number.isFinite(taskId) || taskId < 1) {
      setTask(null);
      setLoading(false);
      setErr("Nieprawidłowe zadanie.");
      return;
    }
    setLoading(true);
    setErr(null);
    getWmsOrderIssueTask(DAMAGE_TENANT_ID, warehouseId, taskId)
      .then(setTask)
      .catch(() => {
        setTask(null);
        setErr("Nie znaleziono zadania.");
      })
      .finally(() => setLoading(false));
  }, [warehouseId, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setScannerInputPlaceholder("Inne zamówienie — zeskanuj kod");
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [setScannerInputPlaceholder]);

  const switchTaskByScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null) return;
      try {
        const next = await resolveWmsOrderIssueTaskScan(DAMAGE_TENANT_ID, warehouseId, scan);
        appendScanToHistory(scan);
        navigate(WMS_ROUTES.issueTask(next.id), { replace: true });
        refocusScannerInput();
      } catch {
        showScannerError("Brak zamówienia lub brak otwartego zgłoszenia braków.");
        refocusScannerInput();
      }
    },
    [appendScanToHistory, navigate, refocusScannerInput, showScannerError, warehouseId],
  );

  useEffect(() => {
    registerScanHandler((ean) => {
      void switchTaskByScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, switchTaskByScan]);

  if (warehouseId == null) {
    return (
      <div className="p-6 text-center text-slate-600">
        Wybierz magazyn w nagłówku.
        <div className="mt-6">
          <Link to={WMS_ROUTES.braki()} className="font-semibold text-slate-900 underline">
            Wróć
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Ładowanie…
      </div>
    );
  }

  if (err || !task) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6">
        <p className="text-center text-slate-700">{err ?? "Błąd"}</p>
        <Link to={WMS_ROUTES.braki()} className="font-semibold text-slate-900 underline">
          Wróć do kolejki braków
        </Link>
      </div>
    );
  }

  const ctx = emptyContext(task.order_context);
  const hasAnyLines = totalContextLines(ctx) > 0;
  const recoveryReady =
    (task.braki_queue_bucket ?? "") === "recovery_ready" || (task.replacement_pick_pending_count ?? 0) > 0;
  const statusHeadline = [task.order_ui_status_name, brakiQueueBucketLabel(task.braki_queue_bucket)]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-0 flex-1">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur-sm">
        <Link to={WMS_ROUTES.braki()} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          ← Kolejka braków
        </Link>
      </div>

      <div className="w-full px-4 pb-12 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Zamówienie</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{task.order_number}</h1>
          <span className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-800">
            {brakiQueueBucketLabel(task.braki_queue_bucket)}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Klient:</span> {(task.customer_name ?? "—").trim() || "—"}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Status:</span> {statusHeadline || "—"}
        </p>
        {task.issue_queue_summary_line ? (
          <p className="mt-2 text-xs font-medium text-slate-600">{task.issue_queue_summary_line}</p>
        ) : null}

        {!hasAnyLines ? (
          <p className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Brak pozycji na zamówieniu.
          </p>
        ) : (
          <>
            <IssueDetailSection
              title="Produkty zebrane"
              lines={ctx.collected_lines ?? []}
              variant="collected"
            />
            <IssueDetailSection
              title="Pozostałe do zebrania"
              lines={ctx.remaining_pick_lines ?? []}
              variant="remaining"
            />
          </>
        )}

        <div className="mt-10 flex flex-col gap-3">
          <button
            type="button"
            className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
            onClick={() =>
              recoveryReady
                ? navigate(WMS_ROUTES.pickingRecovery(task.order_id))
                : navigate(WMS_ROUTES.pickingProducts)
            }
          >
            Przejdź do zbierania
          </button>
          <Link
            to={`/orders/${task.order_id}`}
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-50"
          >
            Otwórz zamówienie OMS
          </Link>
        </div>
      </div>
    </div>
  );
}
