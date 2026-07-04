import { type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

import { WmsProductCard, wmsProductCardMetaMuted } from "./WmsProductCard";

export type WmsProductTaskCardProps = {
  index: number;
  imageUrl: string | null | undefined;
  title: string;
  /** Collapsed summary (qty, location) shown when card is folded. */
  summary?: ReactNode;
  /** Primary meta block inside expanded card body (SKU, EAN, …). */
  body: ReactNode;
  /** Location picker, confirm CTA — only when expanded and active. */
  footer?: ReactNode;
  expanded: boolean;
  done: boolean;
  busy?: boolean;
  /** Amber = active collecting; emerald = completed row. */
  accent?: "amber" | "emerald";
  onToggle?: () => void;
};

/**
 * Operational task row built on {@link WmsProductCard} — used by Produkcja / Zbieranie
 * and intended for Kompletacja migration. Przyjęcie and Rozlokowanie use WmsProductCard directly.
 */
export function WmsProductTaskCard({
  index,
  imageUrl,
  title,
  summary,
  body,
  footer,
  expanded,
  done,
  busy = false,
  accent = "amber",
  onToggle,
}: WmsProductTaskCardProps) {
  if (!expanded) {
    return (
      <button
        type="button"
        disabled={busy || done}
        onClick={() => {
          if (!done) onToggle?.();
        }}
        className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition ${
          done
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-slate-200 hover:border-amber-300 hover:shadow-md"
        } ${busy ? "opacity-60" : ""}`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold tabular-nums text-slate-700 ring-1 ring-slate-200/80">
          {done ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : index}
        </span>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] font-medium text-slate-400">Brak</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{title}</p>
          {summary ? <div className={wmsProductCardMetaMuted}>{summary}</div> : null}
        </div>
        {!done ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <span className="shrink-0 text-xs font-bold uppercase text-emerald-700">Gotowe</span>
        )}
      </button>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border shadow-sm ${
        done ? "border-emerald-200" : accent === "amber" ? "border-amber-200 ring-2 ring-amber-100" : "border-slate-200"
      }`}
    >
      <div
        className={`absolute bottom-0 left-0 top-0 w-1 ${done ? "bg-emerald-400" : accent === "amber" ? "bg-amber-400" : "bg-blue-400"}`}
        aria-hidden
      />
      <div className="p-3 pl-4">
        <WmsProductCard
          index={index}
          imageUrl={imageUrl}
          interactive={false}
          busy={busy}
          subdued={done}
          body={
            <>
              <p className="text-lg font-bold leading-snug text-slate-900">{title}</p>
              {body}
            </>
          }
          footer={footer ?? null}
        />
      </div>
    </div>
  );
}
