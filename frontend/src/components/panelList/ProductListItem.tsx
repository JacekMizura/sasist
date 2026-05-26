import type { ReactNode } from "react";

import { ProductThumb } from "../orders/panelList/ProductThumb";

/** Same shape as order list „Produkty” preview lines — source of truth for dense panel tables. */
export type ProductListItemLine = {
  quantity: number;
  name?: string | null;
  ean?: string | null;
  sku?: string | null;
  image_url?: string | null;
};

/** Semicolon-separated image URLs from API → first usable URL (matches Orders list behavior). */
export function firstProductImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const first = url
    .trim()
    .split(";")
    .map((s) => s.trim())
    .find(Boolean);
  return first || null;
}

export type ProductListItemProps = {
  product: ProductListItemLine;
  /** Rendered below the EAN/SKU line (e.g. complaint defects). */
  extra?: ReactNode;
};

/**
 * Single product row — **identical** markup to {@link PanelListDenseProductCell} / Order list „Produkty”:
 * `ProductThumb` sm (`h-10 w-10`), `gap-2`, title `text-sm font-medium text-slate-900`, meta `text-xs text-slate-500`, `leading-tight`.
 */
export function ProductListItem({ product, extra }: ProductListItemProps) {
  const ean = product.ean?.trim();
  const sku = product.sku?.trim();
  const meta = [ean ? `EAN ${ean}` : null, sku ? `SKU ${sku}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-start gap-2">
      <ProductThumb url={firstProductImageUrl(product.image_url ?? null)} size="sm" />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-medium text-slate-900">
          <span className="tabular-nums">{product.quantity}×</span> {product.name ?? "—"}
        </span>
        {meta ? (
          <span className="block whitespace-normal break-words text-xs text-slate-500">{meta}</span>
        ) : null}
        {extra}
      </span>
    </div>
  );
}
