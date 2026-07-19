import type { WmsScanFeedback, WmsScanFeedbackSeverity } from "./wmsScanErrorCatalog";

const SEVERITY_STYLE: Record<
  WmsScanFeedbackSeverity,
  { border: string; bg: string; title: string; body: string; badge: string }
> = {
  error: {
    border: "border-red-500",
    bg: "bg-red-50",
    title: "text-red-950",
    body: "text-red-900",
    badge: "❌",
  },
  warning: {
    border: "border-amber-500",
    bg: "bg-amber-50",
    title: "text-amber-950",
    body: "text-amber-900",
    badge: "⚠",
  },
  info: {
    border: "border-sky-500",
    bg: "bg-sky-50",
    title: "text-sky-950",
    body: "text-sky-900",
    badge: "ℹ",
  },
  success: {
    border: "border-emerald-500",
    bg: "bg-emerald-50",
    title: "text-emerald-950",
    body: "text-emerald-900",
    badge: "✓",
  },
};

/** Full-viewport-visible operator feedback — not tied to Scanner Helper drawer. */
export function WmsScanFeedbackOverlay({
  feedback,
  onDismiss,
}: {
  feedback: WmsScanFeedback | null;
  onDismiss?: () => void;
}) {
  if (!feedback) return null;
  const st = SEVERITY_STYLE[feedback.severity];
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[12000] flex justify-center px-3"
      role={feedback.severity === "error" || feedback.severity === "warning" ? "alert" : "status"}
    >
      <button
        type="button"
        className={`pointer-events-auto w-full max-w-lg rounded-2xl border-4 ${st.border} ${st.bg} px-5 py-4 text-left shadow-2xl ring-4 ring-black/5`}
        onClick={onDismiss}
      >
        <p className={`text-xs font-black uppercase tracking-[0.2em] ${st.title}`}>
          {st.badge} {feedback.title}
        </p>
        <p className={`mt-2 whitespace-pre-line text-base font-bold leading-snug ${st.body}`}>
          {feedback.message}
        </p>
      </button>
    </div>
  );
}
