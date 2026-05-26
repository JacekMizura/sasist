import type { ReactNode } from "react";

import { ProductThumb } from "./ProductThumb";

export type PanelListProductLine = {
  quantity: number;
  name?: string | null;
  ean?: string | null;
  sku?: string | null;
  imageUrl?: string | null;
};

function firstImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const first = imageUrl.trim().split(";").map((s) => s.trim()).find(Boolean);
  return first || null;
}

export type PanelListProductLinesProps = {
  products: PanelListProductLine[];
  /** Domyślnie jak ``products`` — pełna lista do popupu „+N poz.” (wszystkie aktywne linie). */
  tooltipProducts?: PanelListProductLine[];
  moreCount: number;
  positionCount?: number;
  totalItems?: number;
  /** Rendered below SKU/EAN lines for a row (e.g. defect tags, reason). */
  lineExtra?: (item: PanelListProductLine, idx: number) => ReactNode;
};

export function PanelListProductLines({
  products,
  tooltipProducts,
  moreCount,
  positionCount,
  totalItems,
  lineExtra,
}: PanelListProductLinesProps) {
  if (products.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {(positionCount ?? 0) > 0
          ? `${positionCount} poz.${totalItems != null ? ` · ${totalItems} szt.` : ""}`
          : "Brak pozycji"}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {products.map((item, idx) => {
        const img = firstImageUrl(item.imageUrl ?? undefined);
        const ean = item.ean?.trim() || null;
        const sku = item.sku?.trim() || null;
        return (
          <li key={idx} className="flex min-w-0 items-start gap-3">
            <ProductThumb url={img} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[15px] font-semibold leading-snug text-slate-900">
                <span className="font-extrabold tabular-nums text-slate-800">{item.quantity}×</span>{" "}
                <span className="break-words">{item.name ?? "—"}</span>
              </p>
              {ean ? (
                <p className="mt-1 font-mono text-xs font-medium tracking-wide text-slate-600">EAN {ean}</p>
              ) : null}
              {sku && sku !== ean ? <p className="mt-0.5 text-xs text-slate-500">SKU {sku}</p> : null}
              {lineExtra?.(item, idx)}
            </div>
          </li>
        );
      })}
      {moreCount > 0 ? (
        <li className="group/poz relative pl-[4.75rem]">
          <span className="cursor-default border-b border-dotted border-slate-400 text-xs font-medium text-slate-600">
            +{moreCount} poz.
          </span>
          <div
            className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-2 shadow-lg opacity-0 transition-opacity group-hover/poz:pointer-events-auto group-hover/poz:visible group-hover/poz:opacity-100"
            role="tooltip"
          >
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Wszystkie pozycje</p>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm text-slate-800">
              {(tooltipProducts && tooltipProducts.length ? tooltipProducts : products).map((row, j) => (
                <li key={j} className="leading-snug">
                  <span className="font-semibold tabular-nums text-slate-700">{row.quantity}×</span>{" "}
                  <span className="break-words">{row.name ?? "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ) : null}
    </ul>
  );
}
