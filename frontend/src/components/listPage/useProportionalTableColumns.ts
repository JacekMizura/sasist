import { useLayoutEffect, useRef, useState } from "react";

import {
  computeProportionalTableWidths,
  proportionalTableMinWidthPx,
  type ProportionalTableWidths,
} from "./proportionalTableColumns";

export function useProportionalTableColumns(dynamicColumnCount: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const minWidthPx = proportionalTableMinWidthPx(dynamicColumnCount);

  const [widths, setWidths] = useState<ProportionalTableWidths>(() =>
    computeProportionalTableWidths(minWidthPx, dynamicColumnCount),
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const measured = el.clientWidth > 0 ? el.clientWidth : minWidthPx;
      setWidths(computeProportionalTableWidths(Math.max(measured, minWidthPx), dynamicColumnCount));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [dynamicColumnCount, minWidthPx]);

  return { containerRef, widths, minWidthPx };
}
