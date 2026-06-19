import { memo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import { firstProductImageUrl, type ProductListItemLine } from "../../panelList/ProductListItem";

const THUMB_CLASS = "h-[60px] w-[60px] min-h-[60px] min-w-[60px] shrink-0";

function ReturnsListProductThumb({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <div className={`${THUMB_CLASS} flex items-center justify-center rounded-md bg-slate-100/70`} aria-hidden>
        <svg className="h-7 w-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`${THUMB_CLASS} rounded-md object-contain transition-opacity hover:opacity-90`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

function ReturnsListProductItem({ product, extra }: { product: ProductListItemLine; extra?: ReactNode }) {
  const ean = product.ean?.trim();
  const sku = product.sku?.trim();
  const meta = [ean ? `EAN ${ean}` : null, sku ? `SKU ${sku}` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <ReturnsListProductThumb url={firstProductImageUrl(product.image_url ?? null)} />
      <span className="min-w-0 leading-snug">
        <span className="block text-sm font-semibold text-slate-900">
          <span className="tabular-nums font-medium text-slate-700">{product.quantity}×</span>{" "}
          {product.name ?? "—"}
        </span>
        {meta ? (
          <span className="mt-0.5 block whitespace-normal break-words text-xs text-slate-400">{meta}</span>
        ) : null}
        {extra}
      </span>
    </div>
  );
}

export type ReturnsListProductCellProps = {
  lines: ProductListItemLine[];
  /** Ile pozycji pokazać przed rozwinięciem (domyślnie 2). */
  collapsedCount?: number;
  /** Treść pod listą produktów (np. tagi usterek reklamacji). */
  trailing?: ReactNode;
  /** Domyślnie rozwinięte (np. mockup / screenshot). */
  initialExpanded?: boolean;
};

function ReturnsListProductCellInner({
  lines,
  collapsedCount = 2,
  trailing,
  initialExpanded = false,
}: ReturnsListProductCellProps) {
  const [expanded, setExpanded] = useState(initialExpanded);

  if (lines.length === 0) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const hiddenCount = Math.max(0, lines.length - collapsedCount);
  const visibleLines = expanded ? lines : lines.slice(0, collapsedCount);

  const toggleExpanded = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ul className="flex flex-col gap-2">
        {visibleLines.map((item, idx) => (
          <li key={`${item.sku ?? ""}-${item.ean ?? ""}-${item.name ?? idx}`} className="min-w-0">
            <ReturnsListProductItem product={item} />
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          onClick={toggleExpanded}
          aria-expanded={expanded}
        >
          {expanded ? "Zwiń ▲" : `+ ${hiddenCount} poz. ▼`}
        </button>
      ) : null}
      {trailing}
    </div>
  );
}

export const ReturnsListProductCell = memo(ReturnsListProductCellInner);
