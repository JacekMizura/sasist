import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  applyWmsTypographyCssVars,
  WMS_TYPO_CSS_VARS,
} from "./wmsOperatorTypography";
import { useWmsOperatorTypography } from "./WmsOperatorTypographyProvider";

/**
 * Applies warehouse typography CSS variables to a root element.
 * Base font-size is set so descendants inherit unless overridden (location/qty classes).
 */
export function WmsOperatorTypographyRoot({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { typography } = useWmsOperatorTypography();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyWmsTypographyCssVars(ref.current, typography);
  }, [typography]);

  const style: CSSProperties = {
    [WMS_TYPO_CSS_VARS.base]: `${typography.fontSizeBasePx}px`,
    [WMS_TYPO_CSS_VARS.location]: `${typography.fontSizeLocationPx}px`,
    [WMS_TYPO_CSS_VARS.quantity]: `${typography.fontSizeQuantityPx}px`,
    fontSize: `var(${WMS_TYPO_CSS_VARS.base}, 16px)`,
  } as CSSProperties;

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
