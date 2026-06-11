import { PackagePlus } from "lucide-react";

import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";

export type RmzPendingAddItem = {
  orderItemId: number;
  productId: number;
  productName: string;
  imageUrl: string | null;
  orderQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
};

type Props = {
  items: RmzPendingAddItem[];
  addingOrderItemId: number | null;
  disabled?: boolean;
  onAdd: (item: RmzPendingAddItem) => void;
};

export function RmzPendingItemsPanel({ items, addingOrderItemId, disabled = false, onAdd }: Props) {
  return (
    <section className="flex max-h-[42vh] min-h-[140px] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <PackagePlus size={16} className="text-slate-700" aria-hidden />
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">DO DODANIA</h2>
      </header>
      <ul className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 ? (
          <li className="py-4 text-center text-xs text-slate-500">Wszystkie pozycje zamówienia są już w RMZ.</li>
        ) : (
          items.map((item) => {
            const busy = addingOrderItemId === item.orderItemId;
            const img = item.imageUrl ? resolveDamageMediaUrl(item.imageUrl) : "";
            return (
              <li key={item.orderItemId}>
                <button
                  type="button"
                  disabled={disabled || busy || addingOrderItemId != null}
                  onClick={() => onAdd(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/90 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {img ? (
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">—</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{item.productName}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Dostępne:{" "}
                      <span className="font-semibold tabular-nums text-blue-700">{item.remainingQuantity}</span>
                      {" · "}
                      w zamówieniu: <span className="tabular-nums">{item.orderQuantity}</span>
                    </p>
                  </div>
                  {busy ? (
                    <span className="shrink-0 text-xs font-bold uppercase text-blue-700">…</span>
                  ) : null}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
