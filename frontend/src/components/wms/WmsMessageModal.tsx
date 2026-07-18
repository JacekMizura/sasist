import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { WmsUserMessage } from "../../types/wmsUserMessage";

type WmsMessageModalProps = {
  open: boolean;
  message: WmsUserMessage | null;
  onClose: () => void;
};

const severityUi: Record<
  WmsUserMessage["severity"],
  { icon: typeof XCircle; ring: string; iconClass: string; btn: string }
> = {
  ERROR: {
    icon: XCircle,
    ring: "ring-rose-200",
    iconClass: "text-rose-600",
    btn: "bg-rose-600 hover:bg-rose-700",
  },
  WARNING: {
    icon: AlertTriangle,
    ring: "ring-amber-200",
    iconClass: "text-amber-600",
    btn: "bg-amber-600 hover:bg-amber-700",
  },
  SUCCESS: {
    icon: CheckCircle2,
    ring: "ring-emerald-200",
    iconClass: "text-emerald-600",
    btn: "bg-emerald-600 hover:bg-emerald-700",
  },
};

/** Wspólny popup komunikatów WMS — wyświetla gotowy payload z backendu. */
export default function WmsMessageModal({ open, message, onClose }: WmsMessageModalProps) {
  if (!open || !message) return null;

  const ui = severityUi[message.severity] ?? severityUi.ERROR;
  const Icon = ui.icon;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wms-msg-title"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ${ui.ring}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Icon className={`mt-0.5 h-7 w-7 shrink-0 ${ui.iconClass}`} aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 id="wms-msg-title" className="text-lg font-bold text-slate-900">
              {message.title}
            </h2>
            <p className="text-sm font-medium text-slate-800 whitespace-pre-line">{message.message}</p>
            {message.details ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 whitespace-pre-line">
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Szczegóły
                </div>
                {message.details}
              </div>
            ) : null}
            {message.suggested_action ? (
              <div className="text-sm text-slate-700 whitespace-pre-line">
                <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Co możesz zrobić
                </div>
                {message.suggested_action}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${ui.btn}`}
            onClick={onClose}
          >
            Rozumiem
          </button>
        </div>
      </div>
    </div>
  );
}
