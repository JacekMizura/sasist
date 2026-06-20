import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  computeProportionalTableWidths,
  proportionalTableMinWidthPx,
  type ProportionalTableWidths,
} from "./proportionalTableColumns";

export type ProportionalTableLayoutState = {
  widths: ProportionalTableWidths;
  /** Minimalna szerokość treści — scroll tylko gdy przekracza kontener. */
  contentMinWidthPx: number;
  needsHorizontalScroll: boolean;
};

export function useProportionalTableColumns(dynamicColumnCount: number): ProportionalTableLayoutState & {
  containerRef: RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentMinWidthPx = proportionalTableMinWidthPx(dynamicColumnCount);

  const [state, setState] = useState<ProportionalTableLayoutState>(() => {
    const widths = computeProportionalTableWidths(contentMinWidthPx, dynamicColumnCount);
    return { widths, contentMinWidthPx, needsHorizontalScroll: false };
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const containerWidth = el.clientWidth;
      if (containerWidth <= 0) return;

      const needsHorizontalScroll = contentMinWidthPx > containerWidth;
      const layoutWidth = needsHorizontalScroll ? contentMinWidthPx : containerWidth;

      setState({
        widths: computeProportionalTableWidths(layoutWidth, dynamicColumnCount),
        contentMinWidthPx,
        needsHorizontalScroll,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dynamicColumnCount, contentMinWidthPx]);

  return { containerRef, ...state };
}
