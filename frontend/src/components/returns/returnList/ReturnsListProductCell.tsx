import { memo, useState } from "react";
import type { ReactNode } from "react";

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
  more: number;
};

function ReturnsListProductCellInner({ lines, more }: ReturnsListProductCellProps) {
  const preview = lines.slice(0, 2);
  if (preview.length === 0) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {preview.map((item, idx) => (
          <li key={idx} className="min-w-0">
            <ReturnsListProductItem product={item} />
          </li>
        ))}
      </ul>
      {more > 0 ? <span className="mt-1 block text-xs text-slate-500">+ {more} poz.</span> : null}
    </>
  );
}

export const ReturnsListProductCell = memo(ReturnsListProductCellInner);
