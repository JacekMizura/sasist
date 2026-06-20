import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  computeProportionalTableWidths,
  proportionalTableMinWidthPx,
  type ProportionalTableLayoutConfig,
  type ProportionalTableWidths,
} from "./proportionalTableColumns";

export type ProportionalTableLayoutState = {
  widths: ProportionalTableWidths;
  contentMinWidthPx: number;
  needsHorizontalScroll: boolean;
};

export function useProportionalTableColumns(
  dynamicColumnCount: number,
  layoutConfig?: Partial<ProportionalTableLayoutConfig>,
): ProportionalTableLayoutState & {
  containerRef: RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutKey = useMemo(() => JSON.stringify(layoutConfig ?? {}), [layoutConfig]);
  const contentMinWidthPx = proportionalTableMinWidthPx(dynamicColumnCount, layoutConfig);

  const [state, setState] = useState<ProportionalTableLayoutState>(() => {
    const widths = computeProportionalTableWidths(contentMinWidthPx, dynamicColumnCount, layoutConfig);
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
        widths: computeProportionalTableWidths(layoutWidth, dynamicColumnCount, layoutConfig),
        contentMinWidthPx,
        needsHorizontalScroll,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dynamicColumnCount, contentMinWidthPx, layoutKey, layoutConfig]);

  return { containerRef, ...state };
}
