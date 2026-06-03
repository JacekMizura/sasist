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

// Nowy, zoptymalizowany pod Zebrę komponent renderujący sekcje produktów
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
  const isCollected = variant === "collected";

  const sectionTitleClass = isCollected ? "text-emerald-600" : "text-amber-600";
  const iconClass = isCollected ? "fa-check-circle" : "fa-triangle-exclamation";

  return (
    <div className={isCollected ? "mt-6 p-4 pt-0 md:mt-8 md:p-6 md:pt-0" : "mt-2 p-4 pt-0 md:p-6 md:pt-0"}>
      <h2 className={`mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest ${sectionTitleClass}`}>
        <i className={`fa-solid ${iconClass}`}></i> {title}
      </h2>

      <div className="space-y-4">
        {lines.map((line, idx) => {
          // Bezpieczne mapowanie danych (dostosuj pola do swojego typu OrderIssueDetailLineApi)
          const key = `${(line as any).order_item_id ?? idx}-${(line as any).product_id ?? idx}`;
          const name = (line as any).product_name || (line as any).name || "Nieznany produkt";
          const ean = (line as any).product_ean || (line as any).ean || "—";
          const sku = (line as any).product_sku || (line as any).sku || "—";
          const location = (line as any).location_name || (line as any).location || "—";
          
          const missingQty = Number((line as any).missing_qty) || 0;
          const collectedQty = Number((line as any).collected_qty) || 0;
          const orderedQty = Number((line as any).ordered_qty) || 0;
          
          const pickedBy = (line as any).last_picked_by || (line as any).picked_by || "—";
          const pickedAt = (line as any).last_picked_at || (line as any).picked_at || "—";

          if (isCollected) {
            return (
              <div
                key={key}
                className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 opacity-90 shadow-sm transition-opacity hover:opacity-100 md:p-5"
              >
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-white p-1.5 shadow-sm md:h-20 md:w-20">
                    <img
                      src="https://placehold.co/100x100/ecfdf5/059669?text=OK"
                      alt="Produkt"
                      className="h-full w-full object-contain opacity-60 mix-blend-multiply"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1.5 truncate pr-2 text-sm font-bold text-slate-800 md:text-base">
                      {name}
                    </h3>
                    <div className="mb-2 text-xs text-slate-500">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">EAN</span> {ean}
                    </div>
                    <div className="mb-3 flex items-center gap-2 text-xs text-slate-600">
                      <span className="text-[10px] font-semibold uppercase text-slate-400">Lok.</span>
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-bold text-slate-800 shadow-sm">
                        {location}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs md:gap-3">
                      <span className="text-slate-500">
                        Zam.: <strong className="text-slate-700">{orderedQty || collectedQty}</strong> • Zebr.:{" "}
                        <strong className="text-slate-700">{collectedQty}</strong>
                      </span>
                      <span className="rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                        Zebrano
                      </span>
                    </div>
                    <div className="mt-3 border-t border-emerald-100 pt-3 text-[11px] leading-relaxed text-slate-500">
                      <strong className="text-slate-700">Akcja:</strong> {pickedBy} • {pickedAt}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Wariant: Pozostałe do zebrania (Braki) - GIGANTYCZNA LOKALIZACJA
          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 shadow-md md:p-5"
            >
              <div className="absolute bottom-0 left-0 top-0 w-1.5 bg-amber-400"></div>
              <div className="flex gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-white p-1.5 shadow-sm md:h-20 md:w-20">
                  <img
                    src="https://placehold.co/100x100/fffbeb/d97706?text=Brak"
                    alt="Brak"
                    className="h-full w-full object-contain opacity-80 mix-blend-multiply"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="mb-2 text-sm font-black leading-tight text-slate-900 md:text-lg">
                    {name}
                  </h3>
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">SKU</span> {sku}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">EAN</span> {ean}
                    </div>
                  </div>
                  
                  {/* Gigantyczna lokalizacja dla kolektora */}
                  <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white p-2 text-sm text-slate-800 shadow-sm md:p-3 md:text-base">
                    <i className="fa-solid fa-location-dot text-amber-500"></i>
                    <span className="mr-1 text-[10px] font-bold uppercase text-slate-400">Lok.</span>
                    <span className="font-black tracking-wider text-slate-900">
                      {location}
                    </span>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-2 text-xs md:gap-3">
                    <span className="rounded-md border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800">
                      Pozostało: {missingQty} szt.
                    </span>
                    <span className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-sm">
                      Do zebrania
                    </span>
                  </div>

                  <div className="mt-4 border-t border-amber-200 pt-3 text-[11px] leading-relaxed text-slate-600">
                    <strong className="text-slate-800">Ostatnia akcja:</strong> {pickedBy} • {pickedAt}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
    [appendScanToHistory, navigate, refocusScannerInput, showScannerError, warehouseId]
  );

  useEffect(() => {
    registerScanHandler((ean) => {
      void switchTaskByScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, switchTaskByScan]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center text-slate-600">
        <p>Wybierz magazyn w nagłówku.</p>
        <div className="mt-6">
          <Link to={WMS_ROUTES.braki()} className="font-semibold text-blue-600 underline">
            Wróć do kolejki braków
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <i className="fa-solid fa-circle-notch animate-spin text-4xl"></i>
        <p className="mt-4 text-sm font-medium">Ładowanie szczegółów…</p>
      </div>
    );
  }

  if (err || !task) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <div className="rounded-full bg-red-100 p-4 text-red-600">
          <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
        </div>
        <p className="text-center font-medium text-slate-700">{err ?? "Wystąpił błąd"}</p>
        <Link to={WMS_ROUTES.braki()} className="mt-2 font-semibold text-blue-600 underline">
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
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-50 antialiased">
      {/* Kontener Desktopowy Ograniczający Szerokość (Aplikacyjny wygląd) */}
      <div className="relative mx-auto flex h-full w-full max-w-4xl flex-col bg-white shadow-xl">
        
        {/* Top Navigation */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-2 md:h-16 md:px-4">
          <Link
            to={WMS_ROUTES.braki()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 active:bg-slate-200"
          >
            <i className="fa-solid fa-arrow-left"></i>
            <span>Kolejka braków</span>
          </Link>
          {/* Opcjonalne: awatar usera na dużych ekranach */}
          <div className="ml-auto hidden items-center gap-3 pr-2 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              <i className="fa-solid fa-user"></i>
            </div>
          </div>
        </header>

        {/* Obszar scrollowany (padding na dole robi miejsce na Bottom Action Bar) */}
        <main className="custom-scrollbar flex-1 overflow-y-auto pb-36 md:pb-40">
          
          {/* Główny Nagłówek Zamówienia */}
          <div className="p-4 pb-2 md:p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Zamówienie
                </div>
                <h1 className="font-mono text-3xl font-black tracking-tight text-slate-900">
                  {task.order_number}
                </h1>
              </div>
              <div className="hidden rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm md:block">
                {brakiQueueBucketLabel(task.braki_queue_bucket)}
              </div>
            </div>

            <div className="space-y-1.5 text-sm md:text-base">
              <div className="flex gap-2">
                <span className="font-medium text-slate-500">Klient:</span>
                <span className="font-semibold text-slate-800">
                  {(task.customer_name ?? "—").trim() || "—"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-500">Status:</span>
                <span className="font-bold text-slate-800">BRAKI</span>
                <span className="mx-1 text-slate-400">•</span>
                <span className="text-slate-600">{statusHeadline || "—"}</span>
              </div>
              
              {task.issue_queue_summary_line ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 md:text-sm">
                  <i className="fa-solid fa-circle-exclamation text-slate-400"></i>
                  <span>{task.issue_queue_summary_line}</span>
                </div>
              ) : null}
            </div>
          </div>

          {!hasAnyLines ? (
            <div className="m-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 md:m-6">
              Brak pozycji na zamówieniu.
            </div>
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
        </main>

        {/* Akcje Dolne (Pływające Bottom Action Bar dla kciuka) */}
        <div className="absolute bottom-0 left-0 z-30 w-full border-t border-slate-200 bg-white p-4 shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)] md:p-6">
          <div className="flex w-full flex-col gap-3 sm:flex-row-reverse">
            <button
              onClick={() =>
                recoveryReady
                  ? navigate(WMS_ROUTES.pickingRecovery(task.order_id))
                  : navigate(WMS_ROUTES.pickingProducts)
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 active:scale-[0.98] sm:flex-1 md:text-base"
            >
              Przejdź do zbierania
            </button>
            <Link
              to={`/orders/${task.order_id}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white py-3.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100 active:scale-[0.98] active:bg-slate-100 sm:flex-1 md:text-base"
            >
              Otwórz zamówienie OMS
            </Link>
          </div>
          {/* Bezpieczna strefa (Home Indicator dla iOS) */}
          <div className="mx-auto mt-2 h-1 w-1/3 rounded-full bg-slate-300 opacity-0"></div>
        </div>

      </div>
    </div>
  );
}