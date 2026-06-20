import { memo, type ReactNode } from "react";

type Tone = "blue" | "amber" | "slate";

const TONE_CLASS: Record<Tone, string> = {
  blue: "border-sky-200 bg-sky-50 text-sky-950",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  slate: "border-slate-200 bg-slate-50 text-slate-800",
};

type Props = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
};

/** Kompaktowy komunikat informacyjny — pod KPI, nie zamiast KPI. */
function PurchasingInfoNoticeInner({ children, tone = "blue", className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-[13px] leading-snug ${TONE_CLASS[tone]} ${className}`.trim()}
      role="status"
    >
      {children}
    </div>
  );
}

export const PurchasingInfoNotice = memo(PurchasingInfoNoticeInner);
