import type { RuntimeHealth } from "../../../hooks/runtime/useOperationalRuntime";
import { sessionStatusPl } from "../directSalesTerminology";

type Props = {
  health: RuntimeHealth;
  connected: boolean;
  scannerReady?: boolean;
  warehouseName?: string | null;
  sessionStatus?: string | null;
  operatorLabel?: string | null;
};

function healthPl(health: RuntimeHealth): string {
  switch (health) {
    case "live":
      return "Na żywo";
    case "polling":
      return "Zapasowy";
    case "offline":
      return "Offline";
    case "disabled":
      return "Wyłączony";
    default:
      return health;
  }
}

export function TerminalStatusBar({
  health,
  connected,
  scannerReady = true,
  warehouseName,
  sessionStatus,
  operatorLabel,
}: Props) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-300">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Skaner:{" "}
          <strong className={scannerReady ? "text-emerald-400" : "text-amber-300"}>
            {scannerReady ? "Gotowy" : "Zajęty"}
          </strong>
        </span>
        <span className="hidden text-slate-600 md:inline">|</span>
        <span className="hidden md:inline">F1 gotówka · F2 karta · F3 BLIK · Enter zakończ</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {warehouseName ? <span>Magazyn: <strong className="text-white">{warehouseName}</strong></span> : null}
        {operatorLabel ? <span>Operator: {operatorLabel}</span> : null}
        {sessionStatus ? <span>Sesja: {sessionStatusPl(sessionStatus)}</span> : null}
        <span>
          SSE: <strong className="text-white">{healthPl(health)}</strong>
          {!connected ? " · odświeżanie" : ""}
        </span>
      </div>
    </footer>
  );
}
