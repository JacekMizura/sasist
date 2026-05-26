import type { ReactNode } from "react";

/** Matches Order detail page outer shell (`OrderDetailPage`). */
export const panelDetailPageOuterClass =
  "min-h-0 w-full bg-slate-100 pb-8 pt-2 font-sans text-base antialiased";

/** Vertical offset below breadcrumbs / top — aligned with Orders list → detail rhythm. */
export const panelDetailPageSectionSpacingClass = "mt-4 sm:mt-6";

/**
 * Primary white panel — same chrome as Order detail card (`rounded-xl` + border + soft shadow + padding).
 */
export function PanelDetailContentCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_28px_rgba(15,23,42,0.07)] sm:p-5 lg:p-6 ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}

/** Standard 8 / 4 split — Order-adjacent modules (RMZ / complaints). */
export const panelDetailMainGridClass = "grid grid-cols-12 gap-4";
export const panelDetailMainColClass = "col-span-12 lg:col-span-8";
export const panelDetailAsideColClass = "col-span-12 lg:col-span-4";
