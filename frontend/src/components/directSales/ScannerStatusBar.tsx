import type { RuntimeHealth } from "../../hooks/runtime/useOperationalRuntime";

type Props = {
  health: RuntimeHealth;
  connected: boolean;
  scannerReady?: boolean;
  warehouseName?: string | null;
};

function healthPl(health: RuntimeHealth): string {
  switch (health) {
    case "live":
      return "Połączono";
    case "polling":
      return "Tryb zapasowy";
    case "offline":
      return "Offline";
    case "disabled":
      return "Wyłączony";
    default:
      return health;
  }
}

export function ScannerStatusBar({ health, connected, scannerReady = true, warehouseName }: Props) {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Skaner: <strong className="text-white">{scannerReady ? "Gotowy" : "Zajęty"}</strong>
        </span>
        <span className="hidden sm:inline text-slate-400">|</span>
        <span className="hidden sm:inline">
          ↑↓ wyniki · Enter dodaj · Esc zamknij · F1/F2/F3 płatność
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {warehouseName ? <span>Magazyn: {warehouseName}</span> : null}
        <span>
          Połączenie: <strong className="text-white">{healthPl(health)}</strong>
          {connected ? "" : " · odświeżanie"}
        </span>
      </div>
    </footer>
  );
}
