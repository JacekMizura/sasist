import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractApiErrorMessage } from "../../api/authApi";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  WmsOperationalPageBody,
  WmsOperationalPageHeader,
  WmsOperationalPageShell,
} from "../../components/wms/execution/WmsOperationalPageShell";
import { executionContextFromBrakiHub } from "../../components/wms/execution/syncExecutionContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWarehouseExecution } from "../../context/WarehouseExecutionContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  listWmsOrderIssueTasks,
  resolveWmsOrderIssueTaskScan,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { useWmsShortagesRefresh } from "../../hooks/useWmsShortagesRefresh";
import { createWmsRecoveryBatch } from "../../api/wmsRecoveryBatchApi";
import { WMS_ROUTES } from "./wmsRoutes";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import {
  priorityBadgeClass,
  priorityLabelForTask,
  priorityLevelFromTask,
  sortTasksByPriority,
} from "./brakiPriority";
import { WMS_Z } from "../../components/wms/execution/wmsLayoutTokens";
import { mergeQueueCards, type NormalizedShortageQueueCard } from "./normalizeShortageQueueCard";
import { readBrakiQueueStage } from "./readBrakiOperationalState";
import { brakiQueueCardAccent, type BrakiQueueWorkflowId } from "./brakiWorkstreamUi";

type BrakiWorkflowFilterId =
  | "all"
  | "awaiting"
  | "relocation"
  | "relocation_partial"
  | "pick"
  | "ready_pack"
  | "pick_and_relocation";

const BRAKI_WORKFLOW_FILTERS: { id: BrakiWorkflowFilterId; label: string }[] = [
  { id: "all", label: "Wszystkie statusy" },
  { id: "awaiting", label: "Oczekujące" },
  { id: "relocation", label: "Rozlokowanie produktów" },
  { id: "relocation_partial", label: "Częściowe rozlokowanie produktów" },
  { id: "pick", label: "Produkty do zebrania z magazynu" },
  { id: "ready_pack", label: "Gotowe do pakowania" },
  { id: "pick_and_relocation", label: "Produkty do zebrania oraz rozlokowania" },
];

function normalizeWorkflowStatus(t: OrderIssueTaskListItemApi): BrakiWorkflowFilterId {
  const s = readBrakiQueueStage(t) as BrakiWorkflowFilterId;
  if (BRAKI_WORKFLOW_FILTERS.some((f) => f.id === s)) return s;
  return "awaiting";
}

