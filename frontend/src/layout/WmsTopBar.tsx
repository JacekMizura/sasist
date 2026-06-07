import { useCallback, useEffect, useRef, useState } from "react";
import { Factory, Maximize2, Menu, Minimize2, ScanLine, ArrowLeft } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import WmsTopBarModuleNav from "../components/wms/WmsTopBarModuleNav";
import GlobalWarehouseSelect from "../components/layout/GlobalWarehouseSelect";
import UserAccountMenu from "../components/layout/UserAccountMenu";
import { SHOW_WMS_DEV_SCANNER } from "../context/WmsScannerContext";
import { useAuth } from "../context/AuthContext";
import { useWarehouse } from "../context/WarehouseContext";
import { useWmsPinnedModes } from "../hooks/useWmsPinnedModes";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";
import {
  listWarehousePriorityTasks,
  updateWarehousePriorityTask,
  type WarehousePriorityTask,
} from "../api/warehouseOperationsApi";
import { clearActivePriorityTask, saveActivePriorityTask } from "../pages/wms/activePriorityTask";
import {
  formatOperationalDuration,
  formatOperationalDurationSince,
} from "../utils/formatOperationalDuration";
import { useVisibilityPolling } from "../hooks/useVisibilityPolling";

const PRIORITY_TASKS_POLL_MS = 30_000;

// Zdefiniowane zwarte, czyste style dla przycisków ikon i menu
const iconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-transparent text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";

const menuNavBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-transform hover:bg-slate-800 active:scale-95 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";

/**
 * Pasek WMS: czysty, zwarty układ terminalowy na pełną szerokość z pomarańczowymi akcentami.
 */
