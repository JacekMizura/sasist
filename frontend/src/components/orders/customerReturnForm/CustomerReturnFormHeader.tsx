import {
  customerReturnCustomerName,
  customerReturnFormatDate,
} from "./customerReturnFormUtils";
import type { CustomerReturnOrderLite } from "./customerReturnFormTypes";

type Props = {
  order: CustomerReturnOrderLite;
  draftBadge: "draft" | "new";
};

export function CustomerReturnFormHeader({ order, draftBadge }: Props) {
  const customerName = customerReturnCustomerName(order);
  const orderNo = order.number ?? String(order.id);
  const purchaseDate = customerReturnFormatDate(order.order_date ?? order.created_at);
  const deliveryDate = customerReturnFormatDate(order.wms_packed_at);

  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Formularz zwrotu
        </h1>
        <p className="mt-2 text-base text-slate-600 md:text-lg">
          Zwrot do zamówienia <span className="font-semibold text-slate-800">#{orderNo}</span>
        </p>

        <dl className="mt-5 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Klient</dt>
            <dd className="mt-0.5 font-medium text-slate-800">{customerName}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Numer zamówienia
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-800">#{orderNo}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Data zakupu
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-800">{purchaseDate}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Data dostawy
            </dt>
            <dd className="mt-0.5 font-medium tabular-nums text-slate-800">{deliveryDate}</dd>
          </div>
        </dl>
      </div>

      <span
        className={`inline-flex h-7 shrink-0 items-center self-start rounded-full border px-2.5 text-[11px] font-semibold ${
          draftBadge === "draft"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        {draftBadge === "draft" ? "Roboczy" : "Nowe zgłoszenie"}
      </span>
    </header>
  );
}
