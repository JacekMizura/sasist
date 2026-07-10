import type { ReactNode } from "react";

import { appLayoutClasses } from "../../../layout/appLayoutTokens";

export type AppContentLayoutProps = {
  children: ReactNode;
  className?: string;
  /** Skip horizontal page padding (rare full-bleed tools). */
  noPadding?: boolean;
};

/** Standard page gutter (24px) on unified app background. */
export function AppContentLayout({ children, className, noPadding = false }: AppContentLayoutProps) {
  return (
    <div
      className={[
        noPadding ? "flex min-h-0 min-w-0 flex-1 flex-col" : appLayoutClasses.pagePadding,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