export default function WmsTopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { showWarehouseSelector, warehouse } = useWarehouse();
  const [fs, setFs] = useState(false);
  const [priorityTasks, setPriorityTasks] = useState<WarehousePriorityTask[]>([]);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [rejectDraft, setRejectDraft] = useState<{ task: WarehousePriorityTask; reason: string } | null>(null);

  const { visibleNavTabs } = useWmsPinnedModes(user?.id ?? null);

  const syncFs = useCallback(() => {
    setFs(Boolean(document.fullscreenElement));
  }, []);

  useEffect(() => {
    document.addEventListener("fullscreenchange", syncFs);
    return () => document.removeEventListener("fullscreenchange", syncFs);
  }, [syncFs]);

  const priorityInflightRef = useRef(false);
  const loadPriorityTasks = useCallback(async () => {
    if (!warehouse?.id || priorityInflightRef.current) return;
    priorityInflightRef.current = true;
    setPriorityLoading(true);
    try {
      const rows = await listWarehousePriorityTasks({ tenantId: 1, warehouseId: warehouse.id, scope: "assigned" });
      setPriorityTasks(rows.filter((task) => !["WYKONANE", "ODRZUCONE"].includes(task.status)).slice(0, 3));
    } catch {
      setPriorityTasks([]);
    } finally {
      priorityInflightRef.current = false;
      setPriorityLoading(false);
    }
  }, [warehouse?.id]);

  useVisibilityPolling(() => void loadPriorityTasks(), {
    enabled: warehouse?.id != null,
    intervalMs: PRIORITY_TASKS_POLL_MS,
    runImmediately: true,
  });

  useEffect(() => {
    if (!priorityTasks.some((task) => task.status === "NOWE" || task.status === "ESKALOWANE")) return;
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      window.setTimeout(() => {
        osc.stop();
        void ctx.close();
      }, 120);
    } catch {
      /* browser may block sound */
    }
  }, [priorityTasks]);

  const toggleFs = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  };

  const openDevScanner = () => {
    if (SHOW_WMS_DEV_SCANNER) {
      window.dispatchEvent(new Event("wms-dev-scanner-open"));
    }
  };

  const handleBack = () => navigate(-1);

  const statusLabel = (status: WarehousePriorityTask["status"]) =>
    ({
      NOWE: "Aktywne",
      PRZYJĘTE: "Przyjęte",
      W_TRAKCIE: "W realizacji",
      WYKONANE: "Zakończone",
      ODRZUCONE: "Odrzucone",
      ESKALOWANE: "Eskalowane",
    })[status] ?? status;

  const handlePriorityAction = async (task: WarehousePriorityTask, action: "accept" | "start" | "reject") => {
    if (action === "reject") {
      setRejectDraft({ task, reason: "" });
      return;
    }
    try {
      const updated = await updateWarehousePriorityTask({ tenantId: 1, taskId: task.id }, { action });
      saveActivePriorityTask(updated);
      if (task.target_path) {
        navigate(task.target_path, { state: { ...task.payload, activePriorityTaskId: task.id } });
      }
      void loadPriorityTasks();
    } catch {
      void loadPriorityTasks();
    }
  };

  const confirmReject = async () => {
    if (!rejectDraft) return;
    const reason = rejectDraft.reason.trim();
    if (!reason) return;
    try {
      await updateWarehousePriorityTask(
        { tenantId: 1, taskId: rejectDraft.task.id },
        { action: "reject", rejectionReason: reason },
      );
      clearActivePriorityTask(rejectDraft.task.id);
      setRejectDraft(null);
      void loadPriorityTasks();
    } catch {
      void loadPriorityTasks();
    }
  };

  return (
    // Zmieniony styl nagłówka: czyste tło i subtelny shadow-sm zamiast grubego border-a
    <header className="shrink-0 border-b border-slate-100 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6">
        
        <div className="flex h-full min-w-0 flex-1 items-center gap-2">
          {/* Przycisk wstecz */}
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            title="Wstecz"
            aria-label="Wstecz"
            onClick={handleBack}
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>

          {/* Separator wizualny */}
          <div className="mx-1 h-5 w-px bg-slate-200 shrink-0"></div>

          <NavLink
            to={WMS_ROUTES.menu}
            className={({ isActive }) =>
              [
                menuNavBtn,
                isActive ? "ring-2 ring-orange-500/50 ring-offset-1" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
            title="Menu WMS — ekran startowy"
            aria-label="Menu WMS — ekran startowy"
          >
            <Menu className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </NavLink>

          <NavLink
            to={WMS_ROUTES.productionCollecting()}
            className={({ isActive }) =>
              [
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors",
                isActive || pathname.startsWith("/wms/production")
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100",
              ].join(" ")
            }
            title="Produkcja — wykonanie (WMS)"
          >
            <Factory className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Prod. WMS</span>
          </NavLink>

          <div className="mx-1 h-5 w-px bg-slate-200 shrink-0 hidden sm:block"></div>

          {/* Czysty kontener dla nawigacji modułów na pełną wysokość paska */}
          <nav className="flex h-full items-center overflow-x-auto no-scrollbar flex-1">
            <WmsTopBarModuleNav tabs={visibleNavTabs} />
          </nav>
        </div>

        {/* Prawa strona: zwarte grupy ikon i menu użytkownika z border-l */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4 pl-4 border-l border-slate-200">
          {showWarehouseSelector ? (
            <div className="hidden sm:block w-[12rem]">
              <GlobalWarehouseSelect variant="topbar" className="w-full text-sm" />
            </div>
          ) : null}
          
          <div className="flex items-center bg-slate-50 rounded-xl p-0.5 border border-slate-100">
            {SHOW_WMS_DEV_SCANNER ? (
              <button
                type="button"
                className={iconBtn}
                title="Skaner (symulacja deweloperska)"
                aria-label="Skaner symulacja"
                onClick={openDevScanner}
              >
                <ScanLine className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : null}
            <button type="button" className={iconBtn} title="Pełny ekran" aria-label="Pełny ekran" onClick={() => void toggleFs()}>
              {fs ? <Minimize2 className="h-4 w-4" strokeWidth={2} /> : <Maximize2 className="h-4 w-4" strokeWidth={2} />}
            </button>
          </div>
          
          <UserAccountMenu compact />
        </div>
      </div>
      {priorityTasks.length ? (
        <div className="border-t border-orange-100 bg-orange-50/80 px-3 py-2 sm:px-6">
          <div className="flex gap-2 overflow-x-auto">
            {priorityTasks.map((task) => (
              <div key={task.id} className="flex min-w-[18rem] items-center gap-3 rounded-xl border border-orange-200 bg-white px-3 py-2 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black uppercase text-orange-700">
                      Priorytet kierownika
                    </span>
                    {task.sla_countdown_minutes != null ? (
                      <span className="text-[11px] font-bold text-slate-500">{formatOperationalDuration(task.sla_countdown_minutes)}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-black text-slate-900">{task.title}</div>
                  <div className="truncate text-xs text-slate-500">
                    {task.assigned_by_name || "Kierownik"} · {statusLabel(task.status)} · od {formatOperationalDurationSince(task.assigned_at)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {task.status === "NOWE" || task.status === "ESKALOWANE" ? (
                    <button type="button" onClick={() => void handlePriorityAction(task, "accept")} className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white">
                      Akceptuj
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void handlePriorityAction(task, "start")} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700">
                    Przejdź
                  </button>
                  <button type="button" onClick={() => void handlePriorityAction(task, "reject")} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500">
                    Odrzuć
                  </button>
                </div>
              </div>
            ))}
            {priorityLoading ? <span className="self-center text-xs font-semibold text-slate-500">Odświeżanie…</span> : null}
          </div>
        </div>
      ) : null}
      {rejectDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="text-sm font-black text-slate-900">Powód odrzucenia</div>
            <p className="mt-1 text-xs text-slate-500">{rejectDraft.task.title}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Brak czasu", "Awaria stanowiska", "Nieprawidłowe przypisanie", "Brak produktów", "Inne"].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setRejectDraft((prev) => (prev ? { ...prev, reason } : prev))}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              value={rejectDraft.reason}
              onChange={(event) => setRejectDraft({ ...rejectDraft, reason: event.target.value })}
              rows={4}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
              placeholder="Opisz powód odrzucenia zadania..."
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRejectDraft(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600">
                Anuluj
              </button>
              <button type="button" onClick={() => void confirmReject()} disabled={!rejectDraft.reason.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
                Potwierdź
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}