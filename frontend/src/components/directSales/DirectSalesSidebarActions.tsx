import { PauseCircle, PlayCircle } from "lucide-react";

type Props = {
  busy: boolean;
  hasSession: boolean;
  onSuspend: () => void;
  onNewSession: () => void;
};

export function DirectSalesSidebarActions({ busy, hasSession, onSuspend, onNewSession }: Props) {
  return (
    <div className="shrink-0 border-t border-blue-50 bg-white px-4 pb-4 pt-3 lg:px-6 lg:pb-6">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy || !hasSession}
          onClick={onSuspend}
          className="flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-2 py-3 text-sm font-bold text-blue-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-white"
        >
          <PauseCircle size={18} /> Zawieś
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onNewSession}
          className="flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-2 py-3 text-sm font-bold text-blue-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-white"
        >
          <PlayCircle size={18} /> Nowa sesja
        </button>
      </div>
    </div>
  );
}
