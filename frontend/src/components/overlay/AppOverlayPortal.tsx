import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Global overlay z-index bands (ErpShell: sidebar z-30, content z-0, NavFlyout z-200).
 * Drawers/sheets must portal to document.body — z-index alone cannot escape content stacking context.
 */
export const APP_OVERLAY_Z = {
  /** Drawers / SlideOver / full-screen sheets — above NavFlyout (200). */
  drawer: 250,
  /** Centered modal sheets / panels. */
  sheet: 280,
  /** Blocking dialogs (ConfirmModal band). */
  dialog: 500,
} as const;

export type AppOverlayPortalProps = {
  children: ReactNode;
  /** When false, renders nothing (still allows hooks in parents). Default true. */
  open?: boolean;
  /**
   * If set, wraps children in a full-viewport layer with this z-index.
   * If omitted, children are portaled as-is (they should include their own `fixed` + z-index ≥ drawer).
   */
  zIndex?: number;
  /** Wrapper class when `zIndex` is set. Default: fixed inset-0 flex. */
  className?: string;
  role?: string;
  onBackdropClick?: () => void;
  /** Lock document.body scroll while mounted. */
  lockBodyScroll?: boolean;
};

/**
 * Shared AppShell overlay escape hatch — always mounts on `document.body`.
 * Use for Drawer / SlideOver / Sheet / full-screen panel so they paint above ErpSidebar.
 */
export function AppOverlayPortal({
  children,
  open = true,
  zIndex,
  className = "fixed inset-0 flex",
  role = "presentation",
  onBackdropClick,
  lockBodyScroll = false,
}: AppOverlayPortalProps) {
  useEffect(() => {
    if (!open || !lockBodyScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, lockBodyScroll]);

  if (!open || typeof document === "undefined") return null;

  const node =
    zIndex != null ? (
      <div
        className={className}
        style={{ zIndex }}
        role={role}
        data-app-overlay=""
        onClick={onBackdropClick}
      >
        {children}
      </div>
    ) : (
      children
    );

  return createPortal(node, document.body);
}
