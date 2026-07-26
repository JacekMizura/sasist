import type { ReactNode } from "react";

import { FilterPanel } from "./FilterPanel";

type ListFilterEmbeddedShellProps = {
  expanded: boolean;
  children: ReactNode;
};

/** Collapsible filter panel chrome for Sellasist-style embedded list layouts. */
export function ListFilterEmbeddedShell({ expanded, children }: ListFilterEmbeddedShellProps) {
  if (!expanded) return null;
  return (
    <FilterPanel tone="white" elevation="none">
      {children}
    </FilterPanel>
  );
}
