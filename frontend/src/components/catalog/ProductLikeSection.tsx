import type { ReactNode } from "react";

type ProductLikeSectionProps = {
  title: string;
  children: ReactNode;
  className?: string;
  /** Optional control in the section header (e.g. unit toggle). */
  headerExtra?: ReactNode;
  /** Optional description under the title. */
  description?: string;
  /** Left accent bar (e.g. packaging card). */
  accent?: "blue" | "none";
  /** Denser padding for right-column helper modules. */
  compact?: boolean;
};

/**
 * Form section card — matches product-edit HTML UX using SASIST surfaces
 * (white card, header rule, body padding). Same pattern as WmFormSectionCard.
 */
export function ProductLikeSection({
  title,
  children,
  className = "",
  headerExtra,
  description,
  accent = "none",
  compact = false,
}: ProductLikeSectionProps) {
  const accentClass = accent === "blue" ? "border-l-4 border-l-blue-500" : "";
  const headPad = compact ? "px-5 py-4" : "px-6 py-4";
  const bodyPad = compact ? "p-5" : "p-6";

  return (
    <section
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${accentClass} ${className}`.trim()}
    >
      <div className={`flex items-center justify-between gap-3 border-b border-slate-200 ${headPad}`}>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-[13px] leading-snug text-slate-500">{description}</p> : null}
        </div>
        {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
      </div>
      <div className={bodyPad}>{children}</div>
    </section>
  );
}
