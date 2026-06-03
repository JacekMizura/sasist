import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  listWmsOrderIssueTasks,
  resolveWmsOrderIssueTaskScan,
  type OrderIssueTaskListItemApi,
} from "../../api/wmsOrderIssueTasksApi";
import { WMS_ROUTES, WMS_SHORTAGES_UPDATED_EVENT } from "./wmsRoutes";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";

type BrakiBucketId = "awaiting_oms" | "recovery_ready" | "waiting_customer";

function normalizeBrakiBucket(t: OrderIssueTaskListItemApi): BrakiBucketId {
  const b = (t.braki_queue_bucket ?? "").trim();
  if (b === "recovery_ready" || b === "waiting_customer" || b === "awaiting_oms") return b;
  return "awaiting_oms";
}

const BRAKI_BUCKET_SECTION: Record<BrakiBucketId, string> = {
  awaiting_oms: "Oczekuje na decyzję OMS",
  recovery_ready: "Gotowe do dogrywki zbierki",
  waiting_customer: "Oczekuje na klienta",
};

function displayOrderNumber(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  return s.startsWith("#") ? s : `#${s}`;
}

function plProduktyWord(n: number): string {
  const abs = Math.abs(Math.floor(n));
  if (abs === 1) return "produkt";
  const mod100 = abs % 100;
  if (mod100 >= 12 && mod100 <= 14) return "produktów";
  const mod10 = abs % 10;
  if (mod10 >= 2 && mod10 <= 4) return "produkty";
  return "produktów";
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function formatShortageClock(iso: string | undefined): string {
  const s = (iso ?? "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function shortageLinesForCard(t: OrderIssueTaskListItemApi) {
  return (t.shortage_lines ?? []).filter((l) => l.missing_qty > 1e-9);
}

function openIssueTask(navigate: ReturnType<typeof useNavigate>, t: OrderIssueTaskListItemApi) {
  navigate(WMS_ROUTES.issueTask(t.id));
}

export default function WmsOrderIssuesHub() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get("order_id");
  const {
    registerScanHandler,
    showScannerError,
    appendScanToHistory,
    setScannerInputPlaceholder,
    refocusScannerInput,
  } = useWmsScanner();

  const [tasks, setTasks] = useState<OrderIssueTaskListItemApi[]>([]);
  const [skippedTasks, setSkippedTasks] = useState<
    { task_id: number; order_id: number; order_number: string; error_message: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deeplinkMiss, setDeeplinkMiss] = useState<string | null>(null);

  // Stany dla UI modala filtrów
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("Wszystkie statusy");

  const taskGroups = useMemo(() => {
    const order: BrakiBucketId[] = ["awaiting_oms", "recovery_ready", "waiting_customer"];
    const m = new Map<BrakiBucketId, OrderIssueTaskListItemApi[]>();
    for (const id of order) m.set(id, []);
    for (const t of tasks) {
      const b = normalizeBrakiBucket(t);
      m.get(b)!.push(t);
    }
    return order
      .map((id) => ({ id, label: BRAKI_BUCKET_SECTION[id], items: m.get(id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [tasks]);

  const load = useCallback(() => {
    if (warehouseId == null) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    listWmsOrderIssueTasks(DAMAGE_TENANT_ID, warehouseId)
      .then((res) => {
        setTasks(res.tasks);
        setSkippedTasks(res.skipped_tasks ?? []);
      })
      .catch(() => {
        setErr("Nie udało się wczytać kolejki.");
        setSkippedTasks([]);
      })
      .finally(() => setLoading(false));
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpd = () => void load();
    window.addEventListener(WMS_SHORTAGES_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(WMS_SHORTAGES_UPDATED_EVENT, onUpd);
  }, [load]);

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

  const filteredGroups = useMemo(() => {
    if (activeFilter === "Wszystkie statusy") return taskGroups;
    return taskGroups.filter((g) => g.label === activeFilter);
  }, [taskGroups, activeFilter]);

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6 text-center text-slate-600 bg-white">
        Wybierz magazyn w nagłówku.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white antialiased">
      {/* Top Bar */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 md:h-16 md:px-6">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent text-slate-500 transition-all hover:bg-slate-100 active:scale-95 md:h-9 md:w-9 md:border-slate-200"
          >
            <i className="fa-solid fa-arrow-left text-lg md:text-sm"></i>
          </button>
          <h1 className="text-lg font-bold leading-tight text-slate-800 md:text-xl">
            Zamówienia z brakami <span className="font-medium text-slate-500">({tasks.length})</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-600 transition-all hover:bg-slate-50 active:scale-95 md:px-4"
          >
            <i className="fa-solid fa-rotate-right text-lg text-slate-500 md:text-sm"></i>
            <span className="hidden text-sm md:inline">Odśwież</span>
          </button>
        </div>
      </header>

      {/* Sekcja Filtrów - Czyste białe tło, ikony w formacie SVG */}
      <div className="z-10 flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:gap-4 md:px-6 md:py-4">
        {/* Przycisk Filtru Statusu */}
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
              <span className="truncate text-sm font-semibold leading-tight text-slate-900">{activeFilter}</span>
            </div>
          </div>
        </button>

        {/* Przycisk Aktywnego Dokumentu */}
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

      {/* Komunikaty błędów */}
      <div className="px-3 pt-3 md:px-6 md:pt-4 bg-white">
        {err ? <p className="text-center text-sm font-medium text-amber-800">{err}</p> : null}
        {deeplinkMiss ? (
          <p className="text-center text-sm font-medium text-amber-900">{deeplinkMiss}</p>
        ) : null}

        {!loading && skippedTasks.length > 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <p className="font-semibold">
              {skippedTasks.length} zadanie/zadań w kolejce nie mogło zostać wczytane.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs">
              {skippedTasks.slice(0, 5).map((s) => (
                <li key={s.task_id}>
                  {displayOrderNumber(s.order_number)} — {s.error_message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Lista Zamówień - Tło główne zmienione na białe */}
      <main className="custom-scrollbar flex-1 overflow-y-auto p-3 pb-8 md:p-6 bg-white">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <i className="fa-solid fa-circle-notch animate-spin text-4xl"></i>
            <p className="mt-4 text-sm font-medium">Ładowanie kolejki…</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
            <p className="text-base font-semibold text-slate-800">
              {skippedTasks.length > 0 ? "Brak widocznych kart w kolejce" : "Kolejka jest pusta"}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {skippedTasks.length > 0
                ? "Zadania istnieją, ale wystąpił błąd odczytu."
                : "Po zgłoszeniu braku przy zbieraniu zamówienie pojawi się tutaj."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {filteredGroups.flatMap((g) =>
              g.items.map((t) => {
                const sl = shortageLinesForCard(t);
                const lineCount = sl.length;
                const totalMissing = sl.reduce((s, l) => s + (Number(l.missing_qty) || 0), 0);
                const r = t.replacement_pick_pending_count ?? 0;
                const num = displayOrderNumber(t.order_number).replace("#", "");

                const bucketId = normalizeBrakiBucket(t);
                const isDanger = bucketId === "awaiting_oms";
                const isWarning = bucketId === "waiting_customer";
                
                const accentColor = isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500";
                const badgeColor = isDanger
                  ? "bg-red-50 border-red-200 text-red-700"
                  : isWarning
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700";
                const statusColor = isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500";
                const iconClass = isDanger ? "fa-triangle-exclamation" : isWarning ? "fa-clock" : "fa-check";

                let qtyLine = "";
                let missingNumber = totalMissing;
                
                if (lineCount > 0) {
                  qtyLine = `${lineCount} ${plProduktyWord(lineCount)} · brak do zebrania`;
                } else if (r > 0) {
                  missingNumber = r;
                  qtyLine = `Gotowe do zebrania po zamianie`;
                } else {
                  missingNumber = 1;
                  qtyLine = (t.issue_queue_summary_line ?? "").trim() || "Wymaga uwagi";
                }

                return (
                  <div
                    key={t.id}
                    onClick={() => openIssueTask(navigate, t)}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.99] md:p-5"
                  >
                    <div className={`absolute bottom-0 left-0 top-0 w-1.5 ${accentColor}`}></div>

                    <div className="pl-2">
                      <div className="mb-4 flex items-start justify-between">
                        <div>
                          <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:text-xs">
                            Zamówienie nr
                          </div>
                          <div className="text-xl font-black tracking-tight text-slate-900 transition-colors group-hover:text-blue-600 md:text-2xl">
                            {num}
                          </div>
                        </div>
                        <div
                          className={`rounded-lg border px-2.5 py-1.5 text-center shadow-sm ${badgeColor}`}
                        >
                          <div className="mb-0.5 text-[9px] font-black uppercase">Braki</div>
                          <div className="text-lg font-black leading-none md:text-xl">
                            {fmtQty(missingNumber)}
                            <span className="ml-0.5 text-[10px] md:text-xs">szt</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5 md:space-y-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 w-14 shrink-0 text-[11px] font-semibold text-slate-500 md:text-xs">
                            Status:
                          </div>
                          <div
                            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm ${statusColor}`}
                          >
                            <i className={`fa-solid ${iconClass} text-[9px]`}></i> {g.label}
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
              })
            )}
          </div>
        )}
      </main>

      {/* Modal: Filtruj zamówienia po statusie */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
              <button
                onClick={() => {
                  setActiveFilter("Wszystkie statusy");
                  setIsFilterModalOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all active:scale-[0.98] md:py-3.5 ${
                  activeFilter === "Wszystkie statusy"
                    ? "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="text-sm font-bold md:text-base">Wszystkie statusy</span>
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800 shrink-0">
                  {tasks.length}
                </span>
              </button>

              {taskGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    setActiveFilter(g.label);
                    setIsFilterModalOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all active:scale-[0.98] md:py-3.5 ${
                    activeFilter === g.label
                      ? "border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100"
                      : "border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                  }`}
                >
                  <span className="text-sm font-semibold md:text-base pr-2 text-left">{g.label}</span>
                  <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700 shrink-0">
                    {g.items.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}