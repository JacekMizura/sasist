import type { RuntimeHealth } from "../../../../hooks/runtime/useOperationalRuntime";

type Props = {
  health: RuntimeHealth;
  connected: boolean;
  scannerReady?: boolean;
};

export function DirectSalesRuntimeFooter({ health, connected, scannerReady = true }: Props) {
  return (
    <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-600">
      <span>Skaner: {scannerReady ? "gotowy" : "zajęty"}</span>
      <span>
        Live: {health} {connected ? "· połączono" : "· polling"}
      </span>
    </footer>
  );
}
