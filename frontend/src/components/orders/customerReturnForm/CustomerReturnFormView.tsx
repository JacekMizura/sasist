import { Link } from "react-router-dom";

import { CustomerReturnFormHeader } from "./CustomerReturnFormHeader";
import { CustomerReturnProductCard } from "./CustomerReturnProductCard";
import { CustomerReturnSummaryPanel } from "./CustomerReturnSummaryPanel";
import type {
  CustomerReturnCatalogRow,
  CustomerReturnLineDraft,
  CustomerReturnMeta,
  CustomerReturnOrderLite,
} from "./customerReturnFormTypes";

type Props = {
  order: CustomerReturnOrderLite;
  catalog: CustomerReturnCatalogRow[];
  lines: CustomerReturnLineDraft[];
  meta: CustomerReturnMeta;
  shippingCost: number;
  saleDocumentLabel: string;
  submitting: boolean;
  error: string | null;
  onAdd: (orderItemId: number) => void;
  onRemove: (orderItemId: number) => void;
  onPatch: (orderItemId: number, patch: Partial<CustomerReturnLineDraft>) => void;
  onChangeMeta: (patch: Partial<CustomerReturnMeta>) => void;
  onSubmit: () => void;
};

/**
 * Customer-facing return form layout — separate page, simplified vs operator create.
 */
export function CustomerReturnFormView({
  order,
  catalog,
  lines,
  meta,
  shippingCost,
  saleDocumentLabel,
  submitting,
  error,
  onAdd,
  onRemove,
  onPatch,
  onChangeMeta,
  onSubmit,
}: Props) {
  const lineById = new Map(lines.map((l) => [l.orderItemId, l]));
  const draftBadge = lines.length > 0 ? "draft" : "new";
  const statusLabel = lines.length > 0 ? "Roboczy" : "Nowe zgłoszenie";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 md:py-10 lg:px-10">
        <CustomerReturnFormHeader order={order} draftBadge={draftBadge} />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(260px,3fr)] lg:items-start lg:gap-10">
          <section className="min-w-0 space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Produkty z zamówienia</h2>
                <p className="mt-1 text-[13px] text-slate-500">
                  Wybierz produkty do zwrotu. Po dodaniu uzupełnij ilość, powód i stan.
                </p>
              </div>
              <Link
                to={`/orders/${order.id}`}
                className="hidden shrink-0 text-[13px] font-medium text-slate-500 hover:text-slate-800 sm:inline"
              >
                Anuluj
              </Link>
            </div>

            {catalog.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center text-[13px] text-slate-500">
                Brak produktów możliwych do zwrotu w tym zamówieniu.
              </p>
            ) : (
              catalog.map((row) => (
                <CustomerReturnProductCard
                  key={row.orderItemId}
                  row={row}
                  draft={lineById.get(row.orderItemId)}
                  onAdd={() => onAdd(row.orderItemId)}
                  onRemove={() => onRemove(row.orderItemId)}
                  onPatch={(patch) => onPatch(row.orderItemId, patch)}
                />
              ))
            )}
          </section>

          <CustomerReturnSummaryPanel
            lines={lines}
            meta={meta}
            shippingCost={shippingCost}
            saleDocumentLabel={saleDocumentLabel}
            statusLabel={statusLabel}
            submitting={submitting}
            error={error}
            onChangeMeta={onChangeMeta}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </div>
  );
}
