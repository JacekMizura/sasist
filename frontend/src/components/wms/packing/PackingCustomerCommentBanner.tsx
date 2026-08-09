const ALERT_BG = "#ffebee";
const ALERT_BORDER = "#ffcdd2";
const ALERT_TEXT = "#c62828";

function IconComment() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

type Props = {
  comment: string;
};

/** Czerwony panel „UWAGI KLIENTA” nad produktami (komentarz wyróżniony). */
export function PackingCustomerCommentBanner({ comment }: Props) {
  const text = comment.trim();
  if (!text) return null;
  return (
    <div
      className="mx-3 mb-2 flex items-start gap-3 rounded-lg border px-4 py-3 sm:mx-4"
      style={{ background: ALERT_BG, borderColor: ALERT_BORDER }}
      role="status"
    >
      <span className="mt-0.5 shrink-0" style={{ color: ALERT_TEXT }} aria-hidden>
        <IconComment />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold uppercase tracking-wide" style={{ color: ALERT_TEXT }}>
          Uwagi klienta
        </p>
        <p className="mt-1 text-sm font-semibold leading-snug text-red-900">{text}</p>
      </div>
    </div>
  );
}
