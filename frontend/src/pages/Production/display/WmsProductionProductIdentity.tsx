import type { ReactNode } from "react";

import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { ProductThumb } from "../components/ProductThumb";
import {
  resolveWmsProductionProductIdentity,
  type WmsProductionProductIdentityInput,
} from "./productionTerminalDisplay";

type Props = {
  display: ProductionTerminalDisplaySettings;
  product: WmsProductionProductIdentityInput;
  /** Thumb size for queue / header cards. */
  thumbSize?: "sm" | "md" | "lg";
  /** Extra class on the outer flex row. */
  className?: string;
  /** Title size for product name. */
  nameClassName?: string;
  /** Meta line (SKU · EAN) class. */
  metaClassName?: string;
  children?: ReactNode;
};

/**
 * Shared WMS Produkcja product identity block driven by `terminal_display`.
 * Image OFF removes the thumb entirely (no empty column).
 */
export function WmsProductionProductIdentity({
  display,
  product,
  thumbSize = "lg",
  className = "",
  nameClassName = "text-base font-semibold leading-snug text-slate-800",
  metaClassName = "mt-1 font-mono text-sm text-slate-500",
  children,
}: Props) {
  const resolved = resolveWmsProductionProductIdentity(display, product);
  const hasText = resolved.showName || resolved.metaLine != null || children != null;

  if (!resolved.showImage && !hasText) return null;

  return (
    <div className={`flex min-w-0 gap-4 ${className}`.trim()}>
      {resolved.showImage ? (
        <ProductThumb
          imageUrl={resolved.imageUrl}
          name={resolved.name ?? product.name ?? undefined}
          size={thumbSize}
          className="self-start"
        />
      ) : null}
      {hasText ? (
        <div className="min-w-0 flex-1">
          {resolved.showName && resolved.name ? (
            <p className={`line-clamp-2 ${nameClassName}`}>{resolved.name}</p>
          ) : null}
          {resolved.metaLine ? <p className={metaClassName}>{resolved.metaLine}</p> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
