import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";
import { useWarehouseExecution } from "../../../context/WarehouseExecutionContext";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import { useOfflineActionQueue } from "./useOfflineActionQueue";
import { WMS_OPERATIONAL_CONTAINER } from "./wmsLayoutTokens";

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
 * Unified scanner execution layout — normal document flow, no nested sticky headers.
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
    <div className={`flex min-h-full w-full flex-col bg-slate-100 ${className}`}>
      <header className="shrink-0 border-b border-slate-200 bg-white text-slate-900">
        <div className={`${WMS_OPERATIONAL_CONTAINER} flex min-h-[52px] items-center gap-2 py-2`}>
          <Link
            to={backTo}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 px-2 text-slate-700 hover:bg-slate-50"
            aria-label={backLabel}
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-black">{title}</h1>
          {headerRight}
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
            title={warehouseMode ? "Wyłącz tryb terminala" : "Tryb terminala magazynu"}
            onClick={toggleWarehouseMode}
          >
            {warehouseMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
        {(scannerError || scannerToast || pending > 0) && (
          <div
            className={`px-4 py-2 text-center text-xs font-bold sm:px-6 ${
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

      <div className={`${WMS_OPERATIONAL_CONTAINER} flex-1 py-4 md:py-5`}>{children}</div>

      {bottom ? <footer className="shrink-0 border-t border-slate-200 bg-white">{bottom}</footer> : null}
    </div>
  );
}
