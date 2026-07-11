import { createPortal } from "react-dom";
import type { ReactNode } from "react";

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
 */
export function WarehouseDocumentOverlayPortal({
  children,
  zIndex = Z_WAREHOUSE_DOC_OVERLAY,
  className = "fixed inset-0 flex bg-black/30",
  role = "presentation",
  onBackdropClick,
}: Props) {
  return createPortal(
    <div
      className={className}
      style={{ zIndex }}
      role={role}
      data-wh-doc-nested-overlay="true"
      onClick={onBackdropClick}
    >
      {children}
    </div>,
    document.body,
  );
}
