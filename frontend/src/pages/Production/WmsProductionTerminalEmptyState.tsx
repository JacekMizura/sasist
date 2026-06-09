import type { ReactNode } from "react";

import { WmsTerminalEmptyState } from "@/components/wms/execution/WmsTerminalEmptyState";

type Props = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onRefresh?: () => void;
  refreshLabel?: string;
};

/** @deprecated Use WmsTerminalEmptyState — kept for production pages import path. */
export function WmsProductionTerminalEmptyState(props: Props) {
  return <WmsTerminalEmptyState {...props} />;
}
