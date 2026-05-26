import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Floating hover preview — renders in ``document.body`` so scroll parents cannot clip it. */
export function HoverPopover({
  children,
  content,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  const readRect = () => {
    const el = anchorRef.current;
    if (!el) return;
    setAnchorRect(el.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    if (!open) return;
    readRect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => readRect();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const show = () => {
    window.clearTimeout(hideTimer.current);
    readRect();
    setOpen(true);
  };
  const hide = () => {
    hideTimer.current = window.setTimeout(() => {
      setOpen(false);
      setAnchorRect(null);
    }, 140);
  };

  const tooltipStyle =
    anchorRect != null
      ? ((): CSSProperties => {
          const minW = 220;
          const maxW = 340;
          const margin = 8;
          const centerX = anchorRect.left + anchorRect.width / 2;
          let left = centerX - minW / 2;
          left = Math.max(margin, Math.min(left, window.innerWidth - minW - margin));
          const aboveTop = anchorRect.top - margin;
          return {
            position: "fixed",
            left,
            top: Math.max(margin, aboveTop),
            transform: "translateY(-100%)",
            minWidth: minW,
            maxWidth: maxW,
            zIndex: 200,
          };
        })()
      : undefined;

  const tooltip =
    open && anchorRect && tooltipStyle ? (
      <div
        role="tooltip"
        style={tooltipStyle}
        className="pointer-events-none max-h-[min(18rem,70vh)] overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-xs leading-relaxed text-slate-800 shadow-lg ring-1 ring-slate-200/60 [overflow-wrap:anywhere] [word-break:break-word]"
      >
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    ) : null;

  return (
    <span
      ref={anchorRef}
      className={`relative inline-flex max-w-none ${className ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {tooltip != null ? createPortal(tooltip, document.body) : null}
    </span>
  );
}
