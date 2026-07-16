import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  useHover,
  useInteractions,
  safePolygon,
} from "@floating-ui/react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export type CartOrderPreviewProduct = {
  name: string;
  quantity: number;
};

export type CartOrderPreview = {
  exists: boolean;
  order_id?: number | null;
  number?: string | null;
  customer_name?: string | null;
  status?: string | null;
  products?: CartOrderPreviewProduct[];
  missing_label?: string | null;
};

type Props = {
  orders: CartOrderPreview[];
  children: ReactNode;
  className?: string;
};

/**
 * Hover popover for cart order count — list with customer, status, products.
 * Clickable rows navigate to `/orders/:id`. Keeps on-screen via Floating UI flip/shift.
 */
export function CartOrdersHoverPopover({ orders, children, className = "" }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
      shift({ padding: 12 }),
    ],
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 120, close: 120 },
    handleClose: safePolygon({ buffer: 4 }),
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

  const openOrder = (orderId: number | null | undefined) => {
    if (orderId == null || orderId < 1) return;
    navigate(`/orders/${orderId}`);
  };

  return (
    <>
      <span
        ref={refs.setReference}
        className={`inline-flex cursor-help border-b border-dotted border-slate-400 ${className}`}
        {...getReferenceProps()}
      >
        {children}
      </span>
      {open ? (
        <FloatingPortal id="floating-portal-cart-orders-hover">
          <div
            ref={refs.setFloating}
            style={{ ...floatingStyles, zIndex: 220 }}
            className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            {...getFloatingProps()}
          >
            <div className="border-b border-slate-100 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Zamówienia na wózku
              </p>
            </div>
            <div className="max-h-[500px] overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin]">
              {orders.length === 0 ? (
                <p className="px-2 py-4 text-center text-sm text-slate-500">Brak przypisanych zamówień</p>
              ) : (
                <ul className="space-y-2">
                  {orders.map((o, idx) => {
                    if (!o.exists) {
                      return (
                        <li
                          key={`missing-${o.order_id ?? idx}`}
                          className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-sm text-amber-900"
                        >
                          {o.missing_label || "Zamówienie nie istnieje"}
                        </li>
                      );
                    }
                    const products = o.products ?? [];
                    return (
                      <li key={o.order_id ?? idx}>
                        <button
                          type="button"
                          onClick={() => openOrder(o.order_id)}
                          className="w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50/60"
                        >
                          <p className="font-mono text-sm font-semibold text-slate-900">
                            #{o.number || o.order_id}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-slate-700">
                            {(o.customer_name || "").trim() || "—"}
                          </p>
                          {o.status ? (
                            <p className="mt-0.5 text-[11px] font-medium text-slate-500">{o.status}</p>
                          ) : null}
                          {products.length > 0 ? (
                            <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
                              {products.map((p, i) => (
                                <li key={`${p.name}-${i}`} className="text-xs text-slate-700">
                                  <span className="text-slate-400">–</span> {p.name}{" "}
                                  <span className="font-semibold tabular-nums">x{p.quantity}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-[11px] text-slate-400">Brak pozycji</p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
