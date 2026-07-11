import { useLayoutEffect, type ReactNode, type RefObject } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";

import { Z_WAREHOUSE_DOC_OVERLAY } from "./warehouseDocumentOverlayLayers";

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  placement?: "bottom-end" | "top-end";
  className?: string;
  children: ReactNode;
};

/** Anchored dropdown menu portaled to body (modal-safe). */
export function WarehouseDocumentFloatingMenu({
  open,
  anchorRef,
  onClose,
  placement = "bottom-end",
  className = "min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5",
  children,
}: Props) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (v) => {
      if (!v) onClose();
    },
    placement,
    strategy: "fixed",
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(anchorRef.current);
  }, [anchorRef, refs, open]);

  const dismiss = useDismiss(context, { ancestorScroll: true, outsidePress: true, escapeKey: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, zIndex: Z_WAREHOUSE_DOC_OVERLAY }}
        className={className}
        data-wh-doc-nested-overlay="true"
        {...getFloatingProps()}
      >
        {children}
      </div>
    </FloatingPortal>
  );
}
