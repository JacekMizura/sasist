import type { CSSProperties } from "react";

import {
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_SELECT,
  formatPreviewDimsCompact,
  type RackLayoutCell,
} from "./consolidationRackPreviewLayout";
import { computeCapacityDm3 } from "./rackLayoutUtils";
import type { RackLayoutCellRenderContext } from "./ConsolidationRackRenderer";

type OmsCellProps = {
  cell: RackLayoutCell;
  ctx: RackLayoutCellRenderContext;
  isSelected: boolean;
};

export function RackLayoutOmsCellContent({ cell, ctx, isSelected }: OmsCellProps) {
  const dims = formatPreviewDimsCompact(cell.widthMm, cell.depthMm, cell.heightMm);
  const cap = cell.capacityDm3 ?? computeCapacityDm3(cell.depthMm, cell.widthMm, cell.heightMm);
  const isCompact = ctx.cellCount >= 10 || ctx.bandHeightPx < 56;
  const isMedium = !isCompact && (ctx.cellCount >= 6 || ctx.bandHeightPx < 72);

  return (
    <>
      <span className="w-full truncate font-sans text-sm font-extrabold leading-tight text-slate-900">
        {cell.label}
      </span>
      {isCompact ? (
        <span className="mt-0.5 font-sans text-[8px] tabular-nums leading-tight text-slate-600">
          {dims}
        </span>
      ) : isMedium ? (
        <span className="mt-0.5 font-sans text-[9px] tabular-nums text-slate-600">{dims}</span>
      ) : (
        <>
          <span className="mt-0.5 font-sans text-[10px] tabular-nums text-slate-600">
            SZ {Math.round(cell.widthMm)}
          </span>
          <span className="font-sans text-[10px] tabular-nums text-slate-600">
            GŁ {Math.round(cell.depthMm)}
          </span>
          <span className="font-sans text-[10px] tabular-nums text-slate-600">
            WYS {Math.round(cell.heightMm)}
          </span>
          {cap != null ? (
            <span className="font-sans text-[9px] font-semibold tabular-nums text-violet-800">
              {cap.toFixed(0)} dm³
            </span>
          ) : null}
        </>
      )}
    </>
  );
}

export function omsCellContainerStyle(isSelected: boolean): CSSProperties {
  let borderColor = CONSOLIDATION_PREVIEW_CELL.border;
  let borderWidth = 1.5;
  if (isSelected) {
    borderColor = CONSOLIDATION_PREVIEW_SELECT.segmentBorder;
    borderWidth = CONSOLIDATION_PREVIEW_SELECT.segmentBorderWidth;
  }
  return {
    backgroundColor: isSelected ? "#fff7ed" : CONSOLIDATION_PREVIEW_CELL.bg,
    border: `${borderWidth}px solid ${borderColor}`,
  };
}

type WmsCellProps = {
  cell: RackLayoutCell;
  ctx: RackLayoutCellRenderContext;
  orderNumber?: string | null;
  fillPercent?: number;
  estimatedItemsCount?: number;
  stateLabel?: string;
  capacityDm3?: number | null;
  compact?: boolean;
  showOverrideDot?: boolean;
};

export function RackLayoutWmsCellContent({
  cell,
  ctx,
  orderNumber,
  fillPercent,
  estimatedItemsCount,
  stateLabel,
  capacityDm3,
  compact = false,
  showOverrideDot = false,
}: WmsCellProps) {
  const cap = capacityDm3 ?? cell.capacityDm3;
  const isCompact = compact || ctx.cellCount >= 10 || ctx.bandHeightPx < 56;

  return (
    <>
      {showOverrideDot ? (
        <span
          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-violet-600"
          title="Nadpisany profil segmentu"
        />
      ) : null}
      <span className={`w-full truncate font-mono font-bold leading-tight ${isCompact ? "text-[10px]" : "text-xs"}`}>
        {cell.label}
      </span>
      {stateLabel && !isCompact ? (
        <span className="mt-0.5 text-[9px] font-medium opacity-80">{stateLabel}</span>
      ) : null}
      {cap != null && !isCompact ? (
        <span className="mt-0.5 font-mono text-[8px] opacity-60 tabular-nums">{cap.toFixed(0)} dm³</span>
      ) : null}
      {orderNumber ? (
        <span className="mt-0.5 max-w-full truncate text-[10px] font-semibold">{orderNumber}</span>
      ) : null}
      {fillPercent != null && fillPercent > 0 && !orderNumber ? (
        <span className="mt-0.5 text-[9px] tabular-nums opacity-70">{Math.round(fillPercent)}%</span>
      ) : null}
      {estimatedItemsCount != null && estimatedItemsCount > 0 && !isCompact ? (
        <span className="mt-0.5 text-[8px] tabular-nums opacity-70">{estimatedItemsCount} szt.</span>
      ) : null}
    </>
  );
}
