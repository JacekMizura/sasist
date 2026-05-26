import type { ReactNode } from "react";
import { PageGutter } from "./PageContainer";
import PageCard from "../ui/PageCard";

/** Canvas behind primary content — aligned with Products list (`ProductList`). */
export const PAGE_CANVAS_CLASS = "min-h-0 w-full bg-slate-100 pb-8 pt-2";

type PageCardLayoutProps = {
  children: ReactNode;
  className?: string;
};

/** @deprecated Prefer {@link ../ui/PageCard} — wrapper adds default vertical rhythm. */
export function PageCardLayout({ children, className }: PageCardLayoutProps) {
  return <PageCard className={`space-y-4${className ? ` ${className}` : ""}`}>{children}</PageCard>;
}

/** Standard outer stack: slate canvas + horizontal gutter (`px-4 md:px-6`, `py-3`). */
export function PageCanvasBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={PAGE_CANVAS_CLASS}>
      <PageGutter className={className}>{children}</PageGutter>
    </div>
  );
}
