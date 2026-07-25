import type { ReactNode } from "react";

import { AppOverlayPortal, APP_OVERLAY_Z } from "../../components/overlay/AppOverlayPortal";
import { Z_WAREHOUSE_DOC_OVERLAY } from "./warehouseDocumentOverlayLayers";

type Props = {
  children: ReactNode;
  zIndex?: number;
  className?: string;
  role?: string;
  onBackdropClick?: () => void;
};

/**
 * Full-viewport overlay on document.body — escapes DocumentsLayout stacking context.
 * Thin alias over {@link AppOverlayPortal} (shared AppShell overlay layer).
 */
export function WarehouseDocumentOverlayPortal({
  children,
  zIndex = Z_WAREHOUSE_DOC_OVERLAY,
  className = "fixed inset-0 flex bg-black/30",
  role = "presentation",
  onBackdropClick,
}: Props) {
  return (
    <AppOverlayPortal
      zIndex={zIndex ?? APP_OVERLAY_Z.sheet}
      className={className}
      role={role}
      onBackdropClick={onBackdropClick}
    >
      {children}
    </AppOverlayPortal>
  );
}
