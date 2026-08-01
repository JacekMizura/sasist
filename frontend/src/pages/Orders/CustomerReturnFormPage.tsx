import { Link, useParams } from "react-router-dom";

import {
  CustomerReturnFormView,
  useCustomerReturnForm,
} from "../../components/orders/customerReturnForm";

/**
 * Customer return form — standalone route `/orders/:id/customer-return-form`.
 * Operator create stays in Order Panel (`OrderCaseCreateView`).
 */
export default function CustomerReturnFormPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = Number(id);
  const form = useCustomerReturnForm(orderId);

  if (form.loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-white text-sm text-slate-500">
        Ładowanie formularza…
      </div>
    );
  }

  if (!form.order) {
    return (
      <div className="mx-auto max-w-lg bg-white px-4 py-16 text-center">
        <p className="text-sm text-red-600">{form.err || "Nie znaleziono zamówienia."}</p>
        <Link to="/orders/list" className="mt-4 inline-block text-sm font-semibold text-slate-800 hover:underline">
          Wróć do listy
        </Link>
      </div>
    );
  }

  return (
    <CustomerReturnFormView
      order={form.order}
      catalog={form.catalog}
      lines={form.lines}
      meta={form.meta}
      shippingCost={form.shippingCost}
      saleDocumentLabel={form.saleDocumentLabel}
      submitting={form.submitting}
      error={form.err}
      onAdd={form.onAdd}
      onRemove={form.onRemove}
      onPatch={form.onPatch}
      onChangeMeta={form.onChangeMeta}
      onSubmit={() => void form.submit()}
    />
  );
}
