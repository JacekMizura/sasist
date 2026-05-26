import type { ReactNode } from "react";

type TabsContainerProps = {
  children: ReactNode;
  /** Extra classes on the outer wrapper (e.g. overflow). */
  className?: string;
};

/**
 * White card shell for horizontal tabs — compact padding; use with {@link TopTabsNavigation}.
 */
export function TabsContainer({ children, className = "" }: TabsContainerProps) {
  return (
    <div className={`mb-2 rounded-xl border border-slate-200 bg-white px-4 pb-2 pt-2.5${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
