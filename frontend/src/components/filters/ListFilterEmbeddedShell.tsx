import type { ReactNode } from "react";

import { FilterPanel } from "./FilterPanel";
import { filterEmbeddedPanelClass } from "./filterUiTokens";

type ListFilterEmbeddedShellProps = {
  expanded: boolean;
  children: ReactNode;
};

/** Collapsible filter panel chrome for Sellasist-style embedded list layouts. */
export function ListFilterEmbeddedShell({ expanded, children }: ListFilterEmbeddedShellProps) {
  if (!expanded) return null;
  return (
    <FilterPanel tone="white" className={`${filterEmbeddedPanelClass} border-slate-200/70 shadow-none`}>
      {children}
    </FilterPanel>
  );
}
