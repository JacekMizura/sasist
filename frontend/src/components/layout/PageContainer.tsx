import type { ReactNode } from "react";

export type PageContainerProps = {
  children: ReactNode;
  className?: string;
  /** Inner white panel classes (ignored when `omitCard`). */
  cardClassName?: string;
  /** Legacy flag — outer shell is always full width of the main column (same as Orders). */
  fullBleed?: boolean;
  /** Flex chain for full-viewport tools (designer, etc.). */
  fillHeight?: boolean;
  /** Only outer padding / max-width — no white card (legacy full-page editors). */
  omitCard?: boolean;
};

function outerShellClasses(fullBleed: boolean, fillHeight: boolean, className?: string): string {
  void fullBleed;
  return [
    "w-full min-w-0 p-4 md:p-6",
    fillHeight ? "flex h-full max-h-full min-h-0 flex-1 flex-col overflow-hidden" : "",
    className ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Unified page shell: outer spacing + **one** white panel (same rhythm as Orders list).
 * Use {@link PageGutter} when the route renders its own surfaces and must not nest a card.
 */
export function PageContainer({
  children,
  className,
  cardClassName,
  fullBleed = false,
  fillHeight = false,
  omitCard = false,
}: PageContainerProps) {
  const outer = outerShellClasses(fullBleed, fillHeight, className);

  if (omitCard) {
    return <div className={outer}>{children}</div>;
  }

  const inner = [
    "rounded-xl border border-slate-200 bg-white p-5 space-y-4",
    fillHeight ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "overflow-visible",
    cardClassName ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <div className={outer}>
      <div className={inner}>{children}</div>
    </div>
  );
}

export type PageGutterGutter = "page" | "inset";

/** Same horizontal rhythm as unified shell — for sticky bars / align-only rows. */
export const pageContainerWidthAlignClass = "w-full px-4 md:px-6";

/**
 * Horizontal gutter only (`py-3`) — use when the page supplies its own card(s), e.g. detail forms.
 */
export function PageGutter({
  children,
  className,
  gutter = "page",
}: {
  children: ReactNode;
  className?: string;
  gutter?: PageGutterGutter;
}) {
  const widthCls = gutter === "inset" ? "w-full" : pageContainerWidthAlignClass;
  return (
    <div className={`${widthCls} py-3${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
