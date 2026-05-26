import type { ReactNode } from "react";
import { PageCardLayout } from "./PageCardLayout";

type ChromeProps = {
  children: ReactNode;
  className?: string;
};

/** @deprecated Prefer {@link PageCardLayout} — alias for backwards compatibility. */
export function PageCard({ children, className }: ChromeProps) {
  return <PageCardLayout className={className}>{children}</PageCardLayout>;
}

/** Legacy wrapper — prefer a single {@link PageCardLayout} without nesting. */
export function PageContent({ children, className }: ChromeProps) {
  return <div className={className}>{children}</div>;
}
