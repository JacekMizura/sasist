import type { ReactNode } from "react";

import { pageShellDividerClass } from "../../design-system/pageLayout";

type TabsContainerProps = {
  children: ReactNode;
  /** Extra classes on the outer wrapper (e.g. overflow). */
  className?: string;
};

/**
 * Layout System 2.0: tabs are part of the page shell — no nested white card.
 * Renders as a bottom divider only so legacy call sites stop stacking cards.
 */
export function TabsContainer({ children, className = "" }: TabsContainerProps) {
  return (
    <div className={`${pageShellDividerClass} pb-0${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
