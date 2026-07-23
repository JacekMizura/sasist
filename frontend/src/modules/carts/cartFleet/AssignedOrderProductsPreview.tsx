import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { ProductThumb } from "../../../components/orders/panelList/ProductThumb";
import { HoverPopover } from "../../../components/ui/HoverPopover";

export type AssignedOrderProductPreview = {
  product_id?: number | null;
  name: string;
  quantity: number;
  sku?: string | null;
  symbol?: string | null;
  ean?: string | null;
  image_url?: string | null;
};

function firstImageUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  return url.split(";")[0]?.trim() || null;
}

function ProductRows({
  products,
  variant,
  expanded,
  onExpand,
  onProductClick,
}: {
  products: AssignedOrderProductPreview[];
  variant: "summary" | "detail";
  expanded: boolean;
  onExpand: () => void;
  onProductClick?: (productId: number) => void;
}) {
  const initial = variant === "summary" ? 3 : products.length;
  const visible = expanded ? products : products.slice(0, initial);
  const hidden = Math.max(0, products.length - visible.length);

  if (!products.length) {
    return <p className="text-xs text-slate-500">Brak pozycji.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {visible.map((p, i) => {
        const pid = p.product_id != null ? Number(p.product_id) : null;
        const clickable = pid != null && pid > 0 && onProductClick != null;
        const symbol = (p.symbol || p.sku || "").trim();
        const ean = (p.ean || "").trim();
        const body = (
          <>
            <ProductThumb url={firstImageUrl(p.image_url)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900">{p.name}</p>
              {variant === "detail" ? (
                <div className="mt-0.5 space-y-0.5 text-[11px] text-slate-500">
                  {ean ? <p>EAN: {ean}</p> : null}
                  {symbol ? <p>Symbol: {symbol}</p> : null}
                  <p>Ilość: {p.quantity}</p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">Ilość: {p.quantity}</p>
              )}
            </div>
          </>
        );
        return (
          <li key={`${pid ?? p.name}-${i}`}>
            {clickable ? (
              <button
                type="button"
                className="flex w-full items-start gap-2.5 rounded-md text-left transition hover:bg-slate-50"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onProductClick(pid);
                }}
              >
                {body}
              </button>
            ) : (
              <div className="flex items-start gap-2.5">{body}</div>
            )}
          </li>
        );
      })}
      {hidden > 0 ? (
        <li>
          <button
            type="button"
            className="text-[12px] font-semibold text-sky-700 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onExpand();
            }}
          >
            + {hidden} {hidden === 1 ? "produkt" : hidden < 5 ? "produkty" : "produktów"}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export function AssignedOrderProductsPreview({
  products,
  variant,
  header,
  interactiveProducts = false,
}: {
  products: AssignedOrderProductPreview[];
  variant: "summary" | "detail";
  header?: ReactNode;
  interactiveProducts?: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(variant === "detail");

  return (
    <div className="space-y-2.5">
      {header}
      <div className="max-h-[min(16rem,55vh)] overflow-y-auto pr-0.5">
        <ProductRows
          products={products}
          variant={variant}
          expanded={expanded}
          onExpand={() => setExpanded(true)}
          onProductClick={
            interactiveProducts
              ? (productId) => navigate(`/products/${productId}`)
              : undefined
          }
        />
      </div>
    </div>
  );
}

export function AssignedOrderHoverAnchor({
  children,
  content,
  className,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
}) {
  return (
    <HoverPopover interactive content={content} className={className}>
      {children}
    </HoverPopover>
  );
}
