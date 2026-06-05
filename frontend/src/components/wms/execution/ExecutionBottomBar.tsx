import type { ReactNode } from "react";
import { WMS_OPERATIONAL_CONTAINER } from "./wmsLayoutTokens";

type Props = {
  children: ReactNode;
};

/** Bottom action area in normal document flow (inside ScanExecutionShell footer). */
export function ExecutionBottomBar({ children }: Props) {
  return (
    <div className={`${WMS_OPERATIONAL_CONTAINER} flex flex-col gap-2 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]`}>
      {children}
    </div>
  );
}

/** @deprecated Reserve handled by flex footer — kept for API compatibility. */
export const EXECUTION_BOTTOM_RESERVE = "";
