import type { RuntimeHealth } from "../../hooks/runtime/useOperationalRuntime";
import { connectionStatusLabel } from "../../services/operations/operationsTerminology";

type Props = {
  health: RuntimeHealth;
  connected: boolean;
  eventLagMs: number | null;
  runtimeAvailable: boolean;
};

export function RuntimeStatusBar({ health, connected, eventLagMs, runtimeAvailable }: Props) {
  const dot =
    health === "live"
      ? "bg-emerald-500"
      : health === "polling"
        ? "bg-amber-400"
        : health === "disabled"
          ? "bg-slate-300"
          : "bg-red-400";

  const lagSec = eventLagMs != null ? Math.round(eventLagMs / 1000) : null;

  return (
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span>{connectionStatusLabel(health, connected)}</span>
        {!runtimeAvailable ? (
          <span className="text-slate-400">· tryb podglądu</span>
        ) : null}
      </div>
      <div className="tabular-nums text-slate-500">
        {lagSec != null ? `Ostatnia aktualizacja: ${lagSec}s temu` : null}
      </div>
    </footer>
  );
}
