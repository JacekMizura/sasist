import type { RuntimeHealth } from "../../hooks/runtime/useOperationalRuntime";

type Props = {
  health: RuntimeHealth;
  connected: boolean;
  eventLagMs: number | null;
  lastEventId: number;
  runtimeAvailable: boolean;
};

const HEALTH_LABEL: Record<RuntimeHealth, string> = {
  live: "SSE live",
  polling: "Polling",
  offline: "Offline",
  disabled: "Runtime wyłączony",
};

export function RuntimeStatusBar({
  health,
  connected,
  eventLagMs,
  lastEventId,
  runtimeAvailable,
}: Props) {
  const dot =
    health === "live"
      ? "bg-emerald-500"
      : health === "polling"
        ? "bg-amber-400"
        : health === "disabled"
          ? "bg-slate-300"
          : "bg-red-400";

  return (
    <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span>{HEALTH_LABEL[health]}</span>
        {!runtimeAvailable ? (
          <span className="text-slate-400">— klasyczny WMS bez zmian</span>
        ) : null}
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        <span>Lag: {eventLagMs != null ? `${Math.round(eventLagMs / 1000)}s` : "—"}</span>
        <span>Ev: #{lastEventId}</span>
        <span>{connected ? "połączono" : "rozłączono"}</span>
      </div>
    </footer>
  );
}
