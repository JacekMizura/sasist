import type { ReactNode } from "react";

import { ProductListItem, type ProductListItemLine } from "./ProductListItem";

/** Alias for {@link ProductListItemLine} — dense „Produkty” column rows. */
export type PanelListDenseProductLine = ProductListItemLine;

export type PanelListDenseProductCellProps = {
  lines: ProductListItemLine[];
  more: number;
  /** Orders-only: WMS shortage chip. */
  wmsMissingLineCount?: number;
  lineExtra?: (item: ProductListItemLine, idx: number) => ReactNode;
};

/**
 * Product preview column — composes {@link ProductListItem} (same as Order list „Produkty”).
 */
export function PanelListDenseProductCell({
  lines,
  more,
  wmsMissingLineCount = 0,
  lineExtra,
}: PanelListDenseProductCellProps) {
  const preview = lines.slice(0, 2);
  if (preview.length === 0) {
    return <span className="text-sm text-slate-400">—</span>;
  }
  return (
    <>
      <ul className="flex flex-col gap-1">
        {preview.map((item, idx) => (
          <li key={idx} className="min-w-0">
            <ProductListItem product={item} extra={lineExtra?.(item, idx)} />
          </li>
        ))}
      </ul>
      {more > 0 ? <span className="mt-0.5 block text-xs text-slate-500">+ {more} poz.</span> : null}
      {wmsMissingLineCount > 0 ? (
        <span className="mt-0.5 inline-flex rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-900">
          Braki
        </span>
      ) : null}
    </>
  );
}
