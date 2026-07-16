import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  useHover,
  useInteractions,
  safePolygon,
} from "@floating-ui/react";
import { useState, type CSSProperties, type ReactNode } from "react";

type Props = {
  lines: string[];
  children: ReactNode;
  /** Accessible name for the trigger (no native title tooltip). */
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  isActive?: boolean;
};

/**
 * Slot hover popup for location preview — single white card via Floating UI
 * (flip/shift so it stays on screen). No native ``title`` tooltip.
 */
export function LocationSlotHoverCard({
  lines,
  children,
  ariaLabel,
  className = "",
  style,
  isActive,
}: Props) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "top",
    strategy: "fixed",
    middleware: [offset(8), flip({ padding: 12, fallbackPlacements: ["bottom", "left", "right"] }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 80, close: 80 },
    handleClose: safePolygon({ buffer: 2 }),
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        className={className}
        style={style}
        aria-current={isActive ? "true" : undefined}
        aria-label={ariaLabel}
        aria-expanded={open}
        {...getReferenceProps()}
      >
        {children}
      </button>
      {open ? (
        <FloatingPortal id="floating-portal-location-slot-hover">
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 200 }}
            className="pointer-events-none w-max min-w-[11rem] max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] leading-relaxed text-slate-700 shadow-lg"
            {...getFloatingProps()}
          >
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
