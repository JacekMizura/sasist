import type { ReactNode } from "react";

import { appLayoutClasses } from "../../../layout/appLayoutTokens";

export type AppPageLayoutProps = {
  children: ReactNode;
  className?: string;
  /** Flex chain for full-height tools (designer, editors). */
  fillHeight?: boolean;
};

/**
 * Page shell inside ERP/WMS main column — unified app background, no nested white card.
 */
export function AppPageLayout({ children, className, fillHeight = false }: AppPageLayoutProps) {
  return (
    <div
      className={[
        appLayoutClasses.page,
        fillHeight ? "h-full max-h-full overflow-hidden" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
