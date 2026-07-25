import type { ReactNode } from "react";

import {
  pageShellGutterClass,
  pageShellPaddingClass,
  pageShellSurfaceClass,
} from "../../design-system/pageLayout";

export type PageContainerProps = {
  children: ReactNode;
  className?: string;
  /** Inner white panel classes (ignored when `omitCard` / `flush`). */
  cardClassName?: string;
  /** Legacy flag — outer shell is always full width of the main column. */
  fullBleed?: boolean;
  /** Flex chain for full-viewport tools (designer, etc.). */
  fillHeight?: boolean;
  /**
   * Only outer gutter — no white card (legacy full-page editors / exceptions).
   * Alias of {@link flush}.
   */
  omitCard?: boolean;
  /** Layout 2.0 name for {@link omitCard}. */
  flush?: boolean;
  /** Keep surface border but drop inner padding (edge-to-edge tables). */
  noPadding?: boolean;
};

function outerShellClasses(fullBleed: boolean, fillHeight: boolean, className?: string): string {
  void fullBleed;
  return [
    pageShellGutterClass,
    fillHeight ? "flex h-full max-h-full min-h-0 flex-1 flex-col overflow-hidden" : "",
    className ?? "",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Layout System 2.0 SSOT: outer spacing + **one** white panel.
 * Header, tabs, toolbar, and content live inside this container — not in nested cards.
 * Use {@link PageGutter} / `flush` when the route owns its own fullscreen surface.
 */
export function PageContainer({
  children,
  className,
  cardClassName,
  fullBleed = false,
  fillHeight = false,
  omitCard = false,
  flush = false,
  noPadding = false,
}: PageContainerProps) {
  const outer = outerShellClasses(fullBleed, fillHeight, className);
  const noCard = omitCard || flush;

  if (noCard) {
    return <div className={outer}>{children}</div>;
  }

  const inner = [
    pageShellSurfaceClass,
    noPadding ? "p-0" : pageShellPaddingClass,
    "space-y-4",
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