function displayOrderNumber(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  return s.startsWith("#") ? s : `#${s}`;
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function openIssueTask(navigate: ReturnType<typeof useNavigate>, t: OrderIssueTaskListItemApi) {
  navigate(WMS_ROUTES.issueTask(t.id));
}

function cardStatusLabel(card: NormalizedShortageQueueCard): string {
  return card.workflow_stage || (card.raw.braki_workflow_status_label ?? "").trim() || "Braki w realizacji";
}

export default function WmsOrderIssuesHub() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const { setActiveContext } = useWarehouseExecution();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get("order_id");
  const {
    registerScanHandler,
    showScannerError,
    appendScanToHistory,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const issueTasksInflightRef = useRef(false);
  const [tasks, setTasks] = useState<OrderIssueTaskListItemApi[]>([]);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const [skippedTasks, setSkippedTasks] = useState<
    { task_id: number; order_id: number; order_number: string; error_message: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deeplinkMiss, setDeeplinkMiss] = useState<string | null>(null);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilterId, setActiveFilterId] = useState<BrakiWorkflowFilterId>("all");
  const [batchPending, setBatchPending] = useState(false);

  const activeFilterLabel =
    BRAKI_WORKFLOW_FILTERS.find((f) => f.id === activeFilterId)?.label ?? "Wszystkie statusy";

  const queueCards = useMemo(
    () => mergeQueueCards(tasks, skippedTasks),
    [tasks, skippedTasks],
  );

  const sortedCards = useMemo(() => {
    const sorted = sortTasksByPriority(queueCards.map((c) => c.raw));
    const order = new Map(sorted.map((t, i) => [t.id, i]));
    return [...queueCards].sort((a, b) => (order.get(a.task_id) ?? 999) - (order.get(b.task_id) ?? 999));
  }, [queueCards]);

  const filteredCards = useMemo(() => {
    if (activeFilterId === "all") return sortedCards;
    return sortedCards.filter((c) => normalizeWorkflowStatus(c.raw) === activeFilterId);
  }, [sortedCards, activeFilterId]);

  const startRecoveryBatch = useCallback(async () => {
    if (warehouseId == null || batchPending) return;
    setBatchPending(true);
    try {
      const batch = await createWmsRecoveryBatch(DAMAGE_TENANT_ID, warehouseId, { max_orders: 8 });
      navigate(WMS_ROUTES.pickingRecoveryBatch(batch.id));
    } catch (e: unknown) {
      setErr(extractApiErrorMessage(e, "Nie udało się utworzyć batch dogrywki."));
    } finally {
      setBatchPending(false);
    }
  }, [batchPending, navigate, warehouseId]);

  const load = useCallback((options?: { sync?: boolean }) => {
    if (warehouseId == null) {
      setTasks([]);
      setFilterCounts({});
      setLoading(false);
      return;
    }
    if (issueTasksInflightRef.current && !options?.sync) return;
    issueTasksInflightRef.current = true;
    setLoading(true);
    setErr(null);
    listWmsOrderIssueTasks(DAMAGE_TENANT_ID, warehouseId, { sync: options?.sync })
      .then((res) => {
        setTasks(res.tasks);
        setFilterCounts(res.filter_counts ?? {});
        setSkippedTasks(res.skipped_tasks ?? []);
      })
      .catch((e: unknown) => {
        setErr(extractApiErrorMessage(e, "Nie udało się wczytać kolejki Braki."));
        setTasks([]);
        setSkippedTasks([]);
        setFilterCounts({});
      })
      .finally(() => {
        issueTasksInflightRef.current = false;
        setLoading(false);
      });
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActiveContext(
      executionContextFromBrakiHub({
        queueCount: tasks.length,
        scanHint: "Zeskanuj EAN lub numer zamówienia — otworzy kartę braków",
      }),
    );
    return () => setActiveContext(null);
  }, [setActiveContext, tasks.length]);

  useWmsShortagesRefresh(() => void load(), { debounceMs: 600 });

  useEffect(() => {
    if (!orderIdFromUrl || loading || tasks.length === 0) {
      setDeeplinkMiss(null);
      return;
    }
    const oid = Number(orderIdFromUrl);
    if (!Number.isFinite(oid) || oid < 1) {
      setDeeplinkMiss(null);
      return;
    }
    const hit = tasks.find((x) => x.order_id === oid);
    if (hit) {
      setDeeplinkMiss(null);
      navigate(WMS_ROUTES.issueTask(hit.id), { replace: true });
    } else {
      setDeeplinkMiss(
        `Brak otwartego zgłoszenia dla zamówienia #${oid} w kolejce (sprawdź magazyn lub odśwież).`
      );
    }
  }, [orderIdFromUrl, loading, tasks, navigate]);

  useEffect(() => {
    setScannerInputPlaceholder("Zeskanuj zamówienie (numer / kod)");
    return () => setScannerInputPlaceholder("Wpisz lub wklej EAN (↑↓ historia)");
  }, [setScannerInputPlaceholder]);

  const resolveScan = useCallback(
    async (raw: string) => {
      const scan = normalizeScanEan(raw);
      if (!scan || warehouseId == null) return;
      try {
        const task = await resolveWmsOrderIssueTaskScan(DAMAGE_TENANT_ID, warehouseId, scan);
        appendScanToHistory(scan);
        openIssueTask(navigate, task);
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
      void resolveScan(ean);
    });
    return () => registerScanHandler(null);
  }, [registerScanHandler, resolveScan]);

  const countForFilter = (id: BrakiWorkflowFilterId): number => {
    if (id === "all") return filterCounts.all ?? tasks.length;
    return filterCounts[id] ?? tasks.filter((t) => normalizeWorkflowStatus(t) === id).length;
  };

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center text-slate-600 bg-white">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  return (
    <WmsOperationalPageShell className="bg-slate-100 antialiased">
      <WmsOperationalPageHeader>
        <div className="flex min-h-[52px] items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={WMS_ROUTES.menu}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Menu WMS"
            >
              <i className="fa-solid fa-arrow-left text-sm"></i>
            </Link>
            <h1 className="truncate text-lg font-bold text-slate-900 md:text-xl">
              Zamówienia z brakami{" "}
              <span className="font-medium text-slate-500">({queueCards.length})</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={batchPending}
              onClick={() => void startRecoveryBatch()}
              className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 md:flex"
            >
              {batchPending ? "Tworzenie…" : "Dogrywka batch"}
            </button>
            <button
              type="button"
              onClick={() => void load({ sync: true })}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <i className="fa-solid fa-rotate-right text-sm text-slate-500"></i>
              <span className="hidden md:inline">Odśwież</span>
            </button>
          </div>
        </div>
      </WmsOperationalPageHeader>

      <WmsOperationalPageBody className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          onClick={() => setIsFilterModalOpen(true)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 active:bg-slate-100 sm:w-72"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </div>
            <div className="flex flex-col justify-center">
              <span className="mb-0.5 text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400">
                Filtruj po statusie
              </span>
              <span className="truncate text-sm font-semibold leading-tight text-slate-900">{activeFilterLabel}</span>
            </div>
          </div>
        </button>

        <button className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500 active:bg-slate-100 sm:w-80">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="flex flex-col justify-center overflow-hidden">
            <span className="mb-0.5 text-[10px] font-bold uppercase leading-none tracking-wider text-slate-400">
              Aktywny dokument rozlokowania
            </span>
            <span className="truncate text-sm font-semibold leading-tight text-slate-900">Wybierz dokument...</span>
          </div>
        </button>
      </div>

        {err ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
            <p className="font-semibold">{err}</p>
            <button
              type="button"
              onClick={() => void load({ sync: true })}
              className="mt-2 text-xs font-bold uppercase tracking-wide text-amber-900 underline"
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : null}
        {deeplinkMiss ? (
          <p className="text-center text-sm font-medium text-amber-900">{deeplinkMiss}</p>
        ) : null}

        {!loading && skippedTasks.length > 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <p className="font-semibold">
              {skippedTasks.length} zadanie/zadań wczytano w trybie awaryjnym (niepełne dane).
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="fa-solid fa-circle-notch animate-spin text-4xl"></i>
            <p className="mt-4 text-sm font-medium">Ładowanie kolejki…</p>
          </div>
        ) : queueCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-800">Kolejka jest pusta</p>
            <p className="mt-2 text-sm text-slate-600">
              Po zgłoszeniu braku przy zbieraniu zamówienie pojawi się tutaj.
            </p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-800">Brak zamówień dla wybranego filtra</p>
            <p className="mt-2 text-sm text-slate-600">Zmień filtr statusu lub odśwież kolejkę.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCards.map((card: NormalizedShortageQueueCard) => {
              const t = card.raw;
              const wf = card.queue_stage as BrakiWorkflowFilterId;
              const badgeCount =
                card.recovery_count +
                card.relocation_count +
                card.ready_to_pack_count +
                card.missing_count;
              const missingNumber = Math.max(1, badgeCount);
              const num = displayOrderNumber(t.order_number).replace("#", "");
              const wfId = (
                BRAKI_WORKFLOW_FILTERS.some((f) => f.id === wf) ? wf : "awaiting"
              ) as BrakiQueueWorkflowId;
              const { accent, shortageBadge, statusBadge, icon } = brakiQueueCardAccent(wfId);

              const qtyLine =
                (t.issue_queue_summary_line ?? "").trim() ||
                card.workflow_stage ||
                (t.issue_queue_status_label ?? "").trim() ||
                "Braki w realizacji";

              const statusLabel = cardStatusLabel(card);
              const prLevel = priorityLevelFromTask(t);
              const prLabel = priorityLabelForTask(t);
              const prBadge = priorityBadgeClass(prLevel);

              return (
                <div
                  key={`${t.order_id}-${t.id}`}
                  onClick={() => openIssueTask(navigate, t)}
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.99] md:p-5"
                >
                  <div className={`absolute bottom-0 left-0 top-0 w-1.5 ${accent}`}></div>

                  <div className="pl-2">
                    <div className="mb-4 flex items-start justify-between">
                      <div>
                        <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:text-xs">
                          Zamówienie nr
                        </div>
                        <div className="text-xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-blue-700 md:text-2xl">
                          {num}
                        </div>
                      </div>
                      <div className={`rounded-lg border px-2.5 py-1.5 text-center ${shortageBadge}`}>
                        <div className="mb-0.5 text-[9px] font-bold uppercase">Braki</div>
                        <div className="text-lg font-bold leading-none md:text-xl">
                          {fmtQty(missingNumber)}
                          <span className="ml-0.5 text-[10px] md:text-xs">szt</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5 md:space-y-3">
                      {card.partial_data ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900">
                          ⚠ Niepełne dane operacyjne
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${prBadge}`}
                        >
                          {prLabel}
                        </span>
                        {(t.shortage_priority_score ?? 0) > 0 ? (
                          <span className="text-[10px] font-bold text-slate-400">
                            score {t.shortage_priority_score}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 w-14 shrink-0 text-[11px] font-semibold text-slate-500 md:text-xs">
                          Status:
                        </div>
                        <div
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge}`}
                        >
                          <i className={`fa-solid ${icon} text-[9px]`}></i> {statusLabel}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 w-14 shrink-0 text-[11px] font-semibold text-slate-500 md:text-xs">
                          Typ:
                        </div>
                        <div className="rounded border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold leading-tight text-blue-700 md:text-sm">
                          {qtyLine}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WmsOperationalPageBody>

      {isFilterModalOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center sm:items-center"
          style={{ zIndex: WMS_Z.modal }}
        >
          <div
            className="absolute inset-0 cursor-pointer bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsFilterModalOpen(false)}
          ></div>

          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[75vh] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4 md:p-5">
              <h2 className="text-lg font-bold text-slate-800">Filtruj zamówienia</h2>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300 active:scale-90"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="custom-scrollbar space-y-1.5 overflow-y-auto p-3 pb-6 md:p-4">
              {BRAKI_WORKFLOW_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setActiveFilterId(f.id);
                    setIsFilterModalOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all active:scale-[0.98] md:py-3.5 ${
                    activeFilterId === f.id
                      ? "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-sm font-bold md:text-base pr-2 text-left">{f.label}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold shrink-0 ${
                      activeFilterId === f.id ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {countForFilter(f.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </WmsOperationalPageShell>
  );
}
