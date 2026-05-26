import { AlertTriangle } from "lucide-react";

type Props = {
  /** Mniejsza typografia i ikona (wiersz listy). */
  compact?: boolean;
};

/** Reklamacja uznana z mocy prawa po 14 dniach (auto_accepted / accepted_by_law). */
export default function ComplaintAutoAcceptBadge({ compact = false }: Props) {
  const base = compact
    ? "inline-flex max-w-full items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
    : "inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-950";
  return (
    <span className={base} title="Brak odpowiedzi w terminie 14 dni — ustawa">
      <AlertTriangle className={compact ? "h-3 w-3 shrink-0 text-amber-700" : "h-3.5 w-3.5 shrink-0 text-amber-700"} aria-hidden />
      Uznana automatycznie
    </span>
  );
}
