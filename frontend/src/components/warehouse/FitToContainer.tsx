/**
 * Scales and centers children so the full content bounding box fits the viewport.
 * transform-origin top-left + translate after scale = scale about content bbox, then center.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Re-measure when structure changes (levels × locations). */
  measureKey: string;
  className?: string;
};

export function FitToContainer({ children, measureKey, className }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, tx: 0, ty: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const measure = () => {
      // Measure natural (untransformed) size.
      content.style.transform = "none";
      const pad = 8;
      const vw = Math.max(1, viewport.clientWidth - pad * 2);
      const vh = Math.max(1, viewport.clientHeight - pad * 2);
      const bw = Math.max(1, content.scrollWidth, content.offsetWidth);
      const bh = Math.max(1, content.scrollHeight, content.offsetHeight);
      const scale = Math.min(1, vw / bw, vh / bh);
      const tx = pad + (vw - bw * scale) / 2;
      const ty = pad + (vh - bh * scale) / 2;
      setFit({ scale, tx, ty });
      content.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    ro.observe(content);
    return () => ro.disconnect();
  }, [measureKey]);

  return (
    <div
      ref={viewportRef}
      className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${className ?? ""}`}
      data-testid="fit-to-container-viewport"
    >
      <div
        ref={contentRef}
        className="absolute left-0 top-0 will-change-transform"
        style={{
          transformOrigin: "0 0",
          transform: `translate(${fit.tx}px, ${fit.ty}px) scale(${fit.scale})`,
        }}
        data-testid="fit-to-container-content"
      >
        {children}
      </div>
    </div>
  );
}
