import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import { ExecutionGlobalContextBar } from "./ExecutionGlobalContextBar";
import { EXECUTION_BOTTOM_RESERVE } from "./ExecutionBottomBar";
import { useOfflineActionQueue } from "./useOfflineActionQueue";

type Props = {
  title: string;
  backTo: string;
  backLabel?: string;
  children: ReactNode;
  bottom?: ReactNode;
  headerRight?: ReactNode;
  className?: string;
};

/**
 * Unified mobile/scanner execution layout: minimal chrome, sticky context, scan feedback.
 */
export function ScanExecutionShell({
  title,
  backTo,
  backLabel = "Wstecz",
  children,
  bottom,
  headerRight,
  className = "",
}: Props) {
  const { warehouseMode, toggleWarehouseMode, isExecutionRoute } = useWarehouseExecution();
  const { scannerError, scannerToast } = useWmsScanner();
  const { pendingCount: offlineCount } = useOfflineActionQueue();

  useEffect(() => {
    if (isExecutionRoute && warehouseMode) {
      document.documentElement.classList.add("wms-execution-mode");
      return () => document.documentElement.classList.remove("wms-execution-mode");
    }
    return undefined;
  }, [isExecutionRoute, warehouseMode]);

  const pending = offlineCount;

  return (
    <div
      className={`flex min-h-full flex-col bg-[#E8EDF4] ${bottom ? EXECUTION_BOTTOM_RESERVE : "pb-8"} ${className}`}
    >
      <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-slate-900 text-white">
        <div className="flex min-h-[52px] items-center gap-2 px-3">
          <Link
            to={backTo}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10 px-2"
            aria-label={backLabel}
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-black">{title}</h1>
          {headerRight}
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/10"
            title={warehouseMode ? "Wyłącz tryb terminala" : "Tryb terminala magazynu"}
            onClick={toggleWarehouseMode}
          >
            {warehouseMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
        {(scannerError || scannerToast || pending > 0) && (
          <div
            className={`px-3 py-2 text-center text-xs font-bold ${
              scannerError
                ? "bg-red-600 text-white"
                : pending > 0
                  ? "bg-amber-600 text-white"
                  : "bg-emerald-700 text-white"
            }`}
          >
            {scannerError ??
              scannerToast ??
              (pending > 0 ? `${pending} akcji czeka na synchronizację` : null)}
          </div>
        )}
      </header>

      <ExecutionGlobalContextBar />

      <div className="mx-auto w-full max-w-3xl flex-1 px-3 py-3 sm:px-4">{children}</div>

      {bottom}
    </div>
  );
}
